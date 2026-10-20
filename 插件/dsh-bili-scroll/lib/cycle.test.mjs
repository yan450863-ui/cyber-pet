import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Cycle, CYCLE_DEFAULTS, withinHours, normalizeCycle } from './cycle.mjs'
import { createCycleWorker, decisionOf } from './cycle-worker.mjs'
import { taskGuard } from './task-boundary.mjs'
import { excerpt, modelInput, threadBrief } from './reading.mjs'

test('两组交替，次数独立，休息从全部完成后开始，轮数有限时停止', async () => {
  let now = 1000, saved
  const order = []
  const config = { ...CYCLE_DEFAULTS, videoCount: 2, messagesCount: 1, videoIntervalSec: 1, messagesIntervalSec: 1, restMinutes: 2, maxRounds: 2 }
  const loop = new Cycle({ config: () => config, now: () => now, save: s => { saved = s }, step: async g => { order.push(g); now += 5000; return {} } })
  loop.start(); await loop.tick(); await loop.tick(); await loop.tick(); await loop.tick()
  assert.deepEqual(order, ['video', 'messages', 'video'])
  assert.equal(saved.restUntil, now + 120000)
  now += 119999; await loop.tick(); assert.equal(order.length, 3)
  now++; await loop.tick(); assert.equal(order.length, 4)
  await loop.tick(); await loop.tick(); await loop.tick()
  assert.equal(loop.state.running, false)
  assert.equal(loop.state.phase, 'complete')
})

test('无限组不饿死另一组，无新内容结束本轮，间隔从单步结束计算', async () => {
  let now = 0
  const seen = []
  const loop = new Cycle({ config: () => ({ ...CYCLE_DEFAULTS, videoCount: 0, messagesCount: 1 }), now: () => now, save: () => {},
    step: async g => { seen.push(g); now += 10000; return { empty: g === 'video' && seen.length > 2 } } })
  loop.start({ once: true }); await loop.tick(); await loop.tick()
  assert.deepEqual(seen, ['video', 'messages'])
  assert.equal(loop.state.next.video, 70000)
  now = 69999; await loop.tick(); assert.equal(seen.length, 2)
  now = 70000; await loop.tick(); await loop.tick()
  assert.equal(loop.state.phase, 'complete')
})

test('停止取消在途操作，重启等待手动继续并保留计数，休息中停止不再运行', async () => {
  let started, calls = 0, snapshot
  const ready = new Promise(resolve => { started = resolve })
  const loop = new Cycle({ config: () => CYCLE_DEFAULTS, save: s => { snapshot = s },
    step: async (_, { signal }) => { calls++; started(); await new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })) } })
  loop.start(); const active = loop.tick(); await ready; loop.stop(); await active; await loop.tick()
  assert.equal(calls, 1); assert.equal(loop.state.running, false)
  const restored = new Cycle({ state: { ...snapshot, running: true, counts: { video: 2, messages: 1 } }, config: () => CYCLE_DEFAULTS, save: () => {}, step: () => { throw Error('不得自动执行') } })
  await restored.tick(); assert.equal(restored.state.counts.video, 2); assert.equal(restored.state.phase, 'paused')
  restored.state.restUntil = Date.now() + 10000; restored.start(); restored.stop(); await restored.tick()
  assert.equal(restored.state.phase, 'paused')
  const completed = new Cycle({ state: { phase: 'complete', round: 4, counts: { video: 5, messages: 5 } }, config: () => CYCLE_DEFAULTS, save: () => {}, step: async () => ({}) })
  completed.start({ once: true }); await completed.tick()
  assert.equal(completed.state.round, 5)
  assert.equal(completed.state.counts.video, 1)
})

test('跨午夜时段、同起止全天、非法配置归一化与异常退避', async () => {
  const c = { ...CYCLE_DEFAULTS, timeLimited: true, timeStart: '22:00', timeEnd: '06:00' }
  assert.equal(withinHours(new Date(2026, 9, 20, 23), c), true)
  assert.equal(withinHours(new Date(2026, 9, 20, 4), c), true)
  assert.equal(withinHours(new Date(2026, 9, 20, 6), c), false)
  assert.equal(withinHours(new Date(2026, 9, 20, 12), { ...c, timeEnd: '22:00' }), true)
  assert.equal(normalizeCycle({ videoIntervalSec: -4 }).videoIntervalSec, 1)
  let now = 0, calls = 0
  const loop = new Cycle({ now: () => now, config: () => ({ ...CYCLE_DEFAULTS, messagesEnabled: false }), save: () => {}, step: async () => { calls++; throw Error('模拟限流') } })
  loop.start(); await loop.tick(); await loop.tick(); assert.equal(calls, 1)
  now = 30000; await loop.tick(); assert.equal(calls, 2)
  assert.equal(loop.state.next.video, 90000)
})

