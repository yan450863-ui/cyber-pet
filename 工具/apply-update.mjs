import { readFileSync, writeFileSync, existsSync, lstatSync, realpathSync, mkdirSync, renameSync, unlinkSync, openSync, closeSync } from 'node:fs';
import { resolve, join, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const allowed = p => p.startsWith('插件/dsh-bili-scroll/') || p.startsWith('resources/app/lib/') || ['LICENSE', 'LICENSE-SCOPE.md', 'THIRD_PARTY_NOTICES.md'].includes(p);
export function safePath(root, path, restrict = true) {
  if (typeof path !== 'string' || !path || /[\\:\x00-\x1f]/.test(path) || path.split('/').some(p => !p || p === '.' || p === '..' || /[. ]$/.test(p)) || (restrict && !allowed(path))) throw Error('更新路径不允许：' + path);
  const base = realpathSync(root), target = resolve(base, ...path.split('/'));
  if (!target.startsWith(base + sep)) throw Error('路径超出软件目录');
  let part = base;
  for (const name of path.split('/')) {
    part = join(part, name);
    if (existsSync(part) || (() => { try { lstatSync(part); return true; } catch { return false; } })()) {
      if (lstatSync(part).isSymbolicLink()) throw Error('更新位置包含目录链接：' + path);
    }
  }
  return target;
}
function fileHash(path) { return existsSync(path) ? digest(readFileSync(path)) : null; }
function assertClosed(root) {
  if (process.platform !== 'win32') return;
  const script = '$p=[Console]::In.ReadToEnd(); $busy=@(Get-Process -Name "DSH Desktop" -ErrorAction SilentlyContinue | Where-Object {$_.Path -and [IO.Path]::GetFullPath($_.Path) -eq $p}); if($busy.Count){exit 9}';
  try { execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { input: join(root, 'DSH Desktop.exe'), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }); }
  catch { throw Error('请先完全退出此目录中的赛博小宠物，再运行更新。'); }
}
export function applyUpdate(options) {
  if (options.checkOnly) return performUpdate(options);
  const lock = safePath(realpathSync(options.root), 'pet-update.lock', false);
  if (existsSync(lock)) {
    const pid = Number(readFileSync(lock, 'utf8'));
    if (!Number.isSafeInteger(pid) || pid <= 0) throw Error('更新锁文件异常，请确认没有更新器运行后移除 pet-update.lock。');
    let alive = true;
    try { process.kill(pid, 0); } catch (e) { if (e.code === 'ESRCH') alive = false; }
    if (alive) throw Error('另一个更新器仍在运行，请等待它完成。');
    unlinkSync(lock);
  }
  const fd = openSync(lock, 'wx');
  try { writeFileSync(fd, String(process.pid)); return performUpdate(options); }
  finally { closeSync(fd); unlinkSync(lock); }
}
function performUpdate({ root, bundle, checkOnly = false, processCheck = assertClosed }) {
  root = realpathSync(root); bundle = realpathSync(bundle);
  const manifest = JSON.parse(readFileSync(join(bundle, 'manifest.json'), 'utf8'));
  if (manifest.format !== 1 || manifest.product !== 'cyber-pet' || manifest.platform !== 'win32-x64' || !/^[a-zA-Z0-9._-]+$/.test(manifest.build) || !Array.isArray(manifest.files) || !manifest.files.length) throw Error('更新清单格式错误');
  const markerPath = safePath(root, 'pet-portable.json', false);
  if (!existsSync(markerPath)) throw Error('这里不是兼容的便携版软件目录，请选择包含 pet-portable.json 的完整包目录。');
  const marker = JSON.parse(readFileSync(markerPath, 'utf8'));
  if (marker.format !== 1 || marker.platform !== manifest.platform || !manifest.fromBuilds.includes(marker.build)) throw Error('基础版本不兼容，请按发布说明下载完整包。当前：' + marker.build);
  for (const [path, hash] of Object.entries(manifest.anchors)) {
    if (fileHash(safePath(root, path, false)) !== hash) throw Error('底层运行环境不匹配，请使用对应完整包：' + path);
  }
  const seen = new Set(), operations = [];
  for (const f of manifest.files) {
    const key = f.path.toLowerCase();
    if (seen.has(key)) throw Error('清单路径重复');
    seen.add(key);
    const dest = safePath(root, f.path);
    const temporary = safePath(root, f.path + '.cyber-update-tmp');
    if (!Array.isArray(f.before) || !(f.after === null || /^[a-f0-9]{64}$/.test(f.after))) throw Error('文件摘要格式错误');
    if (f.after !== null) {
      const source = safePath(bundle, 'payload/' + f.path, false);
      const content = readFileSync(source);
      if (content.length !== f.bytes || digest(content) !== f.after) throw Error('更新包文件损坏：' + f.path);
    }
    const current = fileHash(dest);
    // Both old and target hashes are accepted, so interrupted updates can resume.
    if (current !== f.after && !f.before.includes(current)) throw Error('程序文件曾被修改或版本不符，已停止：' + f.path);
    if (existsSync(temporary) && !lstatSync(temporary).isFile()) throw Error('临时文件位置被占用：' + f.path);
    if (current !== f.after) operations.push({ f, dest, temporary });
  }
  processCheck(root);
  if (checkOnly) return { build: manifest.build, changed: operations.length, checked: true };
  // Validate every payload before touching installation files. Data is never managed.
  for (const { f, dest, temporary } of operations) {
    processCheck(root);
    safePath(root, f.path);
    if (f.after === null) { unlinkSync(dest); continue; }
    mkdirSync(dirname(dest), { recursive: true });
    // An interrupted write may leave a partial staging file. Unlink before recreating
    // rather than following any pre-existing hard link during a write.
    safePath(root, f.path + '.cyber-update-tmp');
    if (existsSync(temporary)) unlinkSync(temporary);
    writeFileSync(temporary, readFileSync(safePath(bundle, 'payload/' + f.path, false)), { flag: 'wx' });
    if (fileHash(temporary) !== f.after) throw Error('写入校验失败：' + f.path);
    renameSync(temporary, dest);
  }
  for (const f of manifest.files) if (fileHash(safePath(root, f.path)) !== f.after) throw Error('更新后校验失败：' + f.path);
  const markerTemp = safePath(root, 'pet-portable.json.cyber-update-tmp', false);
  if (existsSync(markerTemp)) unlinkSync(markerTemp);
  writeFileSync(markerTemp, JSON.stringify({ ...marker, build: manifest.build, baseBuild: marker.baseBuild || manifest.baseBuild }, null, 2) + '\n', { flag: 'wx' });
  renameSync(markerTemp, markerPath);
  return { build: manifest.build, changed: operations.length, checked: false };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = applyUpdate({ root: process.argv[2], bundle: dirname(fileURLToPath(import.meta.url)), checkOnly: process.argv.includes('--check') });
    console.log(result.checked ? `检查通过，需要更新 ${result.changed} 个文件。` : `更新完成：${result.build}。个人数据已保留，可以启动软件。`);
  } catch (error) { console.error('更新停止：' + error.message + '\n如果已开始替换，请保持软件关闭，解决问题后重新运行同一更新包。'); process.exitCode = 1; }
}
