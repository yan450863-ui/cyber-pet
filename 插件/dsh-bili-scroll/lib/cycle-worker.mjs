import { taskPrompt } from './task-prompt.mjs'
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync, renameSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { memePrompt, selectMemes } from './memes.mjs'
import { petPrompt, textLimit, recognizeSelf } from './pet-profile.mjs'
import { withinHours } from './cycle.mjs'
import { excerpt, videoBrief, threadBrief, modelInput, asksAboutVideo, READING_DEFAULTS, normalizeReading, canSupplement } from './reading.mjs'
import { ACTIVITY_DEFAULTS, addUsage, budgetBlocked, todayUsage, threadKey, relevantMemories, contentFilter, keywordWeight, maintainFiles } from './activity.mjs'
import { BROWSE_DEFAULTS, browseGate, browsePrompt, browseSignature, videoType, typePreference, recentCandidate, comparePopularity } from './browse-preferences.mjs'

export function decisionOf(raw) {
  if (!raw || typeof raw !== 'object' || !['skip', 'reply', 'read_video'].includes(raw.action)) throw new Error('模型未生成有效的行动判断')
  if (typeof raw.summary !== 'string' || !raw.summary.trim()) throw new Error('模型未保存内容理解')
  if (raw.action === 'reply' && (typeof raw.text !== 'string' || !raw.text.trim() || Array.from(raw.text.trim()).length > 1000)) throw new Error('评论正文为空或超过 1000 字')
  const permitted = raw.scope === 'in_scope' && raw.boundary === 'ok'
  if (['reply','read_video'].includes(raw.action) && !permitted) return { action: 'skip', summary: '工作边界检查未明确通过，已跳过发布', text: '' }
  return { action: raw.action, scope: raw.scope, boundary: raw.boundary, summary: raw.summary.slice(0, 4000), text: raw.action === 'reply' ? raw.text.trim() : '', videoType: raw.videoType, interest: raw.interest, interestEvidence:raw.interestEvidence===true, shareWithOwner: raw.shareWithOwner === true, taskId: /^[0-9a-f-]{36}$/.test(raw.taskId || '') ? raw.taskId : undefined, memeIds: Array.isArray(raw.memeIds) ? raw.memeIds.filter(x => typeof x === 'string').slice(0, 3) : [] }
}

function atomic(file, data) {
  const tmp = file + '.tmp'
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  renameSync(tmp, file)
}

function read(file, fallback) { try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return fallback } }

function check(result) {
  if (result?.error || result?.success === false) throw new Error(String(result.error || 'B站接口失败'))
  return result
}

