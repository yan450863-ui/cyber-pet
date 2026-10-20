import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, statSync, createReadStream } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { Transform } from 'node:stream';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const label = process.argv[2];
if (!label || !/^[a-zA-Z0-9._-]+$/.test(label)) throw Error('Pass an existing build label');
const tag = label.startsWith('preview-') ? label : 'preview-' + label.replace(/-preview$/, '');
const repo = 'yan450863-ui/cyber-pet';
const base = 'https://api.github.com/repos/' + repo;
const prefix = join(root, '发布', 'cyber-pet-windows-x64-' + label);
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
const body = `Windows x64 便携预览包。完整解压后双击 **DSH Desktop.exe**，无需另装 Node/Python 或主B站依赖。

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
  release = await api(base + '/releases', { method: 'POST', body: JSON.stringify({ tag_name: tag, target_commitish: git(['rev-parse', 'HEAD']), name: '赛博小宠物 · Windows x64 便携预览 2026-10-20', body, draft: true, prerelease: true }), headers: { 'Content-Type': 'application/json' } });
} else {
  if (!existing.ok) throw Error('Unable to inspect existing release: ' + existing.status);
  release = await existing.json();
  if (!release.draft) throw Error('Release is already published; refusing to modify it');
}
console.log('Draft release ready: ' + tag);
const python = join(root, 'resources/runtime/x64/primary-runtime/dependencies/python/python.exe');
const quickstart = join(root, '发布', 'QUICKSTART-zh-CN.txt');
const extract = spawnSync(python, ['-I', '-c', "import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); n=next(n for n in z.namelist() if n.endswith('/使用说明.txt')); open(sys.argv[2],'wb').write(z.read(n))", archive, quickstart], { cwd: root, windowsHide: true, encoding: 'utf8' });
if (extract.status) throw Error('Unable to extract quickstart');
for (const [file, name, type] of [[archive, meta.file, 'application/zip'], [prefix + '.zip.sha256', meta.file + '.sha256', 'text/plain'], [quickstart, 'QUICKSTART-zh-CN.txt', 'text/plain']]) {
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
