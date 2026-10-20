import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, utimesSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Cycle, CYCLE_DEFAULTS } from './cycle.mjs'
import { createCycleWorker, decisionOf } from './cycle-worker.mjs'
import { ACTIVITY_DEFAULTS, addUsage, budgetBlocked, todayUsage, relevantMemories, maintainFiles } from './activity.mjs'
import { threadBrief } from './reading.mjs'
import { MEME_DEFAULTS, listMemes, importMeme, selectMemes, memePrompt, DEFAULT_EMOTES, upgradeMemeCodes } from './memes.mjs'
import { PET_DEFAULTS, petPrompt, normalizePet } from './pet-profile.mjs'
import { apply as boundary } from './task-boundary.mjs'

function temp(t) {
  const home = mkdtempSync(join(tmpdir(), 'bili-operations-'))
  mkdirSync(join(home, 'out')); mkdirSync(join(home, 'decisions'))
  t.after(() => rmSync(home, { recursive: true, force: true })); return home
}
function setup(t) {
  const home = temp(t), calls = [], signal = new AbortController().signal
  const cfg = { ...CYCLE_DEFAULTS, ...ACTIVITY_DEFAULTS, keywords: ['人工智能'], lightweight: true, messagesNewOnly: false, autoComment: true, replyToComments: true, cooldownSec: 0, reportLevel: 'full' }
  let items = []
  const call = async (name, args) => {
    calls.push({ name, args })
    if (name === 'bili_search') return { videos: [{ bvid: 'BV1111111111', title: 'AI实践' }] }
    if (name === 'bili_video_info') return { title: 'AI实践', description: '明确的技术说明' }
    if (name === 'bili_video_summary') return { text: '可核查的具体技术内容' }
    if (name === 'bili_comments') return { comments: [] }
    if (name === 'bili_inbox') return { items }
    if (name === 'bili_thread_context') return { root: { rpid: 40, content: '根问题' }, replies: [{ rpid: 42, parent: 41, content: '目标问题' }, { rpid: 41, content: '中间回答' }] }
    if (name === 'bili_reply') return { rpid: 999, success: true }
    throw Error('意外接口 ' + name)
  }
  const options = { home, config: () => cfg, call, log: () => {}, env: () => ({}), decide: async () => ({ action: 'reply', videoType:'教程',interest:'match',interestEvidence:true, scope: 'in_scope', boundary: 'ok', summary: '针对具体内容回应', text: '这项技术的具体实现值得讨论。' }) }
  return { home, cfg, calls, signal, options, setItems: value => { items = value } }
}

test('浏览本地硬筛选不读总结、不调用模型；消息问候不受视频口味阻拦',async t=>{
  const f=setup(t);f.cfg.browseBlockedUids=['7']
  const original=f.options.call
  f.options.call=async(name,args)=>name==='bili_search'?{videos:[{bvid:'BV1111111111',title:'AI教程',author_uid:'7'}]}:original(name,args)
  f.options.decide=async()=>{throw Error('不应调用模型')}
  const w=createCycleWorker(f.options)
  await w.step('video',{signal:f.signal,round:1})
  assert.equal(f.calls.some(c=>c.name==='bili_video_summary'),false)
  assert.match(w.status().activity[0].summary,/屏蔽UP/)
  const g=setup(t);g.cfg.browseTypes=[];g.cfg.browseAuthorMode='only';g.cfg.browseBlockedUids=['7'];g.setItems([{bvid:'BV1111111111',rpid:42,root:40,id:'greeting'}]);await createCycleWorker(g.options).step('messages',{signal:g.signal,round:1});assert.equal(g.calls.some(c=>c.name==='bili_reply'),true)
})
test('语义筛选复用一次判断，严格证据不足不发送；生成后改UP屏蔽也拦截',async t=>{
  for(const mode of ['missing','uncertain','changed','match']){
    const f=setup(t);f.cfg.browseStrictness='strict'
    const original=f.options.call;let count=0
    f.options.call=async(name,args)=>name==='bili_search'?{videos:[{bvid:'BV1111111111',title:'AI教程',author_uid:'7'}]}:original(name,args)
    f.options.decide=async()=>{count++;if(mode==='changed')f.cfg.browseBlockedUids=['7'];return {action:'reply',videoType:'教程',interest:'match',interestEvidence:true,scope:'in_scope',boundary:'ok',summary:'AI技术教程',text:'这里的实现很有意思。',interest:mode==='missing'?undefined:'match',interestEvidence:mode!=='uncertain'}}
    const w=createCycleWorker(f.options);await w.step('video',{signal:f.signal,round:1})
    assert.equal(count,1);assert.equal(f.calls.some(c=>c.name==='bili_reply'),mode==='match')
  }
})