export function createCycleWorker({ home, config, call, resolveDsh, log, env, decide, charter }) {
  const file = join(home, 'cycle-memory.json')
  let memoryError = ''
  let ledger = { seen: {}, sent: {}, memories: [], feed: {}, lastSentAt: 0 }
  if (existsSync(file)) {
    try {
      const saved = JSON.parse(readFileSync(file, 'utf8'))
      if (!saved || !saved.seen || !saved.sent || !Array.isArray(saved.memories)) throw new Error('格式不完整')
      ledger = saved
    } catch { memoryError = '去重记忆文件损坏，请修复 cycle-memory.json 后重启；为避免重复操作已暂停处理' }
  }
  // 发出后进程中断的请求结果不确定，保留为已尝试，禁止自动重发。
  ledger.seen ||= {}; ledger.sent ||= {}; ledger.memories ||= []; ledger.feed ||= {}
  ledger.events ||= ledger.memories.slice(-200).map(m => ({ ...m, at: Date.parse(m.at) || 0, bvid: m.bvid || m.key?.match(/BV[0-9A-Za-z]{10}/)?.[0] }))
  ledger.health ||= {}
  const save = () => atomic(file, ledger)
  const settings = () => ({ ...ACTIVITY_DEFAULTS, ...BROWSE_DEFAULTS, ...READING_DEFAULTS, ...config() })
  const excerptMemo = new Map()
  const cacheFile = join(home, 'video-cache.json'), cache = read(cacheFile, {})
  const cached = async (name, args) => {
    const cfg = settings(), key = `${name}:${args.bvid || args.uid}`, old = cache[key]
    if (cfg.cacheMinutes > 0 && old && Date.now() - old.at < cfg.cacheMinutes * 60_000) return old.value
    const value = check(await call(name, args))
    if (cfg.cacheMinutes > 0) {
      cache[key] = { at: Date.now(), value }
      for (const k of Object.keys(cache)) if (Date.now() - cache[k].at > cfg.cacheMinutes * 60_000) delete cache[k]
      while (Object.keys(cache).length > 1 && JSON.stringify(cache).length > 2_000_000) delete cache[Object.keys(cache)[0]]
      atomic(cacheFile, cache)
    }
    return value
  }
  const event = (group, item, outcome, decision = {}) => {
    ledger.events.push({ at: Date.now(), group, key: item.key, bvid: item.bvid, root: item.root || 0, rpid: item.rpid || 0,
      petId: config().petId || 'gpt6', title: item.title || item.bvid, browseType:decision.videoType||videoType(item), authorUid:item.author_uid, taskId: decision.taskId, outcome, summary: String(decision.summary || '').slice(0, 500), text: decision.text || '', memes: decision.memes || [] })
    ledger.events = ledger.events.slice(-300); save()
  }
  const syncInboxMode = () => {
    const newOnly = config().messagesNewOnly !== false
    if (ledger.inboxNewOnly !== newOnly) {
      ledger.inboxNewOnly = newOnly
      if (newOnly) ledger.inboxSince = Math.floor(Date.now() / 1000)
      ledger.feed.messages = []; ledger.feed.inboxLoaded = false
      save()
    }
  }
  if (!memoryError) syncInboxMode()
  if (!memoryError && !ledger.legacyImported) {
    const files = [join(home, 'seen.md')]
    if (existsSync(join(home, 'digest'))) files.push(...readdirSync(join(home, 'digest')).filter(n => n.endsWith('.md')).map(n => join(home, 'digest', n)))
    for (const old of files) if (existsSync(old)) {
      for (const bv of readFileSync(old, 'utf8').match(/BV[0-9A-Za-z]{10}/g) || []) ledger.seen['video:' + bv] ||= { at: 0, outcome: '沿用旧浏览记录' }
    }
    ledger.legacyImported = true; save()
  }
  const drafts = join(home, 'decisions')
  mkdirSync(drafts, { recursive: true })
  let child = null

  const choose = async (group, round, signal, poll = false) => {
    if (ledger.feed.round !== round) { ledger.feed = { round, videos: [], messages: ledger.feed.messages || [], keyword: 0, inboxLoaded: false }; save() }
    const f = ledger.feed
    f.videos ||= []; f.messages ||= []
    if (group === 'video') {
      const keywords = config().keywords?.filter(Boolean).length ? [...new Set(config().keywords.filter(Boolean))] : ['人工智能', '大模型', '二次元', '动画']
      const weighted = keywords.flatMap((word, index) => Array(Math.min(10, Math.max(0, keywordWeight(word, settings())))).fill(index))
      const signature = JSON.stringify([keywords, weighted, browseSignature(settings()), new Date().toISOString().slice(0,10)])
      if (f.searchSignature !== signature) {
        f.searchSignature = signature; f.searches = keywords.map(() => ({ page: 1, videos: [], exhausted: false }))
        f.videos = []; delete f.page; delete f.keyword; delete f.activeVideo; delete f.activeKeyword
      }
      if (f.activeVideo && !ledger.seen['video:' + f.activeVideo.bvid]) return { ...f.activeVideo, key: 'video:' + f.activeVideo.bvid }
      for (let i = 0; i < weighted.length; i++) {
        if (!weighted.length) return null
        const index = weighted[(ledger.nextKeyword || 0) % weighted.length], bucket = f.searches[index]
        bucket.videos = bucket.videos.filter(v => !ledger.seen['video:' + v.bvid])
        let pagesFetched=0
        while (!bucket.videos.length && !bucket.exhausted && pagesFetched++<3) {
          const result = check(await call('bili_search', { keyword: keywords[index], num: 50, order: settings().browseOrder==='recent_hot'?'click':settings().browseOrder, days:settings().browseDays, page: bucket.page }))
          signal.throwIfAborted()
          if (!Array.isArray(result?.videos)) throw new Error('搜索结果格式不正确')
          bucket.page++; bucket.exhausted = !result.has_more || !result.videos.length
          const preferred = settings().preferredAuthors
          const score=v=>(settings().browsePreferredUids.includes(String(v.author_uid))?10:0)+(preferred.includes(v.author)?5:0)+(typePreference(settings(),videoType(v))==='more'?3:typePreference(settings(),videoType(v))==='less'?-3:0)
          bucket.videos = result.videos.filter(v => v.bvid && !ledger.seen['video:' + v.bvid] && recentCandidate(v,settings()))
            .sort((a, b) => score(b)-score(a)||comparePopularity(a,b,settings()))
          save()
        }
        if (bucket.videos[0]) {
          f.activeVideo = bucket.videos[0]; f.activeKeyword = index; save()
          return { ...f.activeVideo, key: 'video:' + f.activeVideo.bvid }
        }
        ledger.nextKeyword = (ledger.nextKeyword || 0) + 1; save()
      }
      return null
    }
    syncInboxMode()
    if (!f.inboxLoaded || (poll && !f.messages.some(m => !ledger.seen[m.key]))) {
      const result = check(await call('bili_inbox', {}))
      signal.throwIfAborted()
      if (!Array.isArray(result?.items)) throw new Error('消息结果格式不正确')
      f.messages = result.items.filter(item => !ledger.inboxNewOnly || Number(item.time) > ledger.inboxSince).map(item => ({ ...item,
        key: item.bvid && item.rpid ? `message:${item.bvid}:${item.rpid}` : 'message:' + item.id }))
      f.inboxLoaded = true; save()
    }
    while (f.messages.length && ledger.seen[f.messages[0].key]) f.messages.shift()
    return f.messages[0] || null
  }

  const think = (group, item, context, signal) => new Promise((resolve, reject) => {
    signal.throwIfAborted()
    const resultFile = join(drafts, randomUUID() + '.json')
    const inputFile = resultFile.replace(/\.json$/, '-input.json')
    const usageFile = resultFile.replace(/\.json$/, '-usage.json')
    let persona = ''
    const workspace = config().workspace
    if (workspace && existsSync(join(workspace, 'AGENTS.md'))) persona = readFileSync(join(workspace, 'AGENTS.md'), 'utf8').slice(0, 16000)
    // Windows 的命令行总长约 32K；字幕、评论、记忆通过工作区文件传递。
    const input = modelInput({ group, persona, memories: relevantMemories(ledger.memories, item), item, context, lightweight: config().lightweight !== false })
    atomic(inputFile, input)
    event(group, item, '正在理解内容', { taskId: resultFile.split(/[\\/]/).at(-1).slice(0,36), summary: '正在阅读内容并准备判断' })
    const rules = (charter ? readFileSync(charter, 'utf8') : '') + petPrompt(config(), group) + memePrompt(home, config()) + (group==='video'?browsePrompt(settings()):'')
    const boundaryPatch = join(drafts, 'task-boundary.patch.json')
    atomic(boundaryPatch, [
      { id: 'system-prompt', config: { personaPrefix: rules, personaSuffix: '', includeHarnessIdentity: false } },
      { id: 'agent-instructions', disabled: true },
      { id: 'tools', config: { mode: 'native' } },
      { insert: [{ id: 'bili-task-boundary', name: pathToFileURL(fileURLToPath(new URL('./task-boundary.mjs', import.meta.url))).href }] },
    ])
    const prompt=taskPrompt(inputFile,resultFile,group,canSupplement(group,settings(),context.overview),recognizeSelf(config(),context))
    const dsh = resolveDsh()
    // 默认 headless profile 使用用户的 WorkBuddy 配置；固定无发言工具。
    const args = [...dsh.args, '--profile', config().headlessProfile || 'headless', '--patch', boundaryPatch, prompt]
    child = spawn(dsh.command, args, { cwd: home, shell: dsh.shell, windowsHide: true,
      env: { ...env(), DSH_HOME: join(home, '..'), BILI_TASK_INPUT: inputFile, BILI_TASK_OUTPUT: resultFile, BILI_TASK_USAGE: usageFile }, stdio: ['ignore', 'pipe', 'pipe'] })
    const proc = child
    const output = b => { try { appendFileSync(join(home, 'duty.log'), b); appendFileSync(resultFile.replace(/\.json$/, '-trace.log'), b) } catch {} }
    proc.stdout?.on('data', output); proc.stderr?.on('data', output)
    let settled = false
    const finish = (err, value) => {
      if (settled) return
      settled = true; clearTimeout(timeout); signal.removeEventListener('abort', abort)
      if (child === proc) child = null
      addUsage(ledger, group, read(usageFile, null), (JSON.stringify(input).length + rules.length + prompt.length + JSON.stringify(value || {}).length) / 2)
      ledger.health.model = { ok: !err, at: Date.now(), message: err ? String(err.message).slice(0, 240) : '模型判断成功' }; save()
      err ? reject(err) : resolve(value)
    }
    const kill = () => {
      if (process.platform === 'win32' && proc.pid) {
        const killer = spawn('taskkill.exe', ['/PID', String(proc.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
        killer.on('error', () => proc.kill())
      } else proc.kill('SIGTERM')
    }
    const abort = () => { kill(); finish(signal.reason || new Error('已停止')) }
    const timeout = setTimeout(() => { kill(); finish(new Error('模型单条处理超过 5 分钟，已终止并等待重试')) }, 300_000)
    timeout.unref?.()
    signal.addEventListener('abort', abort, { once: true })
    proc.on('error', e => finish(e))
    proc.on('close', code => {
      if (settled) return
      if (code !== 0) return finish(new Error(`模型调用失败（退出码${code}），请检查WorkBuddy反代、模型额度与后台配置；详情见运行日志`))
      try { finish(null, { ...decisionOf(read(resultFile, null)), taskId: resultFile.split(/[\\/]/).at(-1).slice(0, 36) }) } catch (e) { finish(e) }
    })
    if (signal.aborted) abort()
  })

  const record = (group, item, decision, outcome) => {
    ledger.seen[item.key] = { at: Date.now(), outcome }
    for (const key of item.coalescedKeys || []) ledger.seen[key] = { at: Date.now(), outcome: '同人同楼层补充已合并处理' }
    if (group === 'video' && Number.isInteger(ledger.feed.activeKeyword)) {
      ledger.nextKeyword = (ledger.nextKeyword || 0) + 1
      delete ledger.feed.activeVideo; delete ledger.feed.activeKeyword
    }
    ledger.memories.push({ petId: config().petId || 'gpt6', group, key: item.key, bvid: item.bvid, root: item.root || 0, summary: decision.summary.slice(0, 500), text: decision.text || '', memes: decision.memes || [], outcome, at: new Date().toISOString() })
    ledger.memories = ledger.memories.slice(-200)
    save()
    event(group, item, outcome, decision)
    const cfg = config()
    if (cfg.reportLevel !== 'off') {
      const date = new Date(), day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      const detail = cfg.reportLevel === 'brief' ? decision.summary.slice(0, 60) : decision.summary + (decision.text ? `\n正文：${decision.text}` : '')
      try { appendFileSync(join(home, 'out', day + '.md'), `\n### ${item.bvid || item.key}\n${group === 'video' ? '刷视频' : '消息互动'} · ${outcome}\n${detail}\n`, 'utf8') } catch (e) { log('报告写入失败：' + e.message) }
    }
  }

  // 循环与对话工具共享唯一发送锁、冷却和持久发送意图。
  let sendQueue = Promise.resolve()
  const publish = (group, item, decision, signal) => {
    const task = sendQueue.then(async () => {
      const allowed = cfg => group === 'video' ? cfg.autoComment : cfg.replyToComments
      if (!allowed(config())) return '已保存草稿，发言开关关闭'
      if (ledger.sent[item.key]) return '已有发送尝试，未重复发送'
      const previous = Object.values(ledger.sent).filter(s => s.thread === threadKey(item) && Date.now() - s.at < 864e5)
      if (group === 'messages' && settings().maxThreadReplies > 0 && previous.filter(s => s.state === 'accepted').length >= settings().maxThreadReplies) return '对话次数达到上限'
      if (previous.some(s => (s.baseText || s.text)?.replace(/\s/g, '') === decision.text.replace(/\s/g, ''))) return '同楼层正文重复，未发送'
      if (/等待.{0,12}(确认|发送)|准备好.{0,12}(确认|发送)|请.{0,8}确认.{0,8}发送/.test(decision.text)) return '正文仍含待发送说明，已拦截'
      const remaining = config().cooldownSec * 1000 - (Date.now() - (ledger.lastSentAt || 0))
      if (remaining > 0) await new Promise((resolve, reject) => {
        const done = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); resolve() }
        const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(signal.reason) }
        const timer = setTimeout(done, remaining)
        signal.addEventListener('abort', abort, { once: true })
        if (signal.aborted) abort()
      })
      signal.throwIfAborted()
      const current = config()
      if (Array.from(decision.text).length > textLimit(current, group)) return '正文超过当前字数上限，未发送'
      if (!allowed(current) || !current[group + 'Enabled'] || !withinHours(new Date(), current)) return '设置或运行时段已变更，未发布'
      if(group==='video') { const reason=browseGate({...item,...decision},settings(),{semantic:true}); if(reason)return reason+'，未发布' }
      const baseText = decision.text
      let finalText = baseText
      let ownerMention = null
      if (group === 'video' && decision.shareWithOwner && current.mentionOwnerOnLikedVideo && /^[1-9][0-9]{0,18}$/.test(current.ownerBiliUid || '')) {
        try {
          const owner = check(await cached('bili_user_info', { uid:current.ownerBiliUid }))
          if (!owner.name || String(owner.uid) !== current.ownerBiliUid || /[\r\n@]/.test(owner.name)) throw Error('账号昵称无法核验')
          const prefix = '@' + owner.name + ' '
          if (Array.from(prefix + baseText).length <= textLimit(config(), group)) { finalText = prefix + baseText; ownerMention = { uid:current.ownerBiliUid, name:owner.name } }
          else decision.summary += '；@主人后超出字数上限，本次仅发正文'
        } catch { decision.summary += '；主人账号未能核验，本次未@' }
      }
      signal.throwIfAborted()
      const latest = config()
      if (!allowed(latest) || !latest[group+'Enabled'] || !withinHours(new Date(), latest)) return '设置或运行时段已变更，未发布'
      if(group==='video'&&item.browseSignature&&item.browseSignature!==browseSignature(settings()))return '浏览口味已变更，旧判断未发布'
      if(group==='video'){const reason=browseGate({...item,...decision},settings(),{semantic:true});if(reason)return reason+'，未发布'}
      if (ownerMention && (!latest.mentionOwnerOnLikedVideo || latest.ownerBiliUid !== ownerMention.uid)) { finalText = baseText; ownerMention = null }
      if (Array.from(finalText).length > textLimit(latest, group)) return '正文超过当前字数上限，未发送'
      const selected = selectMemes(home, latest, decision.memeIds, ledger.lastMemeAt || 0)
      const used = []
      for (const m of selected) {
        if (m.kind === 'emoji') {
          if (Array.from(finalText + m.code).length > textLimit(latest, group)) continue
          finalText += m.code
        }
        used.push(m)
      }
      decision.text = finalText
      decision.memes = used.map(({ id, name, kind, emotion }) => ({ id, name, kind, emotion }))
      ledger.sent[item.key] = { baseText, memes: decision.memes, at: Date.now(), state: 'pending', text: decision.text, bvid: item.bvid, root: item.root || 0, parent: item.rpid || 0, thread: threadKey(item) }
      ledger.lastSentAt = Date.now(); if (used.length) ledger.lastMemeAt = Date.now(); save()
      event(group, item, '发送结果待确定', decision)
      try {
        const receipt = check(await call('bili_reply', { bvid: item.bvid, text: decision.text, ...(ownerMention ? { mention_uid:ownerMention.uid, mention_name:ownerMention.name } : {}), ...(used.some(m => m.kind === 'image') ? { images: used.filter(m => m.kind === 'image').map(m => m.file) } : {}),
          rpid: group === 'messages' ? item.rpid : 0, root: group === 'messages' ? item.root : 0 }))
        if (group === 'messages' && Number(receipt.root) > 0) item.root = Number(receipt.root)
        ledger.sent[item.key] = { ...ledger.sent[item.key], root: item.root || 0, thread: threadKey(item), state: 'accepted', receipt }; save()
        if (receipt.rpid || receipt.rpid_str) {
          try { appendFileSync(join(home, 'seen.md'), `\n| ${item.bvid} | ${receipt.rpid_str || receipt.rpid} | ${group === 'messages' ? item.root : 0} | ${new Date().toISOString()} |\n`, 'utf8') } catch (e) { log('复核索引写入失败：' + e.message) }
        }
        return '接口已接受评论（公开可见性待核实）'
      } catch (e) {
        event(group, item, '发送结果未知，不自动重发', { ...decision, summary: '接口异常，保留发送意图防止重复' })
        throw e
      }
    })
    sendQueue = task.catch(() => {})
    return task
  }

  const step = async (group, { signal, round, poll = false }) => {
    if (memoryError) throw new Error(memoryError)
    if (budgetBlocked(ledger, settings(), group)) return { empty: true, budget: true }
    const item = await choose(group, round, signal, poll || config().independentMessages === true)
    signal.throwIfAborted()
    if (!item) return { empty: true }
    const excluded = group === 'video' && contentFilter(item, settings())
    if (excluded) { record(group, item, { summary: '命中本地排除词，未调用模型', text: '' }, '本地筛选跳过'); return {} }
    if(group==='video'){
      const reason=browseGate(item,{...settings(),...(item.author_uid?{}:{browseAuthorMode:"prefer"})})
      if(reason){record(group,item,{summary:reason+'；未读取字幕或调用模型'},'浏览口味筛选跳过');return {}}
    }
    if (group === 'messages' && settings().maxThreadReplies > 0 && Object.values(ledger.sent).filter(s => s.thread === threadKey(item) && s.state === 'accepted' && Date.now() - s.at < 864e5).length >= settings().maxThreadReplies) {
      record(group, item, { summary: '同一楼层24小时内已达到回复上限', text: '' }, '对话次数达到上限'); return {}
    }
    if (ledger.sent[item.key]) {
      record(group, item, { summary: '此条已有发送尝试，为避免重复不自动重发' }, '发送已尝试或结果待核实')
      return {}
    }
    if (!item.bvid || (group === 'messages' && (!item.rpid || !item.root))) {
      record(group, item, { summary: '通知不属于可定位的视频评论，保留记录并跳过' }, '跳过')
      return {}
    }
    try {
    const info = await cached('bili_video_info', { bvid: item.bvid })
    signal.throwIfAborted()
    if(group==='video'){
      Object.assign(item,{author_uid:item.author_uid||info.author_uid,title:info.title||item.title,description:info.description||item.description})
      const reason=browseGate(item,settings())
      if(reason){record(group,item,{summary:reason+'；未读取字幕或调用模型'},'浏览口味筛选跳过');return {}}
    }
    const light = config().lightweight !== false
    const context = { info: group === 'messages' || light ? videoBrief(info) : info }
    const reading=normalizeReading(settings())
    let rawOverview, messageQuestion=''
    const loadOverview=async(limit,query='',followup=false)=>{
      signal.throwIfAborted()
      if(!rawOverview){
        let data
        try { data=await cached('bili_video_summary',{bvid:item.bvid}) } catch { data=null }
        if(data?.text?.trim())rawOverview={kind:'B站AI总结',data}
        else {
          try { data=await cached('bili_subtitle',{bvid:item.bvid}) } catch(e) { if(group==='video')throw e; data=null }
          rawOverview={kind:data?.text?'字幕摘录':'仅标题与简介，没有可用总结或字幕',data:data||{}}
        }
      }
      signal.throwIfAborted()
      const {kind,data}=rawOverview
      const key=createHash('sha256').update(JSON.stringify([data,limit,query])).digest('hex')
      if(!excerptMemo.has(key)){
        excerptMemo.set(key,excerpt(data.text,limit,{query,cues:data.cues||[]}))
        while(excerptMemo.size>100)excerptMemo.delete(excerptMemo.keys().next().value)
      }
      context.overview={source:kind,...excerptMemo.get(key),...(!data.text?{unavailable:true}:{}),...(followup?{followup:true}:{})}
    }
    if (group === 'video') {
      await loadOverview(reading.videoReadChars)
      const comments = check(await call('bili_comments', { bvid: item.bvid, num: light ? 3 : 20 }))
      signal.throwIfAborted()
      context.comments = light ? (comments.comments || []).slice(0, 3).map(c => ({ content: String(c.content || '').slice(0, 180) })) : comments
    }
    if (group === 'messages') {
      context.thread = check(await call('bili_thread_context', { bvid: item.bvid, root: item.root, target: item.rpid }))
      signal.throwIfAborted()
      const ids = new Set()
      const collect = v => {
        if (!v || typeof v !== 'object') return
        if (v.rpid) ids.add(String(v.rpid))
        for (const child of Object.values(v)) if (typeof child === 'object') Array.isArray(child) ? child.forEach(collect) : collect(child)
      }
      collect(context.thread)
      if (!ids.has(String(item.rpid))) {
        record(group, item, { summary: '无法在楼层上下文中确认通知目标，跳过以避免回复错人' }, '跳过')
        return {}
      }
      // 通知可能只给source_id；接口返回的真实根楼层优先。
      const actualRoot = Number(context.thread.root?.rpid || 0)
      if (actualRoot > 0) item.root = actualRoot
      context.thread = threadBrief(context.thread, item.rpid, item.root)
      context.previousReplies = relevantMemories(ledger.memories, item).filter(m => m.text).map(m => m.text.slice(0, 300))
      const sender = item.notification?.user?.mid
      if (sender) {
        const related = ledger.feed.messages.filter(m => m.key !== item.key && !ledger.seen[m.key] && threadKey(m) === threadKey(item) && String(m.notification?.user?.mid) === String(sender)).slice(0, 3)
        item.coalescedKeys = related.map(m => m.key)
        context.relatedMessages = related.map(m => ({ text: String(m.notification?.item?.source_content || '').slice(0, 300), note: '同人同楼层补充，与本次合并回应，不改变回复目标' }))
      }
    }
    if(group==='messages')messageQuestion=[item.notification?.item?.source_content,...context.thread.comments.filter(c=>String(c.rpid)===String(item.rpid)).map(c=>c.text),...(context.relatedMessages||[]).map(c=>c.text)].filter(Boolean).join('\n')
    if (group === 'messages' && config().messageVideoContext !== false && reading.allowVideoFollowup && asksAboutVideo(messageQuestion)) {
      await loadOverview(reading.videoFollowupChars,messageQuestion,true)
    }
    const decideOnce = async () => {
      const raw = await (decide || think)(group,item,context,signal)
      if (decide) { addUsage(ledger,group,raw.usage,(JSON.stringify(context).length+JSON.stringify(raw).length)/2);save() }
      return decisionOf(raw)
    }
    if(group==='video')item.browseSignature=browseSignature(settings())
    let decision = await decideOnce()
    if(group==='video'&&decision.action==='reply'){
      const reason=!['match','uncertain','mismatch'].includes(decision.interest)?'模型未明确判断浏览相关性，已跳过':item.browseSignature!==browseSignature(settings())?'浏览口味已变更，旧判断已跳过':browseGate({...item,...decision},settings(),{semantic:true})
      if(reason)decision={...decision,action:'skip',text:'',summary:reason+'；'+decision.summary}
    }
    const canReadMore=canSupplement(group,settings(),context.overview)
    if (decision.action === 'read_video' && canReadMore && !budgetBlocked(ledger,settings(),group)) {
      await loadOverview(reading.videoFollowupChars,group==='messages'?messageQuestion:'',true);decision=await decideOnce()
    }
    if (decision.action === 'read_video') decision = { action:'skip',text:'',summary:context.overview?'已读取可用资料，仍不足以回应视频问题':'无法继续补读视频资料，本次跳过' }
    signal.throwIfAborted()
    item.title ||= context.info?.title
    const outcome = decision.action === 'reply'
      ? await publish(group, item, decision, signal)
      : '已跳过（不适合回应）'
    record(group, item, decision, outcome)
    return {}
    } catch (e) {
      const message = String(e?.message || e)
      const terminal = /(?:错误代码[：:]\s*|["']?code["']?\s*:\s*)(12061|12002|12006|12003|12035|-404)(?!\d)/.exec(message)
      if (!terminal) throw e
      record(group, item, { action: 'skip', summary: 'B站条目不可继续处理 ' + terminal[1] + '：' + message.slice(0, 180), text: '' }, '评论区关闭、目标已失效或禁止评论，已跳过')
      return {}
    }
  }
  return {
    step: async (...args) => {
      try { const result = await step(...args); ledger.health.platform = { ok: true, at: Date.now(), message: '读取成功' }; save(); return result }
      catch (e) { ledger.health.platform = { ok: false, at: Date.now(), message: String(e.message).slice(0, 240) }; save(); throw e }
    },
    sendManual: async args => {
      const group = args.rpid ? 'messages' : 'video', signal = new AbortController().signal
      const item = { bvid: String(args.bvid || ''), rpid: args.rpid || 0, root: args.root || args.rpid || 0 }
      item.key = group === 'video' ? 'video:' + item.bvid : `message:${item.bvid}:${item.rpid}`
      if (!/^BV[0-9A-Za-z]{10}$/.test(item.bvid)) throw Error('无效视频号')
      const decision = decisionOf({ action: 'reply', scope: args.scope, boundary: args.boundary, summary: '对话工具发言判断', text: args.text, memeIds: args.memeIds })
      if (decision.action !== 'reply') return { ok: false, error: '范围与安全检查未通过' }
      const outcome = await publish(group, item, decision, signal)
      record(group, item, decision, outcome)
      return { ok: true, outcome }
    },
    status: () => {
      const verification = read(join(home, 'verify-state.json'), {})
      const events = ledger.events.length ? ledger.events : ledger.memories.map(m => ({ ...m, at: Date.parse(m.at), bvid: m.bvid || m.key?.match(/BV[0-9A-Za-z]{10}/)?.[0] }))
      return { usage: todayUsage(ledger), budget: { video: budgetBlocked(ledger, settings(), 'video'), messages: budgetBlocked(ledger, settings(), 'messages') },
        health: ledger.health, activity: events.slice(-30).reverse().map(e => {
          const sent = ledger.sent[e.key], id = sent?.receipt?.rpid_str || sent?.receipt?.rpid
          return { ...e, text: e.text || sent?.text || '', sendState: sent?.state,
            verification: id ? verification[String(id)] : null,
            url: e.bvid ? `https://www.bilibili.com/video/${e.bvid}/` + (id || e.rpid ? `?comment_on=1&comment_root_id=${sent?.root || e.root || id || e.rpid}&comment_secondary_id=${id || e.rpid}` : '') : '' }
        }) }
    },
    maintain: () => maintainFiles(home, settings()),
  }
}
