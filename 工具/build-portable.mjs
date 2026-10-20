import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync, readFileSync, rmSync, realpathSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, '发布');
const tag = process.argv[2] || '2026-10-20';
if (!/^[a-zA-Z0-9._-]+$/.test(tag)) throw Error('Invalid build label');
const name = `cyber-pet-windows-x64-${tag}`;
const stage = join(output, name);
const repack = process.argv.includes('--repack');
const resume = (process.argv.includes('--resume') || repack) && existsSync(join(stage, 'pet-portable.json'));
if (repack && !resume) throw Error('--repack requires an existing marked staging directory');
if ((!resume && existsSync(stage)) || (!repack && existsSync(stage + '.zip'))) throw Error('Build output already exists; choose a new build label');
mkdirSync(stage, { recursive: true });
const copy = (source, dest) => cpSync(source, dest, { recursive: true, filter: path => {
  const parts = relative(root, path).split(/[\\/]/);
  if (parts.some(p => ['.git', '__pycache__', '.pytest_cache'].includes(p))) return false;
  if (/\.(pyc|pyo|map|log|tmp)$/.test(path)) return false;
  if (path.startsWith(join(root, '插件')) && (parts.includes('node_modules') || /\.test\.mjs$/.test(path))) return false;
  return true;
} });
const binaries = ['DSH Desktop.exe', 'chrome_100_percent.pak', 'chrome_200_percent.pak', 'd3dcompiler_47.dll', 'dxcompiler.dll', 'dxil.dll', 'ffmpeg.dll', 'icudtl.dat', 'resources.pak', 'snapshot_blob.bin', 'v8_context_snapshot.bin', 'vk_swiftshader_icd.json', 'vk_swiftshader.dll', 'vulkan-1.dll', 'LICENSE.electron.txt', 'LICENSES.chromium.html', 'LICENSE', 'LICENSE-SCOPE.md', 'THIRD_PARTY_NOTICES.md'];
if (!resume) for (const file of binaries) copy(join(root, file), join(stage, file));
if (!resume) for (const dir of ['locales', 'resources/app', 'resources/runtime/x64/primary-runtime', '插件/dsh-bili-scroll']) {
  copy(join(root, dir), join(stage, dir));
}
writeFileSync(join(stage, 'pet-portable.json'), JSON.stringify({ format: 1, build: tag, platform: 'win32-x64' }, null, 2));
writeFileSync(join(stage, '使用说明.txt'), '\ufeff赛博小宠物 Windows x64 便携预览包\r\n\r\n1. 完整解压到有写入权限的文件夹，不要在压缩包内启动。\r\n2. 双击 DSH Desktop.exe。首次启动自动建立“数据”目录，内置默认 deepseek。\r\n3. 左下“API连接”填写自己的兼容接口地址、密钥和模型，保存后重启。\r\n4. 宠物设置中扫码登录B站，按需要启用自动评论/回复，再手动开始。\r\n5. Node、Python及主B站依赖已内置，无需另装；本地语音转写是可选下载。\r\n6. 个人宠物、账号、密钥、日志都保存在“数据”内。分享软件前不要复制自己的数据目录。\r\n7. 可整体移动文件夹，移动前退出软件；请勿把目录放在只读位置。\r\n\r\n这是本机干净目录验证的预览包，尚未在全新Windows电脑验收。\r\n源码：https://github.com/yan450863-ui/cyber-pet\r\n自有修改仅限非商用，第三方权利见随包许可说明。\r\n');
console.log(repack ? 'Checking and repacking clean staging directory.' : 'Copied clean application; installing Bili dependencies into bundled Python.');
const pythonRoot = join(stage, 'resources/runtime/x64/primary-runtime/dependencies/python');
const builderPython = join(root, 'resources/runtime/x64/primary-runtime/dependencies/python/python.exe');
const pipMain = `import sys,runpy; sys.path.insert(0, ${JSON.stringify(join(root, '数据/bili-duty/.venv/Lib/site-packages'))}); runpy.run_module('pip',run_name='__main__')`; 
const pip = repack ? { status: 0 } : spawnSync(builderPython, ['-c', pipMain, 'install', '--disable-pip-version-check', '--no-compile', '--upgrade', '--target', join(pythonRoot, 'Lib/site-packages'), '-r', join(root, '插件/dsh-bili-scroll/vendor/bilibili-mcp/requirements.txt')], { stdio: 'inherit', windowsHide: true });
if (pip.status !== 0) throw Error('Clean Python dependency installation failed');
const python = join(pythonRoot, 'python.exe');
const check = spawnSync(python, ['-I', '-c', 'import bilibili_api, mcp.server, qrcode, aiohttp; print("Portable Python imports OK")'], { stdio: 'inherit', windowsHide: true });
if (check.status !== 0) throw Error('Bundled Python import check failed');
// Imports can generate bytecode. Do not ship machine-path-bearing caches.
function clearBytecode(dir) { for (const e of readdirSync(dir, { withFileTypes: true })) {
  const path = join(dir, e.name);
  if (e.isSymbolicLink()) throw Error('Unexpected link in staging: ' + path);
  if (!e.isDirectory()) continue;
  if (e.name === '__pycache__') {
    if (!realpathSync(path).startsWith(realpathSync(stage) + '\\')) throw Error('Unsafe cache cleanup');
    rmSync(path, { recursive: true });
  } else clearBytecode(path);
} }
clearBytecode(stage);
let bytes = 0, files = 0;
function walk(dir) { for (const e of readdirSync(dir, { withFileTypes: true })) {
  const path = join(dir, e.name);
  if (e.isSymbolicLink()) throw Error('Release must not contain machine-specific links: ' + path);
  if (e.isDirectory()) walk(path); else { bytes += statSync(path).size; files++; }
} }
walk(stage);
if (existsSync(join(stage, '数据'))) throw Error('Release must not contain personal data');
const zip = spawnSync(builderPython, ['-c', `import os,sys,zipfile
source,target=sys.argv[1:]
with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 for directory,dirs,files in os.walk(source):
  dirs.sort()
  for f in sorted(files):
   p=os.path.join(directory,f)
   z.write(p,os.path.relpath(p,os.path.dirname(source)))
with zipfile.ZipFile(target) as z:
 bad=z.testzip()
 if bad: raise RuntimeError(bad)
 print('ZIP CRC check OK; entries:',len(z.infolist()))
`, stage, stage + '.zip'], { stdio: 'inherit', windowsHide: true });
if (zip.status !== 0) throw Error('ZIP creation/check failed');
const sha256 = createHash('sha256').update(readFileSync(stage + '.zip')).digest('hex');
const result = { file: name + '.zip', files, unpackedBytes: bytes, zipBytes: statSync(stage + '.zip').size, sha256 };
writeFileSync(stage + '.json', JSON.stringify(result, null, 2) + '\n');
writeFileSync(stage + '.zip.sha256', sha256 + '  ' + name + '.zip\n');
console.log(JSON.stringify(result, null, 2));