test('判断经多次校验仍保留范围和安全标记，真实后台reply不会被二次校验误跳过', () => {
  const raw = { action: 'reply', videoType:'教程',interest:'match',interestEvidence:true, scope: 'in_scope', boundary: 'ok', summary: '资料充分', text: '针对明确内容的评论。' }
  assert.deepEqual(decisionOf(decisionOf(raw)), decisionOf(raw))
  assert.equal(decisionOf(decisionOf(raw)).action, 'reply')
})
test('主人@只在开关、明确喜欢及UID核验通过时加入；字数超限回退为普通正文', async t => {
  for (const mode of ['enabled','disabled','not-liked','too-long','changed']) {
    const f=setup(t)
    Object.assign(f.cfg,{ownerBiliUid:'12345',mentionOwnerOnLikedVideo:mode!=='disabled',maxCommentChars:mode==='too-long'?18:100})
    const original=f.options.call
    f.options.call=async(name,args)=>{
      if(name==='bili_user_info') { if(mode==='changed')f.cfg.mentionOwnerOnLikedVideo=false; return {uid:'12345',name:'主人账号'} }
      return original(name,args)
    }
    f.options.decide=async()=>({action:'reply',videoType:'教程',interest:'match',interestEvidence:true,scope:'in_scope',boundary:'ok',summary:'喜欢具体技术实现',text:'这个实现挺有意思。',shareWithOwner:mode!=='not-liked'})
    if(mode==='too-long') f.cfg.maxCommentChars=12
    await createCycleWorker(f.options).step('video',{signal:f.signal})
    const sent=f.calls.find(c=>c.name==='bili_reply')?.args
    assert.ok(sent,mode)
    assert.equal(sent.mention_uid,mode==='enabled'?'12345':undefined,mode)
    assert.equal(sent.text.startsWith('@'),mode==='enabled',mode)
  }
})
test('扩充表情附带语境说明、旧映射补说明但保留用户自定义解释', t => {
  const home=temp(t), catalog=listMemes(home,{...MEME_DEFAULTS,memeImagesEnabled:false})
  assert.equal(catalog.length,42)
  assert.equal(new Set(DEFAULT_EMOTES.map(r=>r[1])).size,42)
  assert.match(catalog.find(m=>m.code==='[doge]').usage,/反话/)
  assert.match(catalog.find(m=>m.code==='[微笑]').usage,/敷衍/)
  assert.match(memePrompt(home,MEME_DEFAULTS),/不消费他人痛苦/)
  const upgraded=upgradeMemeCodes('调皮|[doge]\n自己的含义|[笑]|我自己的说明')
  assert.match(upgraded,/调皮\|\[doge\]\|常标记/)
  assert.match(upgraded,/自己的含义\|\[笑\]\|我自己的说明/)
})
test('回复视频问题按需读总结；隐含问题只补读一次，缺资料不循环，关闭后不读取', async t => {
  for (const mode of ['explicit','implicit','unavailable','disabled']) {
    const f=setup(t), original=f.options.call
    f.cfg.messageVideoContext=mode!=='disabled'
    f.setItems([{key:'q-'+mode,bvid:'BV1111111111',rpid:42,root:40,notification:{item:{source_content:mode==='explicit'?'视频讲了什么？':'这个地方为什么要这样处理？'}}}])
    f.options.call=async(name,args)=>{
      if(name==='bili_video_summary' || name==='bili_subtitle') {
        f.calls.push({name,args})
        return {text:mode==='unavailable'?'':'有依据的具体技术细节'}
      }
      return original(name,args)
    }
    let judgments=0
    f.options.decide=async(group,item,context)=>{
      judgments++
      if(mode==='explicit')assert.match(context.overview.text,/具体技术/)
      if(!context.overview||mode==='unavailable')return {action:'read_video',scope:'in_scope',boundary:'ok',summary:'本次在问视频细节',text:''}
      return {action:'reply',videoType:'教程',interest:'match',interestEvidence:true,scope:'in_scope',boundary:'ok',summary:'已按提供的总结回应',text:'这里用了资料中提到的具体技术。'}
    }
    await createCycleWorker(f.options).step('messages',{signal:f.signal})
    assert.equal(f.calls.filter(c=>c.name==='bili_video_summary').length,mode==='disabled'?0:1,mode)
    assert.equal(f.calls.filter(c=>c.name==='bili_subtitle').length,mode==='unavailable'?1:0,mode)
    assert.equal(judgments,['explicit','disabled'].includes(mode)?1:2,mode)
    assert.equal(f.calls.some(c=>c.name==='bili_reply'),['explicit','implicit'].includes(mode),mode)
  }
})

