import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
const python = resolve('../../数据/bili-duty/.venv/Scripts/python.exe')
test('Python图片桥接：真实PNG解码与单次带图回复，拒绝目录穿越和外链', { skip: !existsSync(python) }, () => {
  const home = mkdtempSync(join(tmpdir(), 'bili-meme-python-'))
  try {
    mkdirSync(join(home, 'memes/gpt6/开心'), { recursive: true })
    writeFileSync(join(home, 'memes/gpt6/开心/smile.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGP8zwACTGCSAQANHQEDgslx/wAAAABJRU5ErkJggg==', 'base64'))
    const r = spawnSync(python, ['lib/memes_test.py'], { env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8', MEME_TEST_HOME: home }, encoding: 'utf8', timeout: 15000 })
    assert.equal(r.status, 0, String(r.error || '') + r.stdout + r.stderr)
  } finally { rmSync(home, { recursive: true, force: true }) }
})