function fixture(t, { decide, sendError = false } = {}) {
  const home = mkdtempSync(join(tmpdir(), 'bili-cycle-test-'))
  mkdirSync(join(home, 'out'))
  t.after(() => rmSync(home, { recursive: true, force: true }))
  const cfg = { ...CYCLE_DEFAULTS, autoComment: true, replyToComments: true, messagesNewOnly: false, lightweight: false, keywords: ['a', 'b'], reportLevel: 'full' }
  const calls = [], signal = new AbortController()
  const call = async (name, args) => {
    calls.push({ name, args })
    if (name === 'bili_search') return { videos: [{ bvid: args.keyword === 'a' ? 'BV1111111111' : 'BV2222222222' }] }
    if (name === 'bili_reply') { if (sendError) throw Error('发送超时'); return { success: true, rpid: 12345 } }
    if (name === 'bili_inbox') return { items: [
      { id: 'at:1', bvid: 'BV1111111111', rpid: 42, root: 40 },
      { id: 'reply:2', bvid: 'BV1111111111', rpid: 42, root: 40 },
      { id: 'reply:3', bvid: 'BV1111111111', rpid: 99, root: 40 },
    ] }
    if (name === 'bili_thread_context') return { root: { rpid: 40 }, replies: [{ rpid: 42 }] }
    if (name === 'bili_subtitle') return { text: '测试视频的完整字幕' }
    return { title: '测试', comments: [] }
  }
  const options = { home, config: () => cfg, call, resolveDsh: () => {}, log: () => {}, env: () => ({}),
    decide: decide || (async () => ({ action: 'reply', videoType:'教程',interest:'match',interestEvidence:true, scope: 'in_scope', boundary: 'ok', summary: '理解测试内容后决定评论', text: '测试草稿，不公开发送' })) }
  return { home, cfg, calls, signal, options, worker: createCycleWorker(options) }
}

test('视频去重可跨轮与重启；消息 @ 与回复合并去重，验证目标上下文', async t => {
  const f = fixture(t)
  await f.worker.step('video', { signal: f.signal.signal, round: 1 })
  // 禁用发布，后续条目不会等待公开发言冷却。
  f.cfg.autoComment = false
  await f.worker.step('video', { signal: f.signal.signal, round: 1 })
  assert.equal((await f.worker.step('video', { signal: f.signal.signal, round: 1 })).empty, true)
  const restarted = createCycleWorker(f.options)
  assert.equal((await restarted.step('video', { signal: f.signal.signal, round: 2 })).empty, true)
  f.cfg.replyToComments = false
  await restarted.step('messages', { signal: f.signal.signal, round: 2 })
  await restarted.step('messages', { signal: f.signal.signal, round: 2 })
  assert.equal((await restarted.step('messages', { signal: f.signal.signal, round: 2 })).empty, true)
  const memory = JSON.parse(readFileSync(join(f.home, 'cycle-memory.json')))
  assert.match(memory.memories.at(-1).summary, /无法.*确认/)
  assert.equal(f.calls.filter(c => c.name === 'bili_reply').length, 1)
})

test('只处理启用后新消息，重启不回扫旧通知，无新消息不调用模型', async t => {
  const f = fixture(t); f.cfg.messagesNewOnly = true; f.cfg.replyToComments = false
  let decisions = 0
  let items = [{ id: 'old', bvid: 'BV1111111111', rpid: 42, root: 40, time: Math.floor(Date.now() / 1000) - 100 }]
  const original = f.options.call
  const options = { ...f.options, call: (name, args) => name === 'bili_inbox' ? { items } : original(name, args),
    decide: async () => { decisions++; return { action: 'skip', summary: '测试新消息', text: '' } } }
  let worker = createCycleWorker(options)
  assert.equal((await worker.step('messages', { signal: f.signal.signal, round: 1 })).empty, true)
  assert.equal(decisions, 0)
  assert.equal(f.calls.length, 0)
  const since = JSON.parse(readFileSync(join(f.home, 'cycle-memory.json'))).inboxSince
  items.push({ id: 'new', bvid: 'BV1111111111', rpid: 42, root: 40, time: since + 1 })
  worker = createCycleWorker(options)
  await worker.step('messages', { signal: f.signal.signal, round: 2 })
  assert.equal(decisions, 1)
  assert.equal(f.calls.some(c => ['bili_subtitle', 'bili_comments'].includes(c.name)), false)
  assert.equal((await worker.step('messages', { signal: f.signal.signal, round: 3 })).empty, true)
  assert.equal(decisions, 1)
})