test('手动开始取消已有休息；休息中也能立即开始新轮，保留未完成条目进度', async () => {
  let now = 1000, calls = 0
  const cfg = { ...CYCLE_DEFAULTS, messagesEnabled: false, restMinutes: 10 }
  const loop = new Cycle({ config: () => cfg, now: () => now, save: () => {}, step: async () => { calls++; return {} }, state: { round: 2, counts: { video: 5, messages: 5 }, restUntil: now + 600000, phase: 'resting' } })
  loop.start(); await loop.tick()
  assert.equal(calls, 1); assert.equal(loop.state.round, 3); assert.equal(loop.state.restUntil, 0)
  Object.assign(loop.state, { restUntil: now + 60000, phase: 'resting' })
  assert.equal(loop.start().ok, true); await loop.tick(); assert.equal(calls, 2)
  loop.stop(); const count = loop.state.counts.video; loop.start(); assert.equal(loop.state.counts.video, count)
})

test('休息改0立即生效；0休息连续进入下轮，消息独立轮询不被视频休息阻塞', async () => {
  let now = 1000
  const order = [], cfg = { ...CYCLE_DEFAULTS, independentMessages: true, videoCount: 1, messagesIntervalSec: 1, restMinutes: 10 }
  const loop = new Cycle({ config: () => cfg, now: () => now, save: () => {}, step: async g => { order.push(g); return { empty: g === 'messages' } } })
  loop.start(); await loop.tick(); await loop.tick(); await loop.tick()
  assert.equal(loop.state.phase, 'resting')
  now += 1000; await loop.tick(); assert.equal(order.at(-1), 'messages')
  const oldRound = loop.state.round; cfg.restMinutes = 0; await loop.tick(); assert.equal(loop.state.round, oldRound + 1)
  await loop.tick(); assert.equal(loop.state.restUntil, 0)
})

test('预算区分浏览和回复保留额度，按北京时间跨日恢复；估算明确分开', () => {
  const ledger = {}, now = Date.parse('2026-10-20T15:59:59Z'), cfg = { dailyTokenBudget: 100, replyReserveTokens: 30 }
  addUsage(ledger, 'video', { totalTokens: 70 }, 0, now)
  assert.equal(budgetBlocked(ledger, cfg, 'video', now), true)
  assert.equal(budgetBlocked(ledger, cfg, 'messages', now), false)
  addUsage(ledger, 'messages', null, 31, now)
  assert.equal(todayUsage(ledger, now).estimated, 31)
  assert.equal(budgetBlocked(ledger, cfg, 'messages', now), true)
  assert.equal(budgetBlocked(ledger, cfg, 'video', now + 2000), false)
})

test('新消息在同一视频轮次中重新读取；缓存复用简介；上下文含父评论', async t => {
  const f = setup(t), contexts = []; f.cfg.replyToComments = false
  const w = createCycleWorker({ ...f.options, decide: async (_, item, context) => { contexts.push(context); return { action: 'skip', summary: '阅读后不发', text: '' } } })
  const opt = { signal: f.signal, round: 1, poll: true }
  assert.equal((await w.step('messages', opt)).empty, true)
  f.setItems([{ id: 1, bvid: 'BV1111111111', root: 40, rpid: 42 }]); await w.step('messages', opt)
  f.setItems([{ id: 2, bvid: 'BV1111111111', root: 40, rpid: 41 }]); await w.step('messages', opt)
  assert.equal(contexts.length, 2)
  assert.deepEqual(contexts[0].thread.comments.map(c => c.rpid), ['40', '41', '42'])
  assert.equal(f.calls.filter(c => c.name === 'bili_video_info').length, 1)
  assert.equal(f.calls.some(c => ['bili_subtitle', 'bili_comments', 'bili_reply'].includes(c.name)), false)
})

