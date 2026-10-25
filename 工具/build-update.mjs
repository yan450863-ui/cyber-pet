import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, copyFileSync, statSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { digest } from './apply-update.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const label = process.argv[2];
if (!label || !/^[a-zA-Z0-9._-]+$/.test(label)) throw Error('请指定新的更新标签，例如 2026-10-21-update1');
const output = join(root, '发布'), name = 'cyber-pet-update-' + label, stage = join(output, name);
if (existsSync(stage) || existsSync(stage + '.zip')) throw Error('构建目录已存在，请使用新标签');
const baseline = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : join(output, 'cyber-pet-windows-x64-2026-10-20-preview.zip');
const notesIndex = process.argv.indexOf('--notes');
const notesFile = notesIndex >= 0 ? process.argv[notesIndex + 1] : join(root, '工具', label + '.notes.md');
if (!notesFile) throw Error('请提供 --notes 更新说明文件');
const releaseNotes = readFileSync(notesFile, 'utf8').replace(/^\ufeff/, '').trim();
if (!releaseNotes) throw Error('更新说明不能为空');
const baselineMeta = JSON.parse(readFileSync(baseline.replace(/\.zip$/, '.json'), 'utf8'));
if (digest(readFileSync(baseline)) !== baselineMeta.sha256) throw Error('完整基包校验失败');
const python = join(root, 'resources/runtime/x64/primary-runtime/dependencies/python/python.exe');
function py(code, args) {
  const r = spawnSync(python, ['-I', '-c', code, ...args], { encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  if (r.status) throw Error(r.stderr || 'Python构建失败');
  return r.stdout;
}
const gitFiles = spawnSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' });
if (gitFiles.status) throw Error('无法读取源码文件列表');
const shell = gitFiles.stdout.split('\0').filter(p => p.startsWith('resources/app/'));
const applicationExe = existsSync(join(root, '赛博小宠物.exe')) ? '赛博小宠物.exe' : 'DSH Desktop.exe';
const anchors = [applicationExe, 'resources/runtime/x64/primary-runtime/dependencies/node/bin/node.exe', 'resources/app/package.json', '插件/dsh-bili-scroll/package.json', '插件/dsh-bili-scroll/vendor/bilibili-mcp/requirements.txt'];
const licenses = ['LICENSE', 'LICENSE-SCOPE.md', 'THIRD_PARTY_NOTICES.md'];
const select = [...new Set([...shell, ...anchors, ...licenses])];
const old = JSON.parse(py(`import zipfile,sys,json,hashlib
z=zipfile.ZipFile(sys.argv[1]); selected=set(json.loads(sys.argv[2])); result={}; marker=None
for n in z.namelist():
 p=n.split('/',1)[-1]
 if p=='pet-portable.json': marker=json.loads(z.read(n))
 if not n.endswith('/') and (p.startswith('插件/dsh-bili-scroll/') or p in selected): result[p]=hashlib.sha256(z.read(n)).hexdigest()
print(json.dumps({'marker':marker,'files':result}))`, [baseline, JSON.stringify(select)]));
if (old.marker?.format !== 1 || old.marker.platform !== 'win32-x64') throw Error('完整包不支持更新');
const anchorHashes = {};
for (const p of anchors) {
  anchorHashes[p] = digest(readFileSync(join(root, p)));
  if (anchorHashes[p] !== old.files[p]) throw Error('运行环境或依赖已经变化，需要重新制作完整包：' + p);
}
const current = new Set([...shell, ...licenses]);
function scan(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isSymbolicLink()) throw Error('插件源码包含链接：' + p);
    if (['node_modules', '.git', '__pycache__', '.pytest_cache'].includes(e.name) || /\.(pyc|pyo|map|log|tmp)$/.test(e.name) || /\.test\.mjs$/.test(e.name)) continue;
    if (e.isDirectory()) scan(p); else current.add(relative(root, p).replaceAll('\\', '/'));
  }
}
scan(join(root, '插件/dsh-bili-scroll'));
const previous = readdirSync(output).filter(n => /^cyber-pet-update-.*\.manifest\.json$/.test(n)).map(n => JSON.parse(readFileSync(join(output, n), 'utf8'))).filter(m => m.baseBuild === old.marker.build);
for (const m of previous) if (JSON.stringify(m.anchors) !== JSON.stringify(anchorHashes)) throw Error('旧更新清单属于不同运行环境');
const paths = new Set([...Object.keys(old.files), ...current, ...previous.flatMap(m => m.files.map(f => f.path))]);
const files = [];
for (const p of [...paths].sort()) {
  if (anchors.includes(p)) continue;
  const after = current.has(p) ? digest(readFileSync(join(root, p))) : null;
  const before = [...new Set([old.files[p] || null, ...previous.flatMap(m => m.files.filter(f => f.path === p).map(f => f.after))])];
  if (before.length === 1 && before[0] === after) continue;
  files.push({ path: p, before, after, bytes: after === null ? 0 : statSync(join(root, p)).size });
}
if (!files.length) throw Error('没有需要更新的文件');
const manifest = { format: 1, product: 'cyber-pet', platform: 'win32-x64', baseBuild: old.marker.build, build: label,
  fromBuilds: [...new Set([old.marker.build, ...previous.map(m => m.build), label])], anchors: anchorHashes, files };