test('轻量视频优先总结，字幕回退限长；消息仅保留目标楼层，排除原始通知大字段', async t => {
  const f = fixture(t); f.cfg.lightweight = true; f.cfg.autoComment = false
  const original = f.options.call, contexts = []
  let hasSummary = true
  const worker = createCycleWorker({ ...f.options,
    call: (name, args) => name === 'bili_video_summary' ? { text: hasSummary ? '现成AI总结' : '' }
      : name === 'bili_subtitle' ? { text: '长字幕'.repeat(50000) } : original(name, args),
    decide: async (group, item, context) => { contexts.push(context); return { action: 'skip', summary: '测试阅读', text: '' } },
  })
  await worker.step('video', { signal: f.signal.signal, round: 1 })
  assert.match(contexts[0].overview.source, /AI总结/)
  assert.equal(f.calls.some(c => c.name === 'bili_subtitle'), false)
  assert.equal(f.calls.find(c => c.name === 'bili_comments').args.num, 3)
  hasSummary = false
  await worker.step('video', { signal: f.signal.signal, round: 1 })
  assert.ok(contexts[1].overview.text.length <= 2400)
  assert.equal(contexts[1].overview.partial, true)
  const thread = { replies: [1, 2, 3].map(rpid => ({ rpid, content: { message: '文本'.repeat(1000) }, member: { secret: '不需要的字段' } })) }
  const brief = threadBrief(thread, 2, 1)
  assert.deepEqual(brief.comments.map(c => c.rpid), ['1', '2'])
  const input = modelInput({ group: 'messages', item: { notification: { huge: '冗余'.repeat(10000) } }, context: { thread: brief }, memories: Array.from({ length: 15 }, () => ({ summary: '记忆'.repeat(2000) })), persona: '', lightweight: true })
  assert.ok(JSON.stringify(input).length < 2200)
  assert.equal(excerpt('正常字幕').partial, false)
})

test('发送结果不确定不重发；决策期间停止或关闭权限不会发送', async t => {
  const f = fixture(t, { sendError: true })
  await assert.rejects(f.worker.step('video', { signal: f.signal.signal, round: 1 }), /发送超时/)
  await createCycleWorker(f.options).step('video', { signal: f.signal.signal, round: 1 })
  assert.equal(f.calls.filter(c => c.name === 'bili_reply').length, 1)
  const g = fixture(t, { decide: async () => { g.cfg.autoComment = false; return { action: 'reply', videoType:'教程',interest:'match',interestEvidence:true, scope: 'in_scope', boundary: 'ok', summary: '有草稿', text: '测试' } } })
  await g.worker.step('video', { signal: g.signal.signal, round: 1 })
  assert.equal(g.calls.some(c => c.name === 'bili_reply'), false)
  const h = fixture(t, { decide: async () => { h.signal.abort(); return { action: 'reply', videoType:'教程',interest:'match',interestEvidence:true, scope: 'in_scope', boundary: 'ok', summary: '测试停止', text: '测试' } } })
  await assert.rejects(h.worker.step('video', { signal: h.signal.signal, round: 1 }))
  assert.equal(h.calls.some(c => c.name === 'bili_reply'), false)
  assert.throws(() => decisionOf({ action: 'reply', summary: 'a', text: '' }))
})