test('仅取本楼层记忆，不把无关视频和楼层塞进上下文', () => {
  const memories = [{ bvid: 'a', root: 1, summary: '目标' }, { bvid: 'a', root: 2 }, { bvid: 'b', root: 1 }]
  assert.deepEqual(relevantMemories(memories, { bvid: 'a', root: 1 }), [memories[0]])
  const brief = threadBrief({ replies: [{ rpid: 2, parent: 1, content: '问答' }, { rpid: 1, content: '父评论' }] }, 2, 1)
  assert.equal(brief.comments.length, 2)
})

test('对话工具和循环共用发送去重；缺范围标记及待确认说明不能发送', async t => {
  const f = setup(t), w = createCycleWorker(f.options)
  await w.step('video', { signal: f.signal, round: 1 })
  const args = { bvid: 'BV1111111111', text: '这项技术的具体实现值得讨论。', scope: 'in_scope', boundary: 'ok' }
  await w.sendManual(args)
  assert.equal(f.calls.filter(c => c.name === 'bili_reply').length, 1)
  const bad = await w.sendManual({ ...args, bvid: 'BV2222222222', scope: 'uncertain' }); assert.equal(bad.ok, false)
  await w.sendManual({ ...args, bvid: 'BV3333333333', text: '准备好了，等你确认发送。' })
  assert.equal(f.calls.filter(c => c.name === 'bili_reply').length, 1)
  assert.ok(w.status().activity.some(e => e.sendState === 'accepted' && e.url.includes('comment_root_id')))
})

test('楼层发言上限与本地排除词在调用模型前生效', async t => {
  const f = setup(t); f.cfg.maxThreadReplies = 1
  const w = createCycleWorker(f.options), args = { bvid: 'BV1111111111', root: 40, rpid: 42, text: '针对问题的回答。', scope: 'in_scope', boundary: 'ok' }
  await w.sendManual(args); await w.sendManual({ ...args, rpid: 43, text: '新的表态。' })
  assert.equal(f.calls.filter(c => c.name === 'bili_reply').length, 1)
  let decisions = 0
  const g = setup(t); g.cfg.excludedWords = ['实践']
  const worker = createCycleWorker({ ...g.options, decide: async () => { decisions++; throw Error('不该调用') } })
  await worker.step('video', { signal: g.signal, round: 1 })
  assert.equal(decisions, 0); assert.equal(g.calls.some(c => c.name === 'bili_subtitle'), false)
})

test('同人同楼层补充只做一次判断，其他人的消息保留', async t => {
  const f = setup(t); f.cfg.replyToComments = false
  f.setItems([42, 41].map(rpid => ({ id: rpid, bvid: 'BV1111111111', root: 40, rpid, notification: { user: { mid: 123 }, item: { source_content: '补充' } } })))
  let count = 0
  const w = createCycleWorker({ ...f.options, decide: async (_, item, context) => { count++; assert.equal(context.relatedMessages.length, 1); return { action: 'skip', summary: '合并阅读', text: '' } } })
  await w.step('messages', { signal: f.signal, round: 1, poll: true })
  assert.equal((await w.step('messages', { signal: f.signal, round: 1, poll: true })).empty, true)
  assert.equal(count, 1)
})

test('真实用量事件由宿主写入，模型不可读写；同样用量的两次调用都计费', t => {
  const home = temp(t), input = join(home, 'in.json'), output = join(home, 'out.json'), usage = join(home, 'usage.json')
  writeFileSync(input, '{}')
  const old = [process.env.BILI_TASK_INPUT, process.env.BILI_TASK_OUTPUT, process.env.BILI_TASK_USAGE]
  Object.assign(process.env, { BILI_TASK_INPUT: input, BILI_TASK_OUTPUT: output, BILI_TASK_USAGE: usage })
  try {
    const events = {}; let guard
    boundary({ tools: { guard: fn => { guard = fn } }, on: (name, fn) => { events[name] = fn } })
    const message = { type: 'assistant/message', data: { usage: { totalTokens: 25 } } }
    events['session/event']({ id: 1 }, message); events['session/event']({ id: 1 }, message)
    assert.equal(JSON.parse(readFileSync(usage)).totalTokens, 50)
    assert.ok(guard({ name: 'write', arguments: { file_path: usage } }))
  } finally { ['BILI_TASK_INPUT', 'BILI_TASK_OUTPUT', 'BILI_TASK_USAGE'].forEach((k, i) => old[i] === undefined ? delete process.env[k] : process.env[k] = old[i]) }
})

