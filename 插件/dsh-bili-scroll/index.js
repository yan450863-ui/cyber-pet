/** B站助手：双任务组循环、对话区设置、登录与依赖管理。 */
import { loadHostDeps } from './lib/hostdeps.mjs'
import { createApiConnection } from './lib/api-connection.mjs'

// ⭐ 这两样从**宿主那棵树**里取（拿不到就退到自己的依赖；再拿不到，defineTool 用本地等价实现）。
//    起因（2026-10-16 用户递来的完整报告 + 本机复现）：它们是 optional peer，
//    桌面版 profile 是 `autoInstallPeers: false` ⇒ 永远不装 ⇒ **裸 import 会让整条插件不激活** ✗。
const hostDeps = await loadHostDeps()
const z = hostDeps.z
const defineTool = hostDeps.defineTool
import { spawn } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Cycle, CYCLE_DEFAULTS, normalizeCycle } from './lib/cycle.mjs'
import { createCycleWorker } from './lib/cycle-worker.mjs'
import { ACTIVITY_DEFAULTS } from './lib/activity.mjs'
import { BROWSE_DEFAULTS, BROWSE_PRESETS, VIDEO_TYPES, normalizeBrowse, feedbackEntries } from './lib/browse-preferences.mjs'
import { MEME_DEFAULTS, normalizeMemes, listMemes, importMeme } from './lib/memes.mjs'
import { PetStore } from './lib/pets.mjs'
import { createPetChat } from './lib/pet-chat.mjs'
import { PET_DEFAULTS, normalizePet } from './lib/pet-profile.mjs'
import { McpClient } from './lib/mcp.mjs'
import { verifyRecent, appendVerifyToReport } from './lib/verify.mjs'
import { stateDirOf, readJson, writeJson, ensureHomeFiles, dayKey } from './lib/state.mjs'
import { loginStart as rawLoginStart, loginPoll as rawLoginPoll, saveCredential, renderQrPng } from './lib/login.mjs'
import { ensureUv } from './lib/uvfetch.mjs'

export const name = 'bili-scroll'
export const inject = ['webServer', 'tools', 'settings']


// ⚠️ schemastery 彻底拿不到时，这里会是 undefined —— **插件照常加载**，只是设置页降级
//    （宁可少一个设置页，也不能因为一个 import 让整条插件不激活 ✗）
export const Config = !z ? undefined : z.object({
  ...Object.fromEntries(Object.entries(BROWSE_DEFAULTS).map(([key,value])=>[key,(Array.isArray(value)?z.array(z.string()):typeof value==='number'?z.number():z.string()).default(value).extra('volatile',true)])),
  ...Object.fromEntries(Object.entries(MEME_DEFAULTS).map(([key, value]) => [key,
    (typeof value === 'boolean' ? z.boolean() : typeof value === 'number' ? z.number() : z.string()).default(value).extra('volatile', true)])),
  ...Object.fromEntries(Object.entries(PET_DEFAULTS).map(([key, value]) => [key,
    (typeof value === 'boolean' ? z.boolean() : typeof value === 'number' ? z.number() : z.string()).default(value).extra('volatile', true)])),
  ...Object.fromEntries(Object.entries(CYCLE_DEFAULTS).map(([key, value]) => [key,
    (typeof value === 'boolean' ? z.boolean() : typeof value === 'number' ? z.number() : z.string()).default(value).extra('volatile', true)])),
  ...Object.fromEntries(Object.entries(ACTIVITY_DEFAULTS).map(([key, value]) => [key,
    (Array.isArray(value) ? z.array(z.string()) : typeof value === 'boolean' ? z.boolean() : z.number()).default(value).extra('volatile', true)])),




  autoComment: z.boolean().default(false).extra('volatile', true),




  asrModel: z.string().default('small').extra('volatile', true),



  keywords: z.array(z.string()).default([]).extra('volatile', true),

  pythonPath: z.string().default('python').extra('volatile', true),

  dshBin: z.string().default('').extra('volatile', true),

  headlessProfile: z.string().default('headless').extra('volatile', true),


  workspace: z.string().default('').extra('volatile', true),

  reportLevel: z.string().default('full').extra('volatile', true),

  replyToComments: z.boolean().default(false).extra('volatile', true),
  messagesNewOnly: z.boolean().default(true).extra('volatile', true),
  lightweight: z.boolean().default(true).extra('volatile', true),

})


const pyEnv = (extra = {}) => ({
  ...process.env,
  PYTHONUTF8: '1',
  PYTHONIOENCODING: 'utf-8',
  ...extra,
})

