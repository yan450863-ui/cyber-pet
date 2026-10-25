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
const fullNotes=readFileSync(join(root,'工具',label+'.notes.md'),'utf8');
const body=(isUpdate?readFileSync(prefix+'.notes.md','utf8'):fullNotes)+'\n\nZIP：'+(meta.zipBytes/1024/1024).toFixed(1)+' MiB；解压：'+(meta.unpackedBytes/1024/1024).toFixed(1)+' MiB。\n\nSHA256：'+meta.sha256+'\n\n下载附件 '+meta.file+'；Source code 是源码，不能直接运行。';
let release=(await api(base+'/releases?per_page=100')).find(r=>r.tag_name===tag);
if(!release)release=await api(base+'/releases',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tag_name:tag,target_commitish:git(['rev-parse','HEAD']),name:isUpdate?'赛博小宠物 · 累计更新 '+label:'赛博小宠物 · Windows x64 完整包 '+label,body,draft:true,prerelease:true})});
else if(!release.draft)throw Error('Release already public; inspect before modifying it');
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
release = await api(base + '/releases/' + release.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tag_name:tag,target_commitish:git(['rev-parse','HEAD']),body, draft: false, prerelease: true, make_latest: 'false' }) });
release = await api(base + '/releases/' + release.id);
const result = { url: release.html_url, tag: release.tag_name, draft: release.draft, prerelease: release.prerelease, assets: release.assets.map(a => ({ name: a.name, size: a.size, state: a.state, digest: a.digest, url: a.browser_download_url })) };
if (result.draft || result.tag!==tag || result.assets.length < 3) throw Error('Release did not publish completely');
writeFileSync(prefix + '.release.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