test('文件保留只清理过期生成文件，发送账本、未知资料与新任务不动', t => {
  const home = temp(t), old = join(home, 'decisions', '12345678-1234-1234-1234-123456789abc-input.json'), note = join(home, 'decisions', '原始资料.json')
  writeFileSync(old, '{}'); writeFileSync(note, '{}'); writeFileSync(join(home, 'cycle-memory.json'), '{}')
  utimesSync(old, new Date(0), new Date(0)); utimesSync(note, new Date(0), new Date(0))
  maintainFiles(home, ACTIVITY_DEFAULTS)
  assert.equal(existsSync(old), false); assert.equal(existsSync(note), true); assert.equal(existsSync(join(home, 'cycle-memory.json')), true)
})


test('档案替换名字主人范围及风格，不保留旧角色；上下限规范化', () => {
  const cfg = { ...PET_DEFAULTS, petName: '团团', ownerTitle: '新主人', petWorkScope: '动画制作', petPersonality: '安静好奇', petSpeechStyle: '简短温柔', petExamples: '这个转场好轻呀。', maxCommentChars: 25, maxReplyChars: 60 }
  const prompt = petPrompt(cfg, 'video')
  for (const value of ['团团', '新主人', '动画制作', '安静好奇', '简短温柔', '25个Unicode字符']) assert.ok(prompt.includes(value))
  assert.equal(prompt.includes('GPT6'), false); assert.equal(prompt.includes('Token'), false)
  assert.ok(petPrompt(cfg, 'messages').includes('60个Unicode字符'))
  assert.equal(normalizePet({ maxCommentChars: 0 }).maxCommentChars, 1)
  assert.equal(normalizePet({ maxReplyChars: 99999 }).maxReplyChars, 1000)
})

test('统一发送按不同字数上限拦截，emoji按码点计数且不截断正文', async t => {
  const f = setup(t); f.cfg.maxCommentChars = 2; f.cfg.maxReplyChars = 4
  const w = createCycleWorker(f.options), args = { bvid: 'BV2222222222', text: '好😀', scope: 'in_scope', boundary: 'ok' }
  await w.sendManual(args)
  await w.sendManual({ ...args, bvid: 'BV3333333333', text: '太长了' })
  await w.sendManual({ ...args, bvid: 'BV4444444444', root: 40, rpid: 42, text: '收到补充' })
  const sends = f.calls.filter(c => c.name === 'bili_reply')
  assert.deepEqual(sends.map(c => c.args.text), ['好😀', '收到补充'])
})

test('生成中降低字数上限，发布前按最新配置拦截', async t => {
  const f = setup(t); f.cfg.maxCommentChars = 80
  const w = createCycleWorker({ ...f.options, decide: async () => {
    f.cfg.maxCommentChars = 2
    return { action: 'reply', videoType:'教程',interest:'match',interestEvidence:true, scope: 'in_scope', boundary: 'ok', summary: '有效观点', text: '有趣的设计' }
  } })
  await w.step('video', { signal: f.signal, round: 1 })
  assert.equal(f.calls.some(c => c.name === 'bili_reply'), false)
  assert.ok(w.status().activity.some(e => e.outcome.includes('字数上限')))
})


test('评论区12061关闭错误跳过条目且不调用模型，网络故障仍抛出重试', async t => {
  const f = setup(t); let decisions = 0
  const w = createCycleWorker({ ...f.options, call: async (name, args) => {
    if (name === 'bili_comments') throw Error("ResponseCodeException: 接口返回错误代码：12061，信息：UP主已关闭评论区。")
    return f.options.call(name, args)
  }, decide: async () => { decisions++; throw Error('不能调用') } })
  await w.step('video', { signal: f.signal, round: 1 })
  assert.equal(decisions, 0)
  assert.ok(w.status().activity.some(e => e.outcome.includes('已跳过') && e.summary.includes('12061')))
  const g = setup(t), bad = createCycleWorker({ ...g.options, call: async (name, args) => { if (name === 'bili_comments') throw Error('HTTP 503'); return g.options.call(name, args) } })
  await assert.rejects(bad.step('video', { signal: g.signal, round: 1 }), /503/)
})