export function apply(ctx, config) {
  const pluginDir = dirname(fileURLToPath(import.meta.url))
  // ⭐ 自己的版本号（从 package.json 读，设置页要显示它）
  let myVer = ''
  const myVersion = () => {
    if (myVer) return myVer
    try { myVer = String(JSON.parse(readFileSync(join(pluginDir, 'package.json'), 'utf8')).version || '') } catch { myVer = '' }
    return myVer
  }
  const stateDir = stateDirOf(ctx)

  // ⭐ "就绪"必须检查依赖真的装上了，不能只看目录存不存在
  //    （2026-10-15：只看目录，害一位真实用户"显示就绪但其实装失败"白折腾 ✗）
  const sitePkgs = (venvRoot) => {
    const win = join(venvRoot, 'Lib', 'site-packages')
    if (existsSync(win)) return win
    try {
      const lib = join(venvRoot, 'lib')
      for (const d of readdirSync(lib)) {
        if (!d.startsWith('python')) continue
        const p = join(lib, d, 'site-packages')
        if (existsSync(p)) return p
      }
    } catch {  }
    return win
  }
  const hasPkg = (venvRoot, prefix) => {
    try { return readdirSync(sitePkgs(venvRoot)).some((n) => n.startsWith(prefix)) } catch { return false }
  }
  const venvReadyNow = () => existsSync(venvPython()) && hasPkg(join(stateDir, '.venv'), 'bilibili_api')
  const asrReadyNow = () => existsSync(asrPython()) && hasPkg(asrDir, 'faster_whisper')
  const cfgFile = join(stateDir, 'config.json')
  const logFile = join(stateDir, 'duty.log')
  const outDir = join(stateDir, 'out')
  mkdirSync(outDir, { recursive: true })

  const log = (msg) => {
    const line = `${new Date().toISOString()}  ${msg}`
    try { appendFileSync(logFile, line + '\n', 'utf8') } catch {  }
    try { ctx.logger?.info?.(`[bili-duty] ${msg}`) } catch {  }
  }

  // 宿主依赖是从哪儿取的（桌面版那次事故的排查看这里：duty.log 里会写明白）
  for (const n of hostDeps.notes) log(n)


  const DEFAULTS = {
    ...CYCLE_DEFAULTS, ...ACTIVITY_DEFAULTS, ...BROWSE_DEFAULTS, ...PET_DEFAULTS, ...MEME_DEFAULTS, autoComment: false, replyToComments: false, messagesNewOnly: true, lightweight: true,
    asrModel: 'small', keywords: [], pythonPath: 'python',
    dshBin: '', headlessProfile: 'headless', workspace: '', reportLevel: 'full',
  }

  const normalize = (src, base) => {
    const out = { ...base }
    for (const k of Object.keys(base)) {
      const v = src?.[k]
      if (v === undefined || v === null) continue
      if (Array.isArray(base[k])) { if (Array.isArray(v)) out[k] = v.filter((x) => typeof x === 'string') }
      else if (typeof base[k] === 'number') { const n = Number(v); if (Number.isFinite(n)) out[k] = n }
      else if (typeof base[k] === 'boolean') { if (typeof v === 'boolean') out[k] = v }
      else if (typeof base[k] === 'string') { if (typeof v === 'string') out[k] = v }
    }
    return out
  }


  const clampPatch = patch => {
    const p = { ...patch }
    if(BROWSE_PRESETS[p.browsePreset]){
      if(!('keywords' in p))p.keywords=BROWSE_PRESETS[p.browsePreset].keywords
      if(!('browseTypes' in p))p.browseTypes=BROWSE_PRESETS[p.browsePreset].types
    }
    const browse=normalizeBrowse(p)
    for(const key of Object.keys(BROWSE_DEFAULTS))if(key in p)p[key]=browse[key]
    const memes = normalizeMemes(p)
    for (const key of Object.keys(MEME_DEFAULTS)) if (key in p) p[key] = memes[key]
    const pet = normalizePet(p)
    for (const key of Object.keys(PET_DEFAULTS)) if (key in p) p[key] = pet[key]
    if ('reportLevel' in p) p.reportLevel = ['full', 'brief', 'off'].includes(p.reportLevel) ? p.reportLevel : 'full'
    for (const [key, value] of Object.entries(ACTIVITY_DEFAULTS)) if (key in p) {
      if (typeof value === 'number') p[key] = Math.max(key === 'retentionDays' ? 1 : 0, Math.min(key.endsWith('Weight') ? 10 : 100000000, Math.floor(Number(p[key]) || 0)))
      else if (Array.isArray(value)) p[key] = Array.isArray(p[key]) ? p[key].filter(v => typeof v === 'string' && v.trim()).map(v => v.trim()).slice(0, 100) : []
      else p[key] = typeof p[key] === 'boolean' ? p[key] : value
    }
    const cycle = normalizeCycle(p)
    for (const key of Object.keys(p)) if (key in cycle) p[key] = cycle[key]
    return p
  }

  const hostCfg = () => normalize(config, { ...DEFAULTS })       // 宿主那份（schema 校验过、默认值已填）
  const savedCfg = () => normalize(readJson(cfgFile, {}), { ...DEFAULTS })
  const CFG_SIG = ['videoCount', 'restMinutes', 'replyToComments']
  let settingsRow = { at: 0, row: null }

  const settingsDesc = (fresh = false) => {
    const t = Date.now()
    if (!fresh && t - settingsRow.at < 3000) return settingsRow.row   // 挡 UI 轮询：describe() 要扫所有条目
    let row = null
    try {
      const rows = ctx.settings?.describe?.() || []
      row = rows.find((r) => r?.value && CFG_SIG.every((k) => k in r.value)) || null
    } catch (e) { log(`读 DSH 设置表单失败（不影响跑）：${e?.message ?? e}`) }
    settingsRow = { at: t, row }
    return row
  }
  const loadCfg = () => {
    const saved = savedCfg()
    const row = settingsDesc()
    // ⭐ 读回来统一过一遍范围：原生设置页那边我们是钳不到写的（见 clampPatch 的注释）
    if (!row) return clampPatch(saved)
    const user = row.user || {}
    const out = normalize(row.value, hostCfg())
    for (const k of Object.keys(DEFAULTS)) if (user[k] === undefined) out[k] = saved[k]
    return clampPatch(out)
  }
  const cfg = loadCfg()
  const pets = new PetStore(stateDir, cfg, { fresh: !existsSync(cfgFile) && !settingsDesc()?.user?.petName, defaults: DEFAULTS })
  if (pets.activeId === 'builtin-companion' && !existsSync(cfgFile)) Object.assign(cfg, normalize(pets.active().config, cfg))
  const apiConnection = createApiConnection(dirname(stateDir))
  let presetSyncPatch = pets.presetPatch || null
  if (presetSyncPatch) Object.assign(cfg, presetSyncPatch)
  pets.update(cfg)
  // ⭐ 配置是"随时可能被设置页就地改掉"的东西 ⇒ 每个入口用之前重算一遍（cfg 这个对象要一直指向同一份）
  const refreshCfg = () => { Object.assign(cfg, loadCfg(), presetSyncPatch || {}) }
  const saveCfg = (patch) => { Object.assign(cfg, normalize(patch, cfg)); writeJson(cfgFile, cfg); pets.update(cfg) }

  const saveCfgHost = async (patch) => {
    const attempt = async (fresh) => {
      const row = settingsDesc(fresh)
      if (!row?.ns || typeof ctx.settings?.update !== 'function') {
        throw Object.assign(new Error('DSH 这边没有可写的设置表单（值只落在插件自己的 config.json 里）'), { noForm: true })
      }
      await ctx.settings.update(row.ns, patch, row.revision)
      settingsRow = { at: 0, row: null }
      return row.ns
    }
    try { return { ok: true, ns: await attempt(false) } }
    catch (e) {
      if (!e?.noForm) {   // revision 过期（刚有别人改过）⇒ 重取一次再写
        try { return { ok: true, ns: await attempt(true), retried: true } } catch (e2) { e = e2 }
      }
      log(`写 DSH 设置失败：${e?.message ?? e}`)
      return { ok: false, error: String(e?.message ?? e) }
    }
  }

  const persistCfg = async (patch) => {
    const clean = clampPatch(Object.fromEntries(Object.entries(patch).filter(([k]) => k in DEFAULTS)))
    saveCfg(clean)
    const host = await saveCfgHost(clean)
    return { clean, host }
  }
  if (presetSyncPatch) ctx.effect(async () => { const result = await persistCfg(presetSyncPatch); if (result.host.ok) presetSyncPatch = null }, '同步内置宠物档案更新')

  ensureHomeFiles(pluginDir, stateDir, log)

    // 可变人设来自配置；prompts/duty.md 只保留固定安全与运行约定。




  let mcp = null
  let mcpKey = ''
  const mcpKeyNow = () => `${cfg.pythonPath}|${join(stateDir, 'mcp_server.py')}`

  const ensureMcp = async () => {
    if (mcp?.running && mcpKey === mcpKeyNow()) return mcp
    if (mcp) { mcp.stop(); mcp = null }
    const script = join(stateDir, 'mcp_server.py')
    if (!existsSync(script)) throw new Error(`家里没有 mcp_server.py（应有 ${script}）—— 装上插件后重启一次 dsh 会自动铺好`)
    mcpKey = mcpKeyNow()
    mcp = new McpClient({
      command: cfg.pythonPath || 'python',
      args: [script],
      cwd: stateDir,                     // 凭证落在家里 ✓
      // ⭐ 这个内置的 Python MCP 会往 stdout 打中文（ensure_ascii=False）；
      //    Windows 默认 GBK 的话，中文/emoji 一进管道就可能炸 ⇒ 钉死 UTF-8
      env: pyEnv(),
      log,
    })
    return mcp
  }

  const call = async (toolName, args, opts) => {
    const client = await ensureMcp()
    return client.call(toolName, args, opts)
  }

  const hasCredential = () => existsSync(join(stateDir, 'bili_credential.json'))
  let loginGeneration = 0
  const loginKeys = new Map()
  const loginStart = async () => {
    const generation = loginGeneration, r = await rawLoginStart()
    if (generation !== loginGeneration) throw Error('登录操作已取消')
    loginKeys.clear(); loginKeys.set(r.key, generation); return r
  }
  const loginPoll = async key => {
    const generation = loginGeneration
    if (loginKeys.get(key) !== generation) return { state: 'expired', message: '登录操作已取消，请重新获取二维码' }
    const r = await rawLoginPoll(key)
    if (generation !== loginGeneration || loginKeys.get(key) !== generation) return { state:'expired' }
    return r
  }



  const textOutput = {
    schema: { type: 'object', properties: {}, additionalProperties: true },
    render: (_args, value) => [{
      type: 'text',
      text: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
    }],
  }


  const safe = (v) => {
    if (v === undefined || v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v
    try { return JSON.parse(JSON.stringify(v)) } catch { return String(v) }
  }

  const tool = (spec) => ctx.tools.register(defineTool({
    ...spec,
    output: textOutput,
    async execute(args, exec) { return safe(await spec.execute(args, exec)) },
  }))

  tool({
    name: 'bili_whoami',
    description: '看 B站 那边登录的是谁（凭证是否有效、昵称、mid）。第一次用要先在「刷B站」设置页里扫码登录。',
    parameters: {},
    async execute() {
      if (!hasCredential()) {
        return { ok: false, loggedIn: false, hint: '还没登录：去 dsh 设置页的「刷B站」里点「扫码登录」（凭证会存在插件自己的家目录里）' }
      }
      const r = await call('bili_check_credential', {})
      return { ok: true, ...(typeof r === 'object' ? r : { raw: r }) }
    },
  })

  tool({
    name: 'bili_search',
    description: '搜索B站视频。仅围绕AI、大模型、二次元和动画。使用简介、总结或字幕摘录理解具体内容，不要求完整字幕，不凭标题编造观看经历。自动浏览请启动刷B站循环。',
    parameters: {
      keyword: { type: 'string', description: '搜索关键词' },
      num: { type: 'number', description: '返回几条（默认 10，最大 50）' },
      order: { type: 'string', description: 'totalrank=综合（默认）/ click=播放 / pubdate=最新 / dm=弹幕' },
    },
    async execute(args) {
      return call('bili_search', {
        keyword: String(args.keyword ?? ''),
        num: Math.max(1, Math.min(Number(args.num) || 10, 50)),
        order: String(args.order || 'totalrank'),
      })
    },
  })

  tool({
    name: 'bili_subtitle',
    description: '按需读取视频字幕；自动循环默认优先总结和限长摘录。无字幕时仍可据可靠简介讨论明确内容，不能假装观看或自行下载转写。',
    parameters: { bvid: { type: 'string', description: 'BV号' } },
    async execute(args) { return call('bili_subtitle', { bvid: String(args.bvid ?? '') }) },
  })

  tool({
    name: 'bili_comments',
    description: '按需读取少量视频评论，热门评论只是其他人的观点，不能当作视频事实。默认最多3条。',
    parameters: {
      bvid: { type: 'string', description: 'BV号' },
      num: { type: 'number', description: '取几条（默认3，最多20）' },
    },
    async execute(args) {
      return call('bili_comments', { bvid: String(args.bvid ?? ''), num: Math.max(1, Math.min(20, Number(args.num) || 3)) })
    },
  })

  tool({
    name: 'bili_reply',
    description: '按本地宠物档案的人设和工作范围发送可直接发布的正文，无需再次确认。必须明确通过scope和boundary，遵守配置的评论/回复字数上限。与自动循环共用冷却、去重及开关。后台任务不使用此工具。',
    parameters: {
      bvid: { type: 'string', description: 'BV号' },
      text: { type: 'string', description: '评论正文（短、干净、纯文本 @；别写敏感词）' },
      memeIds: { type: 'array', items: { type: 'string' }, description: '可选的已登记表情ID，留空表示不附加' },
      rpid: { type: 'number', description: '要回复的评论 id（0/不填 = 发新评论）' },
      root: { type: 'number', description: '根楼层id，回复时填写' },
      scope: { type: 'string', description: '仅明确属于工作范围时填写in_scope' },
      boundary: { type: 'string', description: '符合人设、安全与权限边界时填写ok' },
    },
    async execute(args) {
      refreshCfg()
      return worker.sendManual(args)
    },
  })

  tool({
    name: 'bili_status',
    description: '查看双任务组循环的运行、进度、休息和登录状态。',
    parameters: {},
    async execute() { return status() },
  })

  tool({
    name: 'bili_run',
    description: '按双任务组设置运行一轮，然后停止。',
    parameters: {},
    async execute() { return runDuty() },
  })

  tool({ name: 'bili_cycle_start', description: '按当前设置启动双任务组时间循环。', parameters: {}, async execute() { return cycle.start() } })
  tool({ name: 'bili_cycle_stop', description: '停止循环及当前模型操作，保留已完成进度。', parameters: {}, async execute() { return cycle.stop() } })

  tool({
    name: 'bili_login_start',
    description: '开始 B站 扫码登录：出二维码（画成 PNG 存在插件家目录里，返回路径）和一个 key。\n'
      + '用法：拿到 PNG 后用 `present` 把它推给本人（手机 B站 → 我的 → 扫一扫），再用 `bili_login_poll` 轮询。\n'
      + '⚠️ 二维码大约 180 秒有效，出码要马上递过去；手机上确认时选「记住我」那种长期登录。',
    parameters: {},
    async execute() {
      const { key, url } = await loginStart()
      const png = await renderQrPng(cfg.pythonPath, stateDir, url)
      return {
        ok: true, key, url, png,
        hint: png ? '用 present 把这张 PNG 推给本人扫；扫完调 bili_login_poll' : '没画出 PNG：先去设置里点「建 venv 装依赖」（venv 里要有 qrcode）',
      }
    },
  })

  tool({
    name: 'bili_login_poll',
    description: '查扫码结果：waiting 还没扫 / scanned 扫了待确认 / ok 成功 / expired 过期。'
      + '成功时会自动把凭证写进插件家目录的 `bili_credential.json`（MCP 认的那四个字段）。',
    parameters: { key: { type: 'string', description: 'bili_login_start 给的那个 key' } },
    async execute(args) {
      const r = await loginPoll(String(args.key ?? ''))
      if (r.state === 'ok') {
        const file = saveCredential(stateDir, r.credential)
        log(`登录成功，凭证已写入 ${file}`)
        return { ok: true, state: 'ok', file }
      }
      return { ok: r.state !== 'unknown', state: r.state, code: r.code, message: r.message }
    },
  })

  tool({
    name: 'bili_setup',
    description: '给刷B站装运行环境：在插件家目录建一个**独立 venv**、装上那个 Python MCP 的依赖，装完自动把 `pythonPath` 指过去。\n'
      + '**第一次用之前跑一次**。⭐ 它**起完就返回、不等装完**（几分钟的活），进度看家目录里的 `install.log`。',
    parameters: {},
    async execute() { return runInstall() },
  })

  tool({
    name: 'bili_config',
    description: '读写双任务组循环设置。例如 videoCount、messagesCount（0=无限）、videoIntervalSec、messagesIntervalSec、restMinutes、maxRounds（0=无限）、timeLimited、timeStart、timeEnd、autoComment、replyToComments、keywords；宠物档案 petName、ownerTitle、petPersonality、petSpeechStyle、petExamples、petWorkScope、maxCommentChars、maxReplyChars。',
    parameters: { patch: { type: 'object', additionalProperties: true, description: '要改的字段（可省）' } },
    async execute(args) {
      let host = null
      if (args?.patch && typeof args.patch === 'object' && !Array.isArray(args.patch)) {
        // ⭐ 设置页显式设过的键以宿主为准 ⇒ 必须跟着写一份，否则"改了没反应"（钳范围也在这里）
        host = (await persistCfg(args.patch)).host
      }
      return { ok: true, config: cfg, home: stateDir, venvReady: venvReadyNow(), host }
    },
  })



  // ⭐ 一键升级：由宿主自己跑 `dsh plugin --profile web add dsh-bili-scroll`
  //    ⚠️ 装完必须重启 dsh 才生效；⚠️ Windows 上"替换正在运行的插件"可能被文件占用挡住（我们踩过）
  let upgrading = false
  const runUpgrade = () => {
    if (upgrading) return { ok: true, busy: true, log: installLogFile, hint: '正在升级，别重复点' }
    upgrading = true
    appendInstall('\n=== ' + new Date().toISOString() + ' 开始升级（add dsh-bili-scroll）===\n')
    ;(async () => {
      try {
        const dsh = resolveDsh()
        // ⭐ 照抄那一轮的形状：resolveDsh 返回 { command, args, shell }
        //    （写错就退化成裸 'dsh'，而宿主 PATH 里常常没有它 ⇒ 静默失败）
        let cmd = dsh.command || 'dsh'
        let args = [...(dsh.args || []), 'plugin', '--profile', 'web', 'add', 'dsh-bili-scroll']
        if (dsh.shell) { args = ['/c', cmd, ...args]; cmd = 'cmd.exe' }
        appendInstall('$ ' + cmd + ' ' + args.join(' ') + '\n')
        const code = await spawnTo(cmd, args, { sink: appendInstall })
        if (code === 0) appendInstall('=== 升级完成 —— 重启一次 dsh 才生效 ===\n')
        else appendInstall('=== 升级没成功（exit ' + code + '）。可以自己手动跑一次：dsh plugin --profile web add dsh-bili-scroll ===\n')
      } catch (e) { appendInstall('升级崩了：' + (e?.stack ?? e) + '\n') } finally { upgrading = false }
    })()
    return { ok: true, started: true, log: installLogFile, hint: '正在升级 —— 完成后重启一次 dsh 才生效' }
  }

  const resolveDsh = () => {
    // 桌面专用入口会设置本项目 DSH_HOME，通用 bin.js 不会。
    const installRoot = join(pluginDir, '..', '..')
    const desktopCli = join(installRoot, 'resources', 'app', 'lib', 'desktop-cli.js')
    const bundledNode = join(installRoot, 'resources', 'runtime', 'x64', 'primary-runtime', 'dependencies', 'node', 'bin', 'node.exe')
    if (!cfg.dshBin && existsSync(desktopCli) && existsSync(bundledNode)) {
      return { command: bundledNode, args: [desktopCli], shell: false }
    }
    const explicit = String(cfg.dshBin || '').trim()
    if (explicit && existsSync(explicit)) return { command: process.execPath, args: [explicit], shell: false }
    // 常见的全局安装位置（Windows 的 npm 前缀 / POSIX 的 lib）
    const guesses = [
      join(process.env.APPDATA || '', 'npm', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
      '/usr/local/lib/node_modules/@deepseek-ai/dsh/lib/bin.js',
      '/usr/lib/node_modules/@deepseek-ai/dsh/lib/bin.js',
    ].filter(Boolean)
    // ⭐ 2026-10-16（issue #5 / #6 / #7）：**桌面版是 Electron 安装包，不是 npm -g 装的** ⇒ 上面几条全找不到
    //    ⇒ 老逻辑退到 `dsh`（PATH 里没有这个命令）⇒ 那一轮必败、而且只留下一句 exit 1 ✗
    //    桌面版把 dsh 打在应用里 ⇒ 按 `process.resourcesPath` 猜几个位置（找到就用；找不到就**明说**）
    if (process.resourcesPath) {
      for (const rel of [
        ['app.asar.unpacked', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'],
        ['app', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'],
        ['node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'],
      ]) {
        const p = join(process.resourcesPath, ...rel)
        if (existsSync(p)) return { command: process.execPath, args: [p], shell: false }
      }
    }
    for (const g of guesses) if (existsSync(g)) return { command: process.execPath, args: [g], shell: false }
    // ⚠️ 走到这儿就是真找不到 —— 一定要出声（静默失败比报错更坏）
    log('⚠️ 找不到 dsh：桌面版多半不是 npm 全局安装的 ⇒ 请在设置里把「dsh 路径」指到 <应用目录>/…/@deepseek-ai/dsh/lib/bin.js，或改用 npm 装的 dsh')
    return { command: 'dsh', args: [], shell: true }
  }

  let verifying = false
  const runVerify = async (why = 'manual') => {
    if (verifying) return { ok: false, error: '上一次复核还没跑完，等它完事' }
    verifying = true
    try {
      log(`评论复核开始（${why}）`)
      const r = await verifyRecent(stateDir, { log, automatic: why === 'automatic' })
      const f = appendVerifyToReport(stateDir, r.text)
      log(`评论复核结束（${why}）：查了 ${r.checked.length} 条${f ? `，已写进 ${f}` : ''}`)
      return { ok: true, why, checked: r.checked, skipped: r.skipped, text: r.text, report: f || '' }
    } catch (e) {
      log(`评论复核失败（${why}）：${e?.message ?? e}`)
      return { ok: false, why, error: String(e?.message ?? e) }
    } finally { verifying = false }
  }


  const cycleFile = join(stateDir, 'cycle-state.json')
  const currentCfg = () => { refreshCfg(); return { ...cfg, ...normalizeCycle(cfg), petId: pets.activeId } }
  const worker = createCycleWorker({ home: stateDir, config: currentCfg, call, resolveDsh, log, env: pyEnv, charter: join(pluginDir, 'prompts', 'duty.md') })
  const cycle = new Cycle({
    config: currentCfg,
    state: readJson(cycleFile, {}),
    step: async (group, options) => {
      if (!hasCredential()) throw new Error('请先扫码登录 B站')
      return worker.step(group, options)
    },
    save: state => writeJson(cycleFile, state),
    onError: e => log('循环操作失败，退避后重试：' + e.message),
  })
  const chatAllowed = Object.keys(DEFAULTS).filter(k => !['pythonPath', 'dshBin', 'headlessProfile', 'workspace', 'reportLevel'].includes(k))
  const petChat = createPetChat({ home: stateDir, pets, config: currentCfg, resolveDsh, env: pyEnv, changeSettings: persistCfg, allowedKeys: chatAllowed })
  ctx.effect(() => () => petChat.dispose(), 'pet-chat: 退出清理')
  const selectPet = async id => {
    if (petChat.status()?.state === 'running') throw Error('请等宠物回复结束后再切换')
    const previousState = structuredClone(cycle.state)
    cycle.stop()
    for (let i = 0; cycle.busy && i < 100; i++) await new Promise(r => setTimeout(r, 50))
    if (cycle.busy) throw Error('正在结束上一项操作，请稍后重试')
    pets.active().cycleState = previousState
    pets.update(currentCfg()); const next = pets.get(id)
    const previous = pets.activeId
    pets.select(id)
    try { await persistCfg(normalize(next.config, DEFAULTS)) } catch (e) { pets.select(previous); throw e }
    Object.assign(cycle.state, { round:1,completed:0,counts:{video:0,messages:0},done:{},next:{},...next.cycleState,running:false,phase:'paused',error:'',restUntil:0 })
    cycle.commit()
    // 切换仅改变角色和设置，账号级去重继续共用；新宠物不会自动启动。
    return id
  }
  const runDuty = () => cycle.start({ once: true })
  let lastMaintenance = 0, lastVerify = Date.now(), verifyingTimer = false
  let lastLoginCheck = 0, checkingLogin = false, loginHealth = null
  const checkLogin = async () => {
    try {
      const result = await call('bili_check_credential', {})
      loginHealth = { ok: result?.logged_in === true, at: Date.now(), message: result?.logged_in ? '登录有效' : '登录已失效，请重新扫码' }
    } catch { loginHealth = { ok: false, at: Date.now(), message: '登录检查失败，请检查网络或B站连接' } }
    return loginHealth
  }
  const timer = setInterval(() => {
    cycle.tick().catch(e => log('循环计时错误：' + e.message))
    const now = Date.now()
    if (now - lastMaintenance > 3600000 && !cycle.busy) { lastMaintenance = now; worker.maintain() }
    if (cycle.state.running && hasCredential() && !checkingLogin && now - lastLoginCheck > 300000) {
      lastLoginCheck = now; checkingLogin = true
      checkLogin().finally(() => { checkingLogin = false })
    }
    if (cycle.state.running && currentCfg().autoVerify && !cycle.busy && !verifyingTimer && now - lastVerify > 60000) {
      lastVerify = now; verifyingTimer = true
      runVerify('automatic').finally(() => { verifyingTimer = false })
    }
  }, 1000)
  timer.unref?.()
  ctx.effect(() => () => { clearInterval(timer); cycle.stop() }, 'bili-duty: 双任务循环')



  const sendJson = (res, code, obj) => {
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(obj))
  }
  const readBody = (req, limit = 1_000_000) => new Promise((resolve) => {
    let data = ''
    let done = false
    // ⚠️ 超过 1MB 得**先把 Promise 收掉**再掐断：只 destroy 的话它永远不 settle，
    //    这个请求就挂在那儿（不回响应、也不释放）
    const finish = (v) => { if (!done) { done = true; resolve(v) } }
    req.on('data', (c) => { data += c; if (data.length > limit) { data = ''; finish({}); req.destroy() } })
    req.on('end', () => { try { finish(JSON.parse(data || '{}')) } catch { finish({}) } })
    req.on('error', () => finish({}))
  })

  const venvPython = () => process.platform === 'win32'
    ? join(stateDir, '.venv', 'Scripts', 'python.exe')
    : join(stateDir, '.venv', 'bin', 'python')


  let installing = false
  const installLogFile = join(stateDir, 'install.log')
  const appendInstall = (s) => { try { appendFileSync(installLogFile, s, 'utf8') } catch {  } }

  let uvOk = null
  const haveUv = async () => {
    if (uvOk) return true
    const ok = await new Promise((resolve) => {
      try {
        const c = spawn('uv', ['--version'], { windowsHide: true, stdio: 'ignore' })
        c.on('exit', (code) => resolve(code === 0))
        c.on('error', () => resolve(false))
      } catch { resolve(false) }
    })
    // ⭐ 只缓存"有"：把"没有"也缓存住的话，这一轮里刚下好的 uv（或用户刚装上的）会被一直当成没有，
    //    非重启 dsh 不可 ✗（调用点只有装依赖那两处，多探一次几毫秒）
    if (ok) uvOk = true
    return ok
  }


  const probeCmd = (cmd) => new Promise((resolve) => {
    try {
      const c = spawn(cmd, ['--version'], { windowsHide: true, stdio: 'ignore' })
      c.on('exit', (code) => resolve(code === 0))
      c.on('error', () => resolve(false))
    } catch { resolve(false) }
  })

  const spawnLogged = (cmd, args) => new Promise((resolve) => {
    appendInstall(`\n$ ${cmd} ${args.join(' ')}\n`)
    let c
    try { c = spawn(cmd, args, { cwd: stateDir, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: pyEnv() }) }
    catch (e) { appendInstall(`起不来：${e?.message ?? e}\n`); return resolve(1) }
    const w = (b) => appendInstall(String(b))
    c.stdout?.on('data', w)
    c.stderr?.on('data', w)
    c.on('exit', (code) => { appendInstall(`\n--- exit ${code} ---\n`); resolve(code) })
    c.on('error', (e) => { appendInstall(`起不来：${e?.message ?? e}\n`); resolve(1) })
  })

  // ───────── 本地转写（ASR）：**独立环境**，别把主 venv 撑成 1GB ─────────
  const asrDir = join(stateDir, '.venv-asr')
  const asrLogFile = join(stateDir, 'asr-install.log')
  const asrPython = () => join(asrDir, process.platform === 'win32' ? 'Scripts' : 'bin',
    process.platform === 'win32' ? 'python.exe' : 'python')
  const appendAsr = (s) => { try { appendFileSync(asrLogFile, String(s)) } catch {  } }
  // ⭐ 转写的临时目录必须由**宿主**预先建好：值班那一轮跑在沙箱里，
  //    而沙箱只允许写"该子进程启动前就已存在"的目录（2026-10-14 那一轮自己挖出来的规则）
  const asrTmp = join(stateDir, 'tmp', 'asr')
  try { mkdirSync(asrTmp, { recursive: true }) } catch {  }

  // ⭐ 判重表也由**宿主**预先建好（两个原因）：
  //   ① 那一轮被沙箱关着，"新建文件"会被拒（2026-10-14 那条规矩）；
  //   ② 它读不出判重表 ⇒ 以为"没记录过" ⇒ 同一批视频反复推送（用户实测反馈 2026-10-16）。
  const seenFile = join(stateDir, 'seen.md')
  try {
    if (!existsSync(seenFile)) {
      writeFileSync(seenFile, [
        '# 刷B站 · 判重表（宿主预建，那一轮只往后面追加）',
        '',
        '## 评论记录（BV | rpid | root（楼中楼才填） | 时间 | 正文前 20 字）',
        '',
        '| BV | rpid | root（楼中楼才填） | 时间 | 正文前 20 字 |',
        '| --- | --- | --- | --- | --- |',
        '',
        '## 看过的视频',
        '',
      ].join('\n'), 'utf8')
    }
  } catch {  }

  // ⭐ 归档目录：那一轮**被沙箱关着**，只写得了"启动前就已存在"的目录 ⇒ 宿主预建 ✓
  //    （2026-10-16 主人要的"它看过什么"清单：报告是给人看的，归档是给检索用的 ✓）
  const digestDir = join(stateDir, 'digest')
  try { mkdirSync(digestDir, { recursive: true }) } catch {  }


  let installingAsr = false


  const resolveUv = async () => {
    const bundled = join(stateDir, 'bin', process.platform === 'win32' ? 'uv.exe' : 'uv')
    if (await haveUv()) return 'uv'
    if (existsSync(bundled)) return bundled
    appendInstall('这台机器上没有 uv —— 我下一份放进插件家目录（单文件、免管理员、约 15MB，只需要一次）…\n')
    const got = await ensureUv({ dir: join(stateDir, 'bin'), log: appendInstall })
    if (got) appendInstall('uv 已就位：' + got + '\n')
    return got
  }


  const spawnTo = (cmd, args, { sink = appendInstall, env = null } = {}) => new Promise((resolve) => {
    sink(`\n$ ${cmd} ${args.join(' ')}\n`)
    let c
    try {
      c = spawn(cmd, args, { cwd: stateDir, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
        env: pyEnv(env || {}) })
    } catch (e) { sink(`起不来：${e?.message ?? e}\n`); return resolve(1) }
    const w = (b) => sink(String(b))
    c.stdout?.on('data', w)
    c.stderr?.on('data', w)
    c.on('exit', (code) => { sink(`\n--- exit ${code} ---\n`); resolve(code) })
    c.on('error', (e) => { sink(`起不来：${e?.message ?? e}\n`); resolve(1) })
  })


  const runAsrInstall = () => {
    if (installingAsr) return { ok: true, busy: true, log: asrLogFile, hint: '正在装转写依赖，别重复起' }
    installingAsr = true
    appendAsr(`\n=== ${new Date().toISOString()} 开始装"本地转写"依赖 ===\n`)
    ;(async () => {
      try {
        const mirror = process.env.BILI_DUTY_PIP_MIRROR || 'https://pypi.tuna.tsinghua.edu.cn/simple'
        const hf = process.env.BILI_DUTY_HF_ENDPOINT || 'https://hf-mirror.com'
        const py = asrPython()
        const uvCmd = await resolveUv()
        if (!existsSync(py)) {
          // --seed：把 pip 也装进去（uv 默认不给）—— 不然出现问题时连 pip 都没有，没法补救 ✗
          if (uvCmd) await spawnTo(uvCmd, ['venv', '--seed', asrDir], { sink: appendAsr })
          else await spawnTo(String(cfg.pythonPath || 'python'), ['-m', 'venv', asrDir], { sink: appendAsr })
        }
        if (!existsSync(py)) {
          appendAsr('建环境失败 —— 先点上面的「装依赖」，把 uv 或 Python 准备好\n')
          log('转写：建环境失败'); return
        }
        appendAsr('装 faster-whisper + yt-dlp（走国内镜像）…\n')
        let code = 1
        // ⚠️ av 必须钉在 17 以下：faster-whisper 1.2.1 会调 av.open(metadata_errors=…)，
        //    而 av 17+ 不再接受这个参数 ⇒ 装了最新的 av 反而转不了（2026-10-14 在主人机器上实证）
        const AV_PIN = process.env.BILI_DUTY_AV_PIN || 'av>=12,<17'
        if (uvCmd) code = await spawnTo(uvCmd, ['pip', 'install', '--python', py, '-i', mirror, 'faster-whisper', 'yt-dlp', AV_PIN], { sink: appendAsr })
        if (code !== 0) code = await spawnTo(py, ['-m', 'pip', 'install', '-i', mirror, 'faster-whisper', 'yt-dlp', AV_PIN], { sink: appendAsr })
        if (code !== 0) { appendAsr('装包失败 —— 看上面的报错\n'); log('转写：装包失败'); return }
        // ⭐ 顺手把模型也下好（不然第一次跑那一轮会卡在下载上 ✗）；模型走 HuggingFace 国内镜像
        const model = String(cfg.asrModel || 'small')
        // 模型缓存必须放进插件家：默认的 ~/.cache 在本机拒绝写入（2026-10-14 实测 WinError 5）
        const hfHome = join(stateDir, '.hf-cache')
        try { mkdirSync(hfHome, { recursive: true }) } catch {  }
        appendAsr(`下 Whisper 模型「${model}」（缓存在 ${hfHome}，源 ${hf}，几百 MB，只需要一次）…\n`)
        const code2 = await spawnTo(py, ['-c',
          'import os,sys;os.environ["HF_HUB_DISABLE_XET"]="1";from faster_whisper import WhisperModel;WhisperModel(sys.argv[1], device="cpu", compute_type="int8");print("模型就绪")',
          model], { sink: appendAsr, env: { HF_ENDPOINT: hf, HF_HOME: hfHome, HF_HUB_DISABLE_XET: '1' } })
        appendAsr(`=== 结束（装包 exit ${code}，模型 exit ${code2}，asrReady=${asrReadyNow()}）===\n`)
        log(`装转写依赖结束：exit=${code}/${code2}`)
      } catch (e) {
        appendAsr(`装转写依赖崩了：${e?.stack ?? e}\n`)
        log(`装转写依赖崩了：${e?.message ?? e}`)
      } finally { installingAsr = false }
    })()
    return { ok: true, started: true, log: asrLogFile, hint: '正在后台装转写依赖 —— 进度显示在下面（要下几百 MB 模型，慢一点正常）' }
  }

  const runInstall = () => {
    if (installing) return { ok: true, busy: true, log: installLogFile, hint: '正在装，别重复起' }
    installing = true
    appendInstall(`\n=== ${new Date().toISOString()} 开始装依赖 ===\n`)
    ;(async () => {
      try {
        const reqFile = join(pluginDir, 'vendor', 'bilibili-mcp', 'requirements.txt')
        const mirror = process.env.BILI_DUTY_PIP_MIRROR || 'https://pypi.tuna.tsinghua.edu.cn/simple'
        const venvPy = venvPython()
        const py = String(cfg.pythonPath || 'python')
          const uvCmd = await resolveUv()   // ⭐ 系统里的 → 家里下好的 → 自己下一份
        if (!existsSync(venvPy) && !uvCmd && !(await probeCmd(py))) {
          const msg = '这台机器上没有 uv，也没有可用的 python（试过 "' + py + '"），而且我自动下 uv 也没成功'
            + '（大概是网络到不了 GitHub / PyPI 镜像）。⇒ 请手动装 uv（单个 exe：https://docs.astral.sh/uv/）'
            + '或 Python 3.10+（安装时勾 Add to PATH），然后回来再点一次「装依赖」。'
          appendInstall(msg + '\n'); log(msg); installing = false; return
        }
        if (!existsSync(venvPy)) {
          // ⭐ 2026-10-17（issue #8③）：ASR 那个环境带了 --seed，主环境却漏了 ⇒ uv 建的 venv 默认不含 pip，
          //    一旦镜像失败、回退 `python -m pip` 就是 `No module named pip` ⇒ 连补救的路都没有 ✗
          if (uvCmd) await spawnLogged(uvCmd, ['venv', '--seed', join(stateDir, '.venv')])
          if (!existsSync(venvPy) && !uvCmd) await spawnLogged(py, ['-m', 'venv', join(stateDir, '.venv')])
        }
        let code = 1
        // ⭐ 2026-10-17（issue #8②）：镜像也会整站拒绝（清华对部分 IP 回 403，而 pip 的报错写成"这个包不存在"，很误导）
        //    ⇒ 一个镜像失败就换下一个，别让用户在一个死镜像上反复撞
        const mirrors = [mirror, 'https://mirrors.ustc.edu.cn/pypi/simple', 'https://mirrors.aliyun.com/pypi/simple']
        for (let i = 0; i < mirrors.length && code !== 0; i++) {
          const m = mirrors[i]
          if (i > 0) appendInstall(`\n--- 换个镜像再试：${m} ---\n`)
          if (uvCmd) code = await spawnLogged(uvCmd, ['pip', 'install', '--python', venvPy, '-i', m, '-r', reqFile])
          if (code !== 0) code = await spawnLogged(venvPy, ['-m', 'pip', 'install', '-i', m, '-r', reqFile])
        }
        if (code === 0 && existsSync(venvPy)) {
          await persistCfg({ pythonPath: venvPy })   // ⭐ 不然设置页里显式设过 pythonPath 的话，这里就白写了
          appendInstall(`已把 pythonPath 设为 ${venvPy}\n`)
        }
        appendInstall(`=== 结束（exit ${code}，venvReady=${venvReadyNow()}）===\n`)
        log(`装依赖结束：exit=${code} venvReady=${existsSync(venvPy)}`)
      } catch (e) {
        appendInstall(`装依赖崩了：${e?.stack ?? e}\n`)
        log(`装依赖崩了：${e?.message ?? e}`)
      } finally { installing = false }
    })()
    return { ok: true, started: true, log: installLogFile, hint: '正在后台装依赖 —— 进度就显示在下面（走国内镜像，通常几十秒到一两分钟）' }
  }


  const checkUp = async () => {
    const out = { ok: false, steps: [] }
    if (!venvReadyNow()) { out.error = '环境还没装好（可能上次装失败了）—— 点「重装主依赖」再试一次'; return out }
    if (!hasCredential()) { out.error = '还没登录：点「扫码登录」，手机 B站 扫一下'; return out }
    try {
      const who = await call('bili_check_credential', {}, { timeoutMs: 20000 })
      if (who?.logged_in !== true || who?.error || !hasCredential()) throw new Error(who.message || who.error || '登录已失效')
      loginHealth = { ok: true, at: Date.now(), message: '登录有效' }
      out.who = (typeof who === 'object' ? JSON.stringify(who) : String(who)).slice(0, 140)
      out.steps.push('登录有效')
    } catch (e) { loginHealth = { ok: false, at: Date.now(), message: '登录检查失败或凭证已失效，请检查连接或重新扫码' }; out.error = '登录检查失败：' + (e?.message ?? e); return out }
    try {
      const s = await call('bili_search', { keyword: cfg.keywords[0] || '人工智能', num: 3 }, { timeoutMs: 20000 })
      if (s?.error || s?.success === false || !Array.isArray(s?.videos)) throw Error(s?.error || '接口没有返回有效视频列表')
      const t = typeof s === 'string' ? s : JSON.stringify(s)
      out.sample = t.slice(0, 160)
      out.steps.push('搜索成功，返回' + s.videos.length + '条视频')
      out.ok = true
    } catch (e) { out.error = '搜索失败：' + (e?.message ?? e) }
    return out
  }

  let updateCache = null            // { at, latest } —— 检查更新的结果缓存

  const status = () => {
    refreshCfg()
    const today = dayKey()
    return {
      ok: true,
      home: stateDir,
      config: cfg,
      cycle: { ...cycle.state, busy: cycle.busy },
      ...worker.status(),
      loginHealth,
      today,

      loggedIn: hasCredential(),
      venvReady: venvReadyNow(),
      version: myVersion(),
      installFailed: !installing && !venvReadyNow() && (() => { try { return readFileSync(installLogFile, 'utf8').length > 0 } catch { return false } })(),
      installing,
      // ── 本地转写那一套的状态（设置页要显示进度）──
      asrReady: asrReadyNow(),
      // 模型下没下（免得界面写"就绪"、其实还得现下）
      asrModelReady: (() => { try { return existsSync(join(stateDir, '.hf-cache', 'hub')) } catch { return false } })(),
      asrInstalling: installingAsr,
      asrLog: asrLogFile,
      asrTail: (() => { try { return readFileSync(asrLogFile, 'utf8').slice(-1400) } catch { return '' } })(),
      installLog: installLogFile,
      // ⭐ 让设置页能显示"装到哪了"（陌生人原来只看到一句"后台在装" ✗）
      installTail: (() => { try { return readFileSync(installLogFile, 'utf8').slice(-1400) } catch { return '' } })(),
      report: join(outDir, `${today}.md`),
      log: logFile,
    }
  }

  const handle = async (req, res, url) => {
    refreshCfg()
    const path = url.pathname
    if (req.method === 'GET' && path === '/api/bili-duty/connection') return sendJson(res, 200, { ok: true, ...apiConnection.status() })
    if (req.method === 'POST' && ['/api/bili-duty/connection/save', '/api/bili-duty/connection/test'].includes(path)) {
      try {
        if (path.endsWith('/save') && (cycle.busy || cycle.state.running || petChat.status()?.state === 'running')) throw Error('请先停止运行并等当前回复完成，再修改 API')
        const body = await readBody(req)
        const result = path.endsWith('/test') ? await apiConnection.test(body) : apiConnection.save(body)
        return sendJson(res, 200, { ok: true, ...result })
      } catch (e) { return sendJson(res, 400, { ok: false, error: e.message }) }
    }
    if (req.method === 'POST' && path === '/api/bili-duty/pets/reset-chat') {
      const body = await readBody(req)
      if (petChat.status()?.state === 'running') throw Error('请等宠物回复完成再重置')
      if (body.petId !== pets.activeId) throw Error('宠物已切换，请刷新')
      pets.resetChat(body.petId); return sendJson(res, 200, { ok: true })
    }
    if (req.method === 'POST' && path === '/api/bili-duty/pets/delete') {
      const body = await readBody(req), target = pets.get(String(body.id))
      if (target.id === 'builtin-companion') throw Error('内置默认宠物不能删除')
      if (petChat.status()?.state === 'running' || cycle.busy) throw Error('请等当前操作完成再删除')
      if (target.id === pets.activeId) await selectPet('builtin-companion')
      pets.remove(target.id); return sendJson(res, 200, { ok: true })
    }
    if (req.method === 'GET' && path === '/api/bili-duty/pets') return sendJson(res, 200, { ok: true, activeId: pets.activeId, pets: pets.list(), messages: pets.active().messages, chat: petChat.status() })
    if (req.method === 'POST' && path === '/api/bili-duty/pets/select') {
      const body = await readBody(req); await selectPet(String(body.id)); return sendJson(res, 200, { ok: true })
    }
    if (req.method === 'POST' && path === '/api/bili-duty/pets/create') {
      const body = await readBody(req)
      if (petChat.status()?.state === 'running') throw Error('请等当前宠物回复完成')
      const profile = normalizePet({ ...PET_DEFAULTS, ...body })
      if (!String(body.petPersonality||'').trim()) profile.petPersonality=profile.ownerTitle+'养的好奇小伙伴，聪明、温和、有独立判断，喜欢分享发现，偶尔有一点小得意。'
      const pet = pets.create({ ...cfg, ...profile, autoComment: false, replyToComments: false })
      await selectPet(pet.id); return sendJson(res, 200, { ok: true, id: pet.id })
    }
    if (req.method === 'POST' && path === '/api/bili-duty/pets/chat') {
      const body = await readBody(req)
      if (body.petId !== pets.activeId) throw Error('宠物已切换，请刷新后再发消息')
      return sendJson(res, 200, { ok: true, job: petChat.start(body.text) })
    }
    if(req.method==='GET' && path==='/api/bili-duty/browse-options')return sendJson(res,200,{ok:true,presets:BROWSE_PRESETS,types:VIDEO_TYPES})
    if(req.method==='POST' && path==='/api/bili-duty/pets/browse-feedback'){
      const body=await readBody(req)
      if(body.petId!==pets.activeId)throw Error('宠物已切换，请刷新后重试')
      const ledger=readJson(join(stateDir,'cycle-memory.json'),{})
      const row=(ledger.events||[]).find(r=>r.key===body.key&&r.group==='video'&&(r.petId||'gpt6')===pets.activeId)
      if(!row)throw Error('视频日志不存在')
      if(body.mode!=='undo'&&(!VIDEO_TYPES.includes(body.type)||!['more','less','block'].includes(body.mode)))throw Error('请选择有效的视频类型和偏好')
      const entries=feedbackEntries(cfg).filter(v=>v.key!==body.key)
      if(body.mode!=='undo')entries.push({key:row.key,type:body.type,mode:body.mode})
      await persistCfg({browseFeedback:entries.slice(-100).map(v=>JSON.stringify(v))})
      return sendJson(res,200,{ok:true})
    }
    if (req.method === 'GET' && path === '/api/bili-duty/pets/logs') {
      const group = url.searchParams.get('group') === 'messages' ? 'messages' : 'video'
      const ledger = readJson(join(stateDir, 'cycle-memory.json'), {})
      const unique = new Map()
      const cachedInfo = readJson(join(stateDir,'video-cache.json'),{})
      for (const row of ledger.events || []) if (row.group === group && (row.petId || 'gpt6') === pets.activeId) unique.set(row.key, { ...row, title:row.title || cachedInfo['bili_video_info:'+row.bvid]?.value?.title || row.bvid })
      return sendJson(res, 200, { ok: true, items: [...unique.values()].sort((a,b) => b.at-a.at).slice(0, 150).map(row=>({...row,feedback:feedbackEntries(cfg).find(v=>v.key===row.key)})) })
    }
    if (req.method === 'GET' && path === '/api/bili-duty/pets/log-detail') {
      const ledger = readJson(join(stateDir, 'cycle-memory.json'), {})
      const row = [...(ledger.events || [])].reverse().find(r => r.key === url.searchParams.get('key') && (r.petId || 'gpt6') === pets.activeId)
      if (!row) throw Error('日志不存在')
      let taskId = row.taskId
      if (!taskId) {
        const candidates = readdirSync(join(stateDir, 'decisions')).filter(n => /^[0-9a-f-]{36}-input\.json$/.test(n)).sort((a,b) => statSync(join(stateDir,'decisions',b)).mtimeMs-statSync(join(stateDir,'decisions',a)).mtimeMs)
        const match = candidates.find(n => { const v=readJson(join(stateDir,'decisions',n),{}); return v.item?.bvid===row.bvid && (!row.rpid || String(v.item?.rpid)===String(row.rpid)) })
        taskId = match?.slice(0, 36)
      }
      const detail = { row }
      if (/^[0-9a-f-]{36}$/.test(taskId || '')) {
        detail.input = readJson(join(stateDir, 'decisions', taskId + '-input.json'), null)
        detail.result = readJson(join(stateDir, 'decisions', taskId + '.json'), null)
        const trace = join(stateDir, 'decisions', taskId + '-trace.log')
        if (existsSync(trace)) detail.trace = readFileSync(trace,'utf8').slice(-30000)
      }
      return sendJson(res, 200, { ok: true, ...detail })
    }
    if (req.method === 'GET' && path === '/api/bili-duty/status') return sendJson(res, 200, status())

    if (req.method === 'GET' && path === '/api/bili-duty/memes') {
      try { return sendJson(res, 200, { ok: true, pack: cfg.memePack, items: listMemes(stateDir, cfg).map(({ file, code, ...m }) => m) }) }
      catch (e) { return sendJson(res, 400, { ok: false, error: e.message }) }
    }
    if (req.method === 'POST' && path === '/api/bili-duty/memes/import') {
      try {
        const body = await readBody(req, 7_100_000)
        const item = importMeme(stateDir, { ...body, pack: cfg.memePack })
        return sendJson(res, 200, { ok: true, item })
      } catch (e) { return sendJson(res, 400, { ok: false, error: e.message }) }
    }
    if (req.method === 'GET' && path === '/api/bili-duty/config') {
      return sendJson(res, 200, { ok: true, config: cfg, home: stateDir })
    }

    if (req.method === 'POST' && path === '/api/bili-duty/config') {
      const body = await readBody(req)
      const patch = {}
      for (const k of Object.keys(DEFAULTS)) {
        if (k in body) patch[k] = body[k]
      }
      // ⭐ 范围钳制 + 两份都写（config.json / DSH 原生设置页），统一走 persistCfg —— 见文件上方
      const { clean, host } = await persistCfg(patch)
      log(`设置已更新：${JSON.stringify(clean)}（DSH 那边${host.ok ? '已同步' : '没写成：' + host.error}）`)
      return sendJson(res, 200, { ok: true, config: cfg, host })
    }

    if (req.method === 'POST' && path === '/api/bili-duty/run') {
      return sendJson(res, 200, runDuty())
    }

    if (req.method === 'POST' && path === '/api/bili-duty/start') return sendJson(res, 200, cycle.start())
    if (req.method === 'POST' && path === '/api/bili-duty/stop') return sendJson(res, 200, cycle.stop())

    // 建 venv + 装依赖（**不等它**：几分钟的活，进度写 install.log）
    if (req.method === 'POST' && path === '/api/bili-duty/install') {
      return sendJson(res, 200, runInstall())
    }

    // 装"本地转写"那套（独立环境：faster-whisper + yt-dlp + Whisper 模型）
    if (req.method === 'POST' && path === '/api/bili-duty/install-asr') {
      return sendJson(res, 200, runAsrInstall())
    }

    // 只读复核只证明当前登录态下是否查到，不能保证公开可见。
    if (req.method === 'POST' && path === '/api/bili-duty/verify') return sendJson(res, 200, await runVerify('manual'))

    // 「看今天的报告」：把报告的文本读出来给设置页显示（浏览器不能直接开本地文件 ✗）
    if (req.method === 'GET' && path === '/api/bili-duty/report') {
      const day = String(url.searchParams.get('day') || dayKey()).replace(/[^0-9-]/g, '') || dayKey()
      const file = join(outDir, day + '.md')
      let text = ''
      let exists = false
      try { exists = existsSync(file); if (exists) text = readFileSync(file, 'utf8').slice(0, 200000) } catch {  }
      return sendJson(res, 200, { ok: true, day, exists, file, text })
    }

    // 「打开文件夹」：浏览器开不了本地目录 ⇒ 让宿主去开（只认 out / home 两个，别的不受理）
    if (req.method === 'POST' && path === '/api/bili-duty/open') {
      const body = await readBody(req)
      const dir = String(body?.what || 'out') === 'home' ? stateDir : outDir
      if (process.platform !== 'win32') return sendJson(res, 200, { ok: false, error: '这个按钮目前只做了 Windows' })
      // ⭐ 三种方式依次试（PATH 不全时 explorer.exe 会找不到 ✗；spawn 的失败是**异步**的，
      //    try/catch 抓不到 ⇒ 必须挂 'error' 监听，否则会升级成未捕获异常）
      // ⭐ 顺序很重要：把**最可能真的弹出窗口**的放第一（cmd start 走 shell 的 ShellExecute ✓）
      //    并且**不要再传 windowsHide**（2026-10-15 实测：传了以后"成功"但窗口不出现 ✗）
      const attempts = [
        ['cmd.exe', ['/c', 'start', '', dir]],
        [join(process.env.SystemRoot || 'C:\\Windows', 'explorer.exe'), [dir]],
        ['powershell.exe', ['-NoProfile', '-Command', "Start-Process -FilePath '" + dir.replace(/'/g, "''") + "'"]],
      ]
      let lastErr = ''
      for (const [cmd, args] of attempts) {
        const err = await new Promise((resolve) => {
          let done = false
          let child
          try { child = spawn(cmd, args, { detached: true, stdio: 'ignore' }) } catch (e) { resolve(String(e?.message ?? e)); return }
          child.on('error', (e) => { if (!done) { done = true; resolve(String(e?.message ?? e)) } })
          setTimeout(() => { if (!done) { done = true; try { child.unref() } catch {  } resolve('') } }, 500)
        })
        if (!err) { log('打开文件夹：用了 ' + cmd + '（没报错；窗口不一定真弹出来了）'); return sendJson(res, 200, { ok: true, opened: dir, via: cmd }) }
        lastErr = err
        log('打开文件夹失败（' + cmd + '）：' + err)
      }
      return sendJson(res, 200, { ok: false, error: lastErr, dir })
    }

    // 「一键升级」：点了它自己跑 add（⚠️ 之后要重启才生效）
    if (req.method === 'POST' && path === '/api/bili-duty/upgrade') return sendJson(res, 200, runUpgrade())

    // 「检查更新」：⚠️ 只在用户点按钮时才联网（不偷偷发请求 ✓），结果缓存一天 ✓
    if (req.method === 'GET' && path === '/api/bili-duty/update') {
      const out = { ok: true, current: myVersion(), latest: '', hasNew: false, page: 'https://www.npmjs.com/package/dsh-bili-scroll' }
      try {
        if (updateCache && Date.now() - updateCache.at < 24 * 3600 * 1000) out.latest = updateCache.latest
        else {
          const ctrl = new AbortController()
          const timer = setTimeout(() => ctrl.abort(), 8000)
          const r = await fetch('https://registry.npmjs.org/dsh-bili-scroll/latest', { signal: ctrl.signal })
          clearTimeout(timer)
          const j = await r.json()
          out.latest = String(j.version || '')
          updateCache = { at: Date.now(), latest: out.latest }
        }
      } catch (e) { out.ok = false; out.error = String(e?.message ?? e); return sendJson(res, 200, out) }
      // ⭐ 要比谁更新，不能只比不相等 —— 否则本地版本高于 npm 时会误报有新版
      const vnum = (v) => String(v || '').split('.').map((x) => parseInt(x, 10) || 0)
      const cmp = (a, b) => {
        const x = vnum(a), y = vnum(b)
        for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0) }
        return 0
      }
      out.hasNew = Boolean(out.latest) && cmp(out.latest, out.current) > 0
      return sendJson(res, 200, out)
    }

    // 「测一下」：真跑一次，回答"能不能用"
    if (req.method === 'POST' && path === '/api/bili-duty/check') {
      return sendJson(res, 200, await checkUp())
    }
    if (req.method === 'POST' && path === '/api/bili-duty/logout') {
      loginGeneration++; loginKeys.clear(); cycle.stop()
      for (let i = 0; cycle.busy && i < 100; i++) await new Promise(r => setTimeout(r, 50))
      if (cycle.busy) throw Error('正在停止后台操作，请稍后再退出登录')
      mcp?.stop(); mcp = null; mcpKey = ''
      rmSync(join(stateDir, 'bili_credential.json'), { force: true })
      rmSync(join(stateDir, 'qrcode_login.png'), { force: true })
      loginHealth = { ok: false, at: Date.now(), message: '已退出本应用的B站登录' }
      return sendJson(res, 200, { ok: true, message: '已退出B站登录，后台浏览已停止；可重新扫码登录' })
    }

    // ── 扫码登录（设置页用）──
    if (req.method === 'POST' && path === '/api/bili-duty/login/start') {
      const { key, url } = await loginStart()
      const png = await renderQrPng(cfg.pythonPath, stateDir, url)
      let qr = null
      if (png) { try { qr = 'data:image/png;base64,' + readFileSync(png).toString('base64') } catch { qr = null } }
      log(`出码：${url}${qr ? '（已画成 PNG）' : '（没画出 PNG —— venv 里大概还没有 qrcode）'}`)
      return sendJson(res, 200, { ok: true, key, url, qr })
    }

    if (req.method === 'POST' && path === '/api/bili-duty/login/poll') {
      const body = await readBody(req)
      const r = await loginPoll(String(body.key || ''))
      if (r.state === 'ok') {
        const file = saveCredential(stateDir, r.credential)
        log(`登录成功，凭证已写入 ${file}`)
        return sendJson(res, 200, { ok: true, state: 'ok', file })
      }
      return sendJson(res, 200, { ok: r.state !== 'unknown', state: r.state, code: r.code, message: r.message })
    }

    return sendJson(res, 404, { ok: false, error: `unknown ${req.method} ${path}` })
  }

  try {
    ctx.effect(() => ctx.webServer.register({
      kind: 'prefix',
      path: '/api/bili-duty',
      handler: async (req, res) => {
        try { await handle(req, res, new URL(req.url, 'http://127.0.0.1')) } catch (e) {
          sendJson(res, 500, { ok: false, error: e?.message ?? String(e) })
        }
      },
    }), 'bili-duty: /api/bili-duty 路由')
  } catch (e) { log(`HTTP 路由没挂上：${e?.message ?? e}`) }

  ctx.effect(() => () => { try { mcp?.stop() } catch {  } }, 'bili-duty: 收 MCP 子进程')
  log(`已挂载双任务循环（家=${stateDir}，python=${cfg.pythonPath}，等待手动开始）`)
}