mkdirSync(stage, { recursive: true });
for (const f of files) if (f.after) {
  const dest = join(stage, 'payload', f.path); mkdirSync(dirname(dest), { recursive: true }); copyFileSync(join(root, f.path), dest);
}
writeFileSync(join(stage, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
copyFileSync(join(root, '工具/apply-update.mjs'), join(stage, 'apply-update.mjs'));
// UTF-8 BOM is required for Chinese literals in Windows PowerShell 5.1.
writeFileSync(join(stage, '更新.ps1'), '\ufeff' + readFileSync(join(root, '工具/update-launcher.ps1'), 'utf8'));
writeFileSync(join(stage, '更新.cmd'), '@echo off\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0更新.ps1" "%~1"\r\npause\r\n', 'utf8');
const instructions = '\ufeff赛博小宠物 累计更新包 ' + label + '\r\n\r\n适用：Windows x64 便携预览包 ' + old.marker.build + ' 及本系列已发布更新。\r\n首次使用请下载完整包，本更新包不能独立运行。\r\n\r\n1. 完全退出赛博小宠物。\r\n2. 将本更新ZIP解压到任意可写文件夹（不要在压缩包内运行）。\r\n3. 双击“更新.cmd”，选择原软件目录，里面应有 DSH Desktop.exe 和 pet-portable.json。\r\n4. 提示更新完成后，从原目录启动 DSH Desktop.exe；更新包文件夹可以删除。\r\n\r\n只替换列出的程序/插件文件，不修改“数据”内宠物、API、B站账号、聊天和日志，不制作备份。\r\n不匹配的版本、被改过的程序文件、损坏的更新包会停止；底层大版本更换请使用完整包。\r\n如更新中断，保持软件关闭，重新运行同一更新包继续完成，完成前不要启动软件。\r\n更新不自动启动软件、不自动开始浏览或发送评论。\r\n\r\n完整包：https://github.com/yan450863-ui/cyber-pet/releases/tag/preview-2026-10-20\r\n仅限许可证允许的非商业用途；上游权利见随包声明。\r\n';
writeFileSync(join(stage, '更新说明.txt'), instructions);
writeFileSync(join(stage, '本次更新.md'), releaseNotes + '\n');
py(`import os,sys,zipfile
source,target=sys.argv[1:]
with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 for directory,dirs,files in os.walk(source):
  dirs.sort()
  for f in sorted(files):
   p=os.path.join(directory,f); z.write(p,os.path.relpath(p,os.path.dirname(source)))
with zipfile.ZipFile(target) as z:
 if z.testzip(): raise RuntimeError('ZIP CRC failed')`, [stage, stage + '.zip']);
const meta = { kind: 'update', file: name + '.zip', tag: 'update-' + label, build: label, baseBuild: manifest.baseBuild, changedFiles: files.length, payloadBytes: files.reduce((a, f) => a + f.bytes, 0), zipBytes: statSync(stage + '.zip').size, sha256: digest(readFileSync(stage + '.zip')) };
writeFileSync(stage + '.json', JSON.stringify(meta, null, 2) + '\n');
writeFileSync(stage + '.manifest.json', JSON.stringify(manifest, null, 2) + '\n');
writeFileSync(stage + '.zip.sha256', meta.sha256 + '  ' + meta.file + '\n');
writeFileSync(stage + '.instructions.txt', instructions + '\r\n本次更新内容与限制：\r\n\r\n' + releaseNotes + '\r\n');
writeFileSync(stage + '.notes.md', releaseNotes + '\n');
console.log(JSON.stringify(meta, null, 2));