test('表情开关、概率、数量、冷却和图库ID隔离，提示不给模型文件路径', t => {
  const home = temp(t), cfg = { ...MEME_DEFAULTS, memeChance: 100, memeCooldownSec: 10, memeMaxCount: 1 }
  const data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII='
  importMeme(home, { pack: 'gpt6', emotion: '开心', name: '开心.png', data })
  const all = listMemes(home, cfg), image = all.find(m => m.kind === 'image'), ids = all.map(m => m.id)
  assert.ok(image); assert.equal(listMemes(home, { ...cfg, memePack: 'other' }).some(m => m.kind === 'image'), false)
  assert.equal(selectMemes(home, cfg, ids, 0, 100000, () => 0).length, 1)
  assert.equal(selectMemes(home, { ...cfg, memeEnabled: false }, ids, 0, 100000).length, 0)
  assert.equal(selectMemes(home, { ...cfg, memeChance: 0 }, ids, 0, 100000, () => 0).length, 0)
  assert.equal(selectMemes(home, cfg, ids, 99000, 100000).length, 0)
  assert.equal(selectMemes(home, cfg, ['../secret'], 0, 100000).length, 0)
  assert.equal(memePrompt(home, cfg).includes(image.file), false)
  assert.throws(() => importMeme(home, { pack: '../x', emotion: '开心', name: 'x.png', data }))
  assert.throws(() => importMeme(home, { pack: 'gpt6', emotion: '../../x', name: 'x.png', data }))
  assert.throws(() => importMeme(home, { pack: 'gpt6', emotion: '开心', name: 'x.png', data: Buffer.from('not image').toString('base64') }))
})

test('正文与图片合并一次发布并保留表情；自带表情不会突破字数上限', async t => {
  const f = setup(t); Object.assign(f.cfg, MEME_DEFAULTS, { memeChance: 100, memeCooldownSec: 0, memeMaxCount: 2, maxCommentChars: 2 })
  importMeme(f.home, { pack: 'gpt6', emotion: '开心', name: '开心.png', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=' })
  const all = listMemes(f.home, f.cfg), emoji = all.find(m => m.kind === 'emoji'), image = all.find(m => m.kind === 'image')
  const w = createCycleWorker(f.options)
  await w.sendManual({ bvid: 'BV2222222222', text: '好呀', scope: 'in_scope', boundary: 'ok', memeIds: [emoji.id, image.id] })
  const sends = f.calls.filter(c => c.name === 'bili_reply')
  assert.equal(sends.length, 1); assert.equal(sends[0].args.text, '好呀'); assert.deepEqual(sends[0].args.images, [image.file])
  assert.equal(w.status().activity.at(-1).memes[0].id, image.id)
  f.cfg.maxCommentChars = 80
  await w.sendManual({ bvid: 'BV3333333333', text: '好呀', scope: 'in_scope', boundary: 'ok', memeIds: [emoji.id] })
  assert.equal(f.calls.filter(c => c.name === 'bili_reply').at(-1).args.text, '好呀' + emoji.code)
})


test('单轮独立消息模式：一次收件箱为空后，视频未结束仍继续检查新@', async () => {
  let now = 1000, polls = 0
  const cfg = { ...CYCLE_DEFAULTS, independentMessages: true, videoCount: 4, messagesCount: 3, videoIntervalSec: 1, messagesIntervalSec: 1 }
  const loop = new Cycle({ config: () => cfg, now: () => now, save: () => {}, step: async g => g === 'messages' ? (++polls === 1 ? { empty: true } : {}) : {} })
  loop.start({ once: true })
  for (let i = 0; i < 4; i++) { await loop.tick(); now += 1000 }
  assert.equal(polls, 2); assert.equal(loop.state.counts.messages, 1)
})

test('独立消息组每次空队列重新取通知，使用真实根楼层发送和记录', async t => {
  const f = setup(t); f.cfg.independentMessages = true
  const w = createCycleWorker({ ...f.options, call: async (name, args) => {
    if (name === 'bili_reply') { assert.equal(args.root, 40); return { success: true, rpid: 999, root: 40, parent: 42 } }
    return f.options.call(name, args)
  } })
  assert.equal((await w.step('messages', { signal: f.signal, round: 1 })).empty, true)
  f.setItems([{ id: 'at:1', kind: 'at', bvid: 'BV1111111111', rpid: 42, root: 42, time: 10, notification: { item: { source_content: '出来玩' } } }])
  await w.step('messages', { signal: f.signal, round: 1 })
  assert.equal(w.status().activity.at(-1).root, 40)
  const ledger = JSON.parse(readFileSync(join(f.home, 'cycle-memory.json'), 'utf8'))
  assert.equal(ledger.sent['message:BV1111111111:42'].root, 40)
  assert.match(readFileSync(join(f.home, 'seen.md'), 'utf8'), /40/)
})
