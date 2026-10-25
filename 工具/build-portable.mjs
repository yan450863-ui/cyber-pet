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
  if (/(?:^|[\\/])qq-(?:service|llbot-service|expressions)\.mjs$/.test(path)) return false;
  if (parts.some(p => ['.git', '__pycache__', '.pytest_cache'].includes(p))) return false;
  if (/\.(pyc|pyo|map|log|tmp)$/.test(path)) return false;
  if (path.startsWith(join(root,'插件'))&&parts.includes('node_modules'))return false;
  if(parts.includes('dsh-bili-scroll')&&/\.test\.mjs$/.test(path))return false;
  return true;
} });
const applicationExe = existsSync(join(root, '赛博小宠物.exe')) ? '赛博小宠物.exe' : 'DSH Desktop.exe';
const binaries = [applicationExe, 'chrome_100_percent.pak', 'chrome_200_percent.pak', 'd3dcompiler_47.dll', 'dxcompiler.dll', 'dxil.dll', 'ffmpeg.dll', 'icudtl.dat', 'resources.pak', 'snapshot_blob.bin', 'v8_context_snapshot.bin', 'vk_swiftshader_icd.json', 'vk_swiftshader.dll', 'vulkan-1.dll', 'LICENSE.electron.txt', 'LICENSES.chromium.html', 'LICENSE', 'LICENSE-SCOPE.md', 'THIRD_PARTY_NOTICES.md', 'SECURITY.md'];
if (!resume) for (const file of binaries) copy(join(root, file), join(stage, file));
if (!resume) for (const dir of ['locales', 'resources/qq-window',  'resources/app', 'resources/runtime/x64/primary-runtime', '插件/dsh-bili-scroll']) {
  copy(join(root, dir), join(stage, dir));
}
// Ship the current private plugin package as well as its editable source.
if (!repack) copy(join(root, '插件/dsh-bili-scroll'), join(stage, 'resources/app/node_modules/dsh-bili-scroll'));
writeFileSync(join(stage, 'pet-portable.json'), JSON.stringify({ format: 1, build: tag, platform: 'win32-x64' }, null, 2));
writeFileSync(join(stage, '使用说明.txt'), "﻿赛博小宠物：先看这里\r\n\r\n1. 先把压缩包完整解压。不要在压缩包里面打开。\r\n2. 双击“赛博小宠物.exe”。不需要另外安装DSH。\r\n3. 点左下“API 连接”，填服务商给你的地址、API Key和模型ID。点测试，成功后保存，再从左上刷新菜单重启。\r\n4. 点“宠物聊天”，发一句“你好”。能收到回复就接好了。\r\n5. 想改名字、性格、说话方式和字数，点“性格设置”，改完点对应的保存按钮。\r\n6. 想刷B站，点“刷视频设置”，在“账号与环境”扫码登录，检查成功后填搜索词，先点“只跑一轮”。想自动评论要开启自动发言开关并保存。\r\n7. 浏览和回复记录都在“刷视频日志”，点一条可展开。\r\n8. 想用QQ群，先打开并登录官方QQ，打开目标群。点“QQ聊天”填写群名、群号和群昵称绑定，再保存并开始监听。别最小化QQ；只支持单群文字。下面“QQ聊天日志”能看回复结果。\r\n9. 不想继续时点对应页面的“停止”。重开软件、换宠物后需要重新点开始。\r\n10. 不知道怎么操作，点左上齿轮看说明。\r\n\r\n所有个人资料保存在本文件夹的“数据”内。分享软件时不要带上自己的数据文件夹。\r\n源码：https://github.com/yan450863-ui/cyber-pet\r\n自有修改仅限非商用，第三方权利见随包许可说明。\r\n");
const versionNotes = join(root, '工具', tag + '.notes.md');
if (existsSync(versionNotes)) writeFileSync(join(stage, '版本说明.md'), readFileSync(versionNotes));
console.log(repack ? 'Checking and repacking clean staging directory.' : 'Copied clean application; installing Bili dependencies into bundled Python.');
const pythonRoot = join(stage, 'resources/runtime/x64/primary-runtime/dependencies/python');
const builderPython = join(root, 'resources/runtime/x64/primary-runtime/dependencies/python/python.exe');
const pipMain = `import sys,runpy; sys.path.insert(0, ${JSON.stringify(join(root, '数据/bili-duty/.venv/Lib/site-packages'))}); runpy.run_module('pip',run_name='__main__')`;
const pip = (repack || process.argv.includes('--reuse-python')) ? { status: 0 } : spawnSync(builderPython, ['-c', pipMain, 'install', '--disable-pip-version-check', '--no-compile', '--upgrade', '--target', join(pythonRoot, 'Lib/site-packages'), '-r', join(root, '插件/dsh-bili-scroll/vendor/bilibili-mcp/requirements.txt')], { stdio: 'inherit', windowsHide: true });
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
const result = { applicationExe, file: name + '.zip', files, unpackedBytes: bytes, zipBytes: statSync(stage + '.zip').size, sha256 };
writeFileSync(stage + '.json', JSON.stringify(result, null, 2) + '\n');
writeFileSync(stage + '.zip.sha256', sha256 + '  ' + name + '.zip\n');
console.log(JSON.stringify(result, null, 2));
