import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyUpdate, digest } from './apply-update.mjs';

function fixture(t) {
  const temp = mkdtempSync(join(tmpdir(), 'cyber-update-test-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const root = join(temp, 'install'), bundle = join(temp, 'bundle');
  const path = '插件/dsh-bili-scroll/client.js';
  const put = (base, p, value) => { const full = join(base, p); mkdirSync(join(full, '..'), { recursive: true }); writeFileSync(full, value); };
  put(root, 'pet-portable.json', JSON.stringify({ format: 1, build: 'base', platform: 'win32-x64' }));
  put(root, 'DSH Desktop.exe', 'runtime');
  put(root, path, 'old');
  put(root, '数据/pets.json', 'PRIVATE PETS');
  put(bundle, 'payload/' + path, 'new');
  const manifest = { format: 1, product: 'cyber-pet', platform: 'win32-x64', baseBuild: 'base', build: 'update1', fromBuilds: ['base', 'update1'], anchors: { 'DSH Desktop.exe': digest('runtime') }, files: [{ path, before: [digest('old')], after: digest('new'), bytes: 3 }] };
  const save = () => put(bundle, 'manifest.json', JSON.stringify(manifest)); save();
  return { root, bundle, manifest, save, put, path, run: opts => applyUpdate({ root, bundle, processCheck: () => {}, ...opts }) };
}
test('preflight, update and repeat preserve data and marker fields', t => {
  const f = fixture(t);
  assert.equal(f.run({ checkOnly: true }).changed, 1);
  assert.equal(readFileSync(join(f.root, f.path), 'utf8'), 'old');
  assert.equal(f.run().changed, 1);
  assert.equal(f.run().changed, 0);
  assert.equal(readFileSync(join(f.root, '数据/pets.json'), 'utf8'), 'PRIVATE PETS');
  assert.equal(JSON.parse(readFileSync(join(f.root, 'pet-portable.json'))).baseBuild, 'base');
});
test('wrong version, runtime, or custom edits stop without replacement', t => {
  for (const kind of ['version', 'runtime', 'custom']) {
    const f = fixture(t);
    if (kind === 'version') { f.manifest.fromBuilds = ['other']; f.save(); }
    if (kind === 'runtime') f.put(f.root, 'DSH Desktop.exe', 'different');
    if (kind === 'custom') f.put(f.root, f.path, 'custom');
    assert.throws(() => f.run());
    assert.equal(readFileSync(join(f.root, f.path), 'utf8'), kind === 'custom' ? 'custom' : 'old');
  }
});
test('tampered second payload prevents any changes', t => {
  const f = fixture(t);
  f.manifest.files.push({ path: '插件/dsh-bili-scroll/other.js', before: [null], after: digest('expected'), bytes: 8 });
  f.put(f.bundle, 'payload/插件/dsh-bili-scroll/other.js', 'tampered'); f.save();
  assert.throws(() => f.run(), /损坏/);
  assert.equal(readFileSync(join(f.root, f.path), 'utf8'), 'old');
});
test('reject protected data, traversal and duplicate case paths', t => {
  for (const path of ['数据/pets.json', '../outside.js', '插件/dsh-bili-scroll/../../数据/pets.json', '插件\\dsh-bili-scroll\\x.js']) {
    const f = fixture(t); f.manifest.files[0].path = path; f.save();
    assert.throws(() => f.run());
  }
  const f = fixture(t); f.manifest.files.push({ ...f.manifest.files[0], path: f.path.toUpperCase() }); f.save();
  assert.throws(() => f.run(), /重复/);
});
test('directory junction cannot redirect update writes', t => {
  const f = fixture(t), external = join(f.root, 'external'); mkdirSync(external);
  const link = join(f.root, '插件/dsh-bili-scroll/linked');
  symlinkSync(external, link, process.platform === 'win32' ? 'junction' : 'dir');
  f.manifest.files[0].path = '插件/dsh-bili-scroll/linked/new.js'; f.save();
  assert.throws(() => f.run(), /链接/);
  assert.equal(existsSync(join(external, 'new.js')), false);
});
test('busy application refuses update', t => {
  const f = fixture(t);
  assert.throws(() => f.run({ processCheck: () => { throw Error('busy'); } }), /busy/);
  assert.equal(readFileSync(join(f.root, f.path), 'utf8'), 'old');
});
test('concurrent updater refuses writes', t => {
  const f = fixture(t); f.put(f.root, 'pet-update.lock', String(process.pid));
  assert.throws(() => f.run(), /另一个更新器/);
  assert.equal(readFileSync(join(f.root, f.path), 'utf8'), 'old');
});
test('interrupted replacement resumes and managed removal is supported', t => {
  const f = fixture(t);
  f.put(f.root, f.path, 'new');
  f.put(f.root, '插件/dsh-bili-scroll/obsolete.js', 'obsolete');
  f.manifest.files.push({ path: '插件/dsh-bili-scroll/obsolete.js', before: [digest('obsolete')], after: null, bytes: 0 }); f.save();
  assert.equal(f.run().changed, 1);
  assert.equal(existsSync(join(f.root, '插件/dsh-bili-scroll/obsolete.js')), false);
});
test('partial staging file from interruption can be retried', t => {
  const f = fixture(t); f.put(f.root, f.path + '.cyber-update-tmp', 'partial');
  assert.equal(f.run().changed, 1);
  assert.equal(readFileSync(join(f.root, f.path), 'utf8'), 'new');
});
