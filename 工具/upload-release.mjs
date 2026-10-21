import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, statSync, createReadStream } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { Transform } from 'node:stream';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const label = process.argv[2];
if (!label || !/^[a-zA-Z0-9._-]+$/.test(label)) throw Error('Pass an existing build label');
const isUpdate = process.argv.includes('--update');
const tag = isUpdate ? 'update-' + label : label.startsWith('preview-') ? label : 'preview-' + label.replace(/-preview$/, '');
const repo = 'yan450863-ui/cyber-pet';
const base = 'https://api.github.com/repos/' + repo;
const prefix = join(root, '发布', (isUpdate ? 'cyber-pet-update-' : 'cyber-pet-windows-x64-') + label);
const meta = JSON.parse(readFileSync(prefix + '.json', 'utf8'));
const archive = prefix + '.zip';
const digest = createHash('sha256').update(readFileSync(archive)).digest('hex');
if (digest !== meta.sha256 || statSync(archive).size !== meta.zipBytes) throw Error('Build checksum mismatch');
const git = (args, input) => {
  const r = spawnSync('git', args, { cwd: root, input, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  if (r.status) throw Error('Git command failed: ' + args[0]);
  return r.stdout.trim();
};
// Credentials stay in memory and are never written to the release files or logs.
const credential = Object.fromEntries(git(['credential', 'fill'], 'protocol=https\nhost=github.com\n\n').split('\n').map(line => {
  const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)];
}));
if (!credential.password) throw Error('GitHub credential unavailable');
const headers = { Authorization: 'Bearer ' + credential.password, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'CyberPetRelease' };
async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...headers, ...options.headers } });
  const data = await response.json();
  if (!response.ok) throw Error(`GitHub HTTP ${response.status}: ${data.message || 'request failed'}`);
  return data;
}
const body = isUpdate ? `## Windows x64 累计更新包

适用于 **2026-10-20-preview 完整便携包**。本次只更新 ${meta.changedFiles} 个程序/插件文件，ZIP **${(meta.zipBytes / 1024).toFixed(1)} KB**，无需重新下载约382 MB完整包。

### 更新内容
- 新增“模型拟人/同人整活”浏览口味：包含Claude、DeepSeek、GPT等模型组合词，可设置近多少天、近期热门与严格相关，减少跑偏到纯科技视频。
- 视频优先读取已有总结，普通摘录默认600字；被追问时最多补读一次，默认1200字，均可按宠物修改，减少长字幕Token消耗。
- 精简重复提示词、通知与楼层上下文；不再发送“没看过/没字幕/不评价”等占位评论，缺少依据时跳过。
- 增加可修改的角色别名与自我识别，能按人设回应作品中的同名拟人角色。
- 修复旧配置缺少新增字段时，保存设置提示整数错误的问题。

### 如何更新
1. **完全退出软件**，将下方更新ZIP解压到任意可写文件夹。
2. 双击解压后的 **更新.cmd**，选择原软件目录（内有DSH Desktop.exe及pet-portable.json）。
3. 提示“更新完成”后，从原目录启动软件；更新包文件夹可删除。

宠物、人设、API连接、B站登录、聊天和日志均保留；不制作备份，不自动启动软件或开始公开发言。若更新中断，请保持软件关闭，重新运行同一更新包完成更新。

这是累计更新方案：同一兼容底层版本后续可直接安装最新更新包；底层运行环境或依赖变更时改发完整包。版本不符、程序文件被自行修改或文件校验失败时会停止。

**首次安装请下载[完整便携包](https://github.com/yan450863-ui/cyber-pet/releases/tag/preview-2026-10-20)**，本更新包不能独立运行。GitHub自动生成的Source code是源码。

已通过更新器安全测试，以及已发布完整包解压副本的更新/重复执行/个人数据保留验证；尚未在另一台全新Windows电脑验收。

SHA256：\`${meta.sha256}\`

本项目自有修改采用PolyForm Noncommercial 1.0.0，保留上游MIT权利，详见随包声明。` : `Windows x64 便携预览包。完整解压后双击 **DSH Desktop.exe**，无需另装 Node/Python 或主B站依赖。

1. 首次启动阅读操作说明，内置默认宠物 **deepseek**。
2. 左下“API连接”填写自己的兼容接口、密钥与模型，保存后重启。
3. 宠物设置中扫码登录B站，按需要开启自动评论/回复，再手动开始。

压缩包约 **382 MB**，解压约 **1.01 GB**。不包含开发者的个人宠物、账号、密钥、聊天和工作记录；自动评论及回复默认关闭。可选语音转写依赖不包含在主包中。

已完成本机干净目录启动、默认宠物/空白API检查、Python MCP启动及压缩包完整性校验；尚未在另一台全新Windows电脑验收。

SHA256：\`${meta.sha256}\`

请下载下方 **cyber-pet-windows-x64-${label}.zip**；GitHub自动生成的Source code是源码，不是可直接运行的程序。使用说明与校验文件一并提供。

本项目自有新增/修改采用 PolyForm Noncommercial 1.0.0，仅限许可允许的非商业用途；上游MIT权利保留，详见随包许可与第三方声明。`;
let release;
const existing = await fetch(base + '/releases/tags/' + tag, { headers });
if (existing.status === 404) {
  release = await api(base + '/releases', { method: 'POST', body: JSON.stringify({ tag_name: tag, target_commitish: git(['rev-parse', 'HEAD']), name: isUpdate ? '赛博小宠物 · 累计更新 ' + label : '赛博小宠物 · Windows x64 便携预览 2026-10-20', body, draft: true, prerelease: true }), headers: { 'Content-Type': 'application/json' } });
} else {
  if (!existing.ok) throw Error('Unable to inspect existing release: ' + existing.status);
  release = await existing.json();
  if (!release.draft) throw Error('Release is already published; refusing to modify it');
}
console.log('Draft release ready: ' + tag);
const python = join(root, 'resources/runtime/x64/primary-runtime/dependencies/python/python.exe');
const quickstart = isUpdate ? prefix + '.instructions.txt' : join(root, '发布', 'QUICKSTART-zh-CN.txt');
const extract = isUpdate ? { status: 0 } : spawnSync(python, ['-I', '-c', "import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); n=next(n for n in z.namelist() if n.endswith('/使用说明.txt')); open(sys.argv[2],'wb').write(z.read(n))", archive, quickstart], { cwd: root, windowsHide: true, encoding: 'utf8' });
if (extract.status) throw Error('Unable to extract quickstart');
for (const [file, name, type] of [[archive, meta.file, 'application/zip'], [prefix + '.zip.sha256', meta.file + '.sha256', 'text/plain'], [quickstart, isUpdate ? 'UPDATE-zh-CN.txt' : 'QUICKSTART-zh-CN.txt', 'text/plain']]) {
  const size = statSync(file).size;
  const localDigest = createHash('sha256').update(readFileSync(file)).digest('hex');
  const old = release.assets?.find(a => a.name === name);
  if (old) {
    if (old.state !== 'uploaded' || old.size !== size || (old.digest && old.digest !== 'sha256:' + localDigest)) throw Error('Existing asset differs: ' + name);
    console.log('Already uploaded: ' + name); continue;
  }
  console.log('Uploading: ' + name + ' (' + size + ' bytes)');
  let sent = 0, reported = 0;
  const progress = new Transform({ transform(chunk, enc, callback) {
    sent += chunk.length;
    if (sent - reported >= 32 * 1024 * 1024) { reported = sent; console.log('Upload stream: ' + Math.round(sent / size * 100) + '%'); }
    callback(null, chunk);
  } });
  const stream = createReadStream(file).pipe(progress);
  const asset = await api(release.upload_url.replace(/\{.*$/, '') + '?name=' + encodeURIComponent(name), { method: 'POST', headers: { 'Content-Type': type, 'Content-Length': String(size) }, body: stream, duplex: 'half' });
  if (asset.state !== 'uploaded' || asset.size !== size || (asset.digest && asset.digest !== 'sha256:' + localDigest)) throw Error('Uploaded asset verification failed: ' + name);
  console.log('Verified: ' + name);
}
release = await api(base + '/releases/' + release.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body, draft: false, prerelease: true, make_latest: 'false' }) });
release = await api(base + '/releases/' + release.id);
const result = { url: release.html_url, tag: release.tag_name, draft: release.draft, prerelease: release.prerelease, assets: release.assets.map(a => ({ name: a.name, size: a.size, state: a.state, digest: a.digest, url: a.browser_download_url })) };
if (result.draft || result.assets.length < 3) throw Error('Release did not publish completely');
writeFileSync(prefix + '.release.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