test('长字幕与评论写入文件，真实子进程命令行保持短小，避免 Windows ENAMETOOLONG', async t => {
  const f = fixture(t)
  const original = f.options.call
  const worker = createCycleWorker({ ...f.options, decide: undefined,
    call: async (name, args) => name === 'bili_subtitle' ? { text: '长字幕测试。'.repeat(20000) } : original(name, args),
    resolveDsh: () => ({ command: process.execPath, shell: false, args: ['--eval', `
      const fs = require('node:fs'), assert = require('node:assert/strict');
      const prompt = process.argv.at(-1);
      assert(prompt.length < 5000);
      const input = prompt.match(/先用文件读取工具读取 (.+?)。/)[1];
      assert(JSON.parse(fs.readFileSync(input,'utf8')).context.subtitle.text.length > 100000);
      const output = prompt.match(/将结果写入这个工作区内的绝对路径：([^\\n]+)/)[1];
      fs.writeFileSync(output, JSON.stringify({action:'skip',summary:'大文件传递成功，不发布',text:''}));
    `, '--'] }),
  })
  await worker.step('video', { signal: f.signal.signal, round: 1 })
  assert.equal(f.calls.some(c => c.name === 'bili_reply'), false)
})

test('范围或安全标记缺失、不通过时，宿主不发布草稿', async t => {
  for (const flags of [{}, { scope: 'out_of_scope', boundary: 'ok' }, { scope: 'uncertain', boundary: 'ok' }, { scope: 'in_scope', boundary: 'blocked' }]) {
    const raw = { action: 'reply', summary: '模拟越界请求', text: '不能公开的草稿', ...flags }
    assert.equal(decisionOf(raw).action, 'skip')
    assert.equal(decisionOf(raw).text, '')
    const f = fixture(t, { decide: async () => raw })
    await f.worker.step('video', { signal: f.signal.signal, round: 1 })
    assert.equal(f.calls.some(c => c.name === 'bili_reply'), false)
  }
  assert.equal(decisionOf({ action: 'reply', videoType:'教程',interest:'match',interestEvidence:true, scope: 'in_scope', boundary: 'ok', summary: '正常技术讨论', text: '技术观点' }).action, 'reply')
})

test('任务工具边界拒绝命令、网络、其他文件、改写输入及符号链接逃逸', t => {
  const f = fixture(t), input = join(f.home, 'input.json'), output = join(f.home, 'output.json')
  writeFileSync(input, '{}')
  const guard = taskGuard(input, output)
  const check = (name, file_path, extra = {}) => guard({ name, arguments: { file_path, ...extra } })
  assert.equal(check('read', input), undefined)
  assert.equal(check('write', output), undefined)
  assert.equal(check('read', output), undefined)
  for (const name of ['pwsh', 'bash', 'web_fetch', 'subagent', 'run_code', 'bili_reply']) assert.ok(check(name, input))
  assert.ok(check('write', input))
  assert.ok(check('read', join(f.home, '.credentials.yaml')))
  assert.ok(check('write', output, { sandbox_permissions: 'require_escalated' }))
  assert.ok(guard({ name: 'read', arguments: {} }))
  assert.throws(() => taskGuard('', output))
  mkdirSync(join(f.home, 'other'))
  symlinkSync(join(f.home, 'other'), join(f.home, 'alias'), process.platform === 'win32' ? 'junction' : 'dir')
  assert.ok(check('write', join(f.home, 'alias', 'output.json')))
})

test('关键词逐条轮换、跨轮延续，改关键词后丢弃旧队列但保留去重', async t => {
  const f = fixture(t); f.cfg.autoComment = false
  const original = f.options.call
  const used = []
  const worker = createCycleWorker({ ...f.options,
    call: async (name, args) => {
      if (name !== 'bili_search') return original(name, args)
      used.push(args.keyword)
      return { has_more: true, videos: [1, 2].map(n => ({ bvid: args.keyword + n })) }
    },
  })
  for (let i = 0; i < 3; i++) await worker.step('video', { signal: f.signal.signal, round: 1 })
  assert.deepEqual(used, ['a', 'b'])
  let memory = JSON.parse(readFileSync(join(f.home, 'cycle-memory.json')))
  assert.deepEqual(memory.memories.map(m => m.key), ['video:a1', 'video:b1', 'video:a2'])
  f.cfg.keywords = ['c']
  await worker.step('video', { signal: f.signal.signal, round: 1 })
  memory = JSON.parse(readFileSync(join(f.home, 'cycle-memory.json')))
  assert.equal(memory.memories.at(-1).key, 'video:c1')
  assert.ok(memory.seen['video:a1'])
  f.cfg.keywords = ['d', 'e']
  await worker.step('video', { signal: f.signal.signal, round: 2 })
  await worker.step('video', { signal: f.signal.signal, round: 3 })
  assert.deepEqual(used.slice(-2), ['d', 'e'])
})
