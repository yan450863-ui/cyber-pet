/* 浏览器自注册入口：设置页与对话区共用同一个面板。 */
window.__ModuleLoader__.load({
  id: 'dsh-bili-scroll',
  factory(require) {
    const React = require('react'), h = React.createElement
    const API = '/api/bili-duty'
    const readingDefaults={videoReadChars:600,videoFollowupChars:1200,allowVideoFollowup:true,petAliases:'',petSelfRecognition:true}
    const fieldLabels={}
    const browseTypes=['教程','评测','资讯','论文解读','剧情解说','剪辑','制作分析','日常','其他']
    function BrowseFeedback({row,petId}) {
      const [type,setType]=React.useState(row.feedback?.type||row.browseType||'其他'),[busy,setBusy]=React.useState(false),[msg,setMsg]=React.useState('')
      const send=async mode=>{setBusy(true);try{await request('/pets/browse-feedback',{petId,key:row.key,type,mode});setMsg(mode==='undo'?'已撤销反馈':'已保存，后续搜索候选按此类型筛选和排序')}catch(e){setMsg(e.message)}finally{setBusy(false)}}
      return h('div',null,h('p',null,'偏好反馈（作用于所选视频类型，可撤销）：'),h('select',{'aria-label':'反馈的视频类型',value:type,onChange:e=>setType(e.target.value)},...browseTypes.map(v=>h('option',{key:v,value:v},v))),...Object.entries({more:'多看这类',less:'少看这类',block:'不看这类',undo:'撤销反馈'}).map(([mode,label])=>h('button',{key:mode,disabled:busy,onClick:()=>send(mode)},label)),row.feedback?h('p',null,'当前反馈：'+row.feedback.type+' · '+({more:'多看',less:'少看',block:'不看'}[row.feedback.mode])):null,msg?h('p',{role:'status'},msg):null)
    }
    async function request(path, body) {
      const res = await fetch(API + path, { credentials: 'same-origin', ...(path === '/check' ? {signal:AbortSignal.timeout(50000)} : {}), ...(body === undefined ? {} : {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      }) })
      const result = await res.json(); if (!res.ok) throw new Error(result.error || '请求失败：HTTP ' + res.status)
      if (result.ok === false) throw new Error(result.error || result.hint || '操作失败')
      return result
    }
    const CSS = `
[data-bd-page]{display:flex;flex-direction:column;gap:16px;max-width:680px;font-size:13px;color:inherit;}
[data-bd-page] section{display:flex;flex-direction:column;gap:9px;border-bottom:1px solid #8883;padding-bottom:14px;}
[data-bd-page] h3{font-size:14px;margin:0;font-weight:600;}
[data-bd-page] label{display:flex;align-items:center;gap:9px;flex-wrap:wrap;}
[data-bd-page] input:not([type=checkbox]),[data-bd-page] textarea,[data-bd-page] select{box-sizing:border-box;border:1px solid #8885;border-radius:7px;background:transparent;color:inherit;font:inherit;padding:6px 8px;}
[data-bd-page] input[type=number]{width:90px;}
[data-bd-page] input[type=text],[data-bd-page] textarea{width:100%;}
[data-bd-page] input[type=checkbox]{accent-color:#3b82f6;}
[data-bd-page] button,[data-bd-dock]>button{font:inherit;cursor:pointer;border:1px solid #8885;border-radius:7px;background:transparent;color:inherit;padding:6px 12px;}
[data-bd-page] button:disabled{opacity:.5;cursor:default;}
[data-bd-page] button[data-primary]{background:#2563eb;color:white;border-color:#2563eb;}
[data-bd-actions]{display:flex;gap:8px;flex-wrap:wrap;}
[data-bd-note]{font-size:12px;opacity:.7;line-height:1.6;}
[data-bd-status]{border:1px solid #8884;border-radius:9px;padding:10px;line-height:1.7;}
[data-bd-error]{color:#d97706;white-space:pre-wrap;overflow-wrap:anywhere;}
[data-bd-page] pre{font-size:11px;white-space:pre-wrap;overflow-wrap:anywhere;max-height:160px;overflow:auto;}
[data-bd-qr]{width:160px;height:160px;background:white;padding:8px;}
[data-bd-dock]{padding:4px 0;}
[data-bd-dock-body]{max-height:48vh;overflow:auto;padding:14px;margin:6px 0;border:1px solid #8884;border-radius:10px;background:var(--dsw-alias-bg-base,#fff);}
`
    const phases = { stopped: '未开始', paused: '已停止，可继续', running: '正在处理', waiting: '等待操作间隔', resting: '视频组轮间休息', budget: '浏览预算已用完，保留消息额度', complete: '本次已完成', retrying: '异常后等待重试', 'outside-hours': '等待运行时段' }
    function Panel() {
      const [browseOptions,setBrowseOptions]=React.useState(null)
      React.useEffect(()=>{request('/browse-options').then(setBrowseOptions).catch(()=>{})},[])
      const [st, setSt] = React.useState(null), [draft, setDraft] = React.useState(null)
      const [busy, setBusy] = React.useState(''), [message, setMessage] = React.useState('')
      const [memeItems, setMemeItems] = React.useState([]), [memeEmotion, setMemeEmotion] = React.useState('开心')
      const [qr, setQr] = React.useState(null), [report, setReport] = React.useState(null)
      const [accountMessage,setAccountMessage]=React.useState(''),[logoutConfirm,setLogoutConfirm]=React.useState(false)
      const alive = React.useRef(true), loginTimer = React.useRef(null), polling = React.useRef(false)
      React.useEffect(() => {
        alive.current = true
        let loading = false
        const refresh = async () => {
          if (loading) return
          loading = true
          try {
            const result = await request('/status')
            if (alive.current) { setSt(result); setDraft(old => old || { ...readingDefaults, ...result.config, keywords: (result.config.keywords || []).join('\n'), excludedWords: (result.config.excludedWords || []).join('\n'), preferredAuthors: (result.config.preferredAuthors || []).join('\n'),browsePreferredUids:(result.config.browsePreferredUids||[]).join('\n'),browseBlockedUids:(result.config.browseBlockedUids||[]).join('\n') }) }
          } catch (e) { if (alive.current) setMessage(e.message) }
          finally { loading = false }
        }
        refresh()
        const timer = setInterval(refresh, 2000)
        return () => { alive.current = false; clearInterval(timer); clearInterval(loginTimer.current) }
      }, [])
      const edit = (key, value) => setDraft(old => ({ ...old, [key]: value }))
      const act = async (key, action) => {
        setBusy(key); setMessage('')
        try { const result = await action(); if (alive.current) setMessage(result || '操作完成') }
        catch (e) { if (alive.current) setMessage(e.message) }
        finally { if (alive.current) setBusy('') }
      }
      const save = async () => {
        const cfg = { ...readingDefaults, ...draft, keywords: String(draft.keywords || '').split('\n').map(s => s.trim()).filter(Boolean) }
        for (const key of ['excludedWords', 'preferredAuthors','browsePreferredUids','browseBlockedUids']) cfg[key] = String(draft[key] || '').split('\n').map(s => s.trim()).filter(Boolean)
        for(const key of ['browsePreferredUids','browseBlockedUids'])if(cfg[key].some(v=>!/^\d{1,20}$/.test(v)||Number(v)<=0))throw Error('UP列表请填写数字UID，一行一个')
        if(['videoReadChars','videoFollowupChars'].some(k=>Number(cfg[k])<100||Number(cfg[k])>6000))throw Error('阅读字数须为100—6000')
        if(Number(cfg.browseDays)>365||Number(cfg.browseFreshDays)>365)throw Error('时间范围须为0—365天')
        if(Number(cfg.browseExplorationPercent)>100)throw Error('探索比例须为0—100')
        for (const key of ['videoReadChars','videoFollowupChars','browseDays','browseFreshDays','browseExplorationPercent','memeChance', 'memeMaxCount', 'memeCooldownSec', 'maxCommentChars', 'maxReplyChars', 'videoCount', 'videoIntervalSec', 'messagesCount', 'messagesIntervalSec', 'restMinutes', 'maxRounds', 'cooldownSec', 'dailyTokenBudget', 'replyReserveTokens', 'maxThreadReplies', 'cacheMinutes', 'retentionDays', 'aiWeight', 'llmWeight', 'animeWeight', 'animationWeight']) {
          const n = Number(cfg[key])
          if (cfg[key] === '' || !Number.isInteger(n) || n < (key.endsWith('IntervalSec') || ['cooldownSec', 'retentionDays'].includes(key) ? 1 : 0) || n > 100000000) throw new Error((fieldLabels[key]||key)+'：请填写有效整数；此项最小值为'+(key.endsWith('IntervalSec')||['cooldownSec','retentionDays'].includes(key)?1:0))
          cfg[key] = n
        }
        for (const key of ['maxCommentChars', 'maxReplyChars']) if (cfg[key] < 1 || cfg[key] > 1000) throw new Error('评论和回复字数上限须为1—1000')
        for (const key of ['petWorkScope']) if (!String(cfg[key] || '').trim()) throw new Error('请填写完整宠物档案')
        if (cfg.ownerBiliUid && !/^[1-9][0-9]{0,18}$/.test(cfg.ownerBiliUid.trim())) throw Error('主人B站账号请填写数字UID')
        if (cfg.mentionOwnerOnLikedVideo && !cfg.ownerBiliUid?.trim()) throw Error('请先填写主人的B站UID，再开启@主人')
        if (cfg.memeChance > 100 || cfg.memeMaxCount < 1 || cfg.memeMaxCount > 3 || cfg.memeCooldownSec > 86400) throw new Error('表情概率须为0—100，每条数量1—3，冷却最多86400秒')
        if (!/^[a-zA-Z0-9_-]{1,48}$/.test(cfg.memePack || '')) throw new Error('图库ID只能用1—48位字母、数字、下划线或短横线')
        const result = await request('/config', cfg)
        if (result.host?.ok === false) throw new Error('配置已保存到插件，但宿主同步失败：' + result.host.error)
        if (alive.current) setSt(old => ({ ...old, config: result.config }))
        return '设置已保存'
      }
      const login = async () => {
        clearInterval(loginTimer.current)
        const result = await request('/login/start', {})
        if (!alive.current) return ''
        setQr(result.qr)
        if (!result.qr) return '未生成二维码，请检查主依赖'
        let tries = 0
        loginTimer.current = setInterval(async () => {
          if (polling.current) return
          polling.current = true
          try {
            const r = await request('/login/poll', { key: result.key })
            if (!alive.current) return
            if (r.state === 'ok') { clearInterval(loginTimer.current); setQr(null); setSt(old => ({ ...old, loggedIn: true })); setMessage('登录成功'); setAccountMessage('登录成功') }
            else if (r.state === 'expired' || ++tries >= 90) { clearInterval(loginTimer.current); setQr(null); setMessage('二维码已过期，请重新获取'); setAccountMessage('二维码已过期，请重新获取') }
            else {const msg=r.state === 'scanned' ? '请在手机上确认登录' : '等待手机扫码';setMessage(msg);setAccountMessage(msg)}
          } catch (e) { if (alive.current) { clearInterval(loginTimer.current); setMessage(e.message) } }
          finally { polling.current = false }
        }, 2000)
        return '请使用手机 B站扫码'
      }
      if (!st || !draft) return h('div', { 'data-bd-page': '' }, message || '正在读取刷 B站设置…')
      const s = st.cycle || {}
      const toggle = (key, label) => h('label', { key }, h('input', { type: 'checkbox', checked: !!(draft[key]??readingDefaults[key]), onChange: e => edit(key, e.target.checked) }), label)
      const num = (key,label,min=0) => { fieldLabels[key]=label;return h('label',{key},label,h('input',{type:'number',min,max:1000000,step:1,value:draft[key]??readingDefaults[key]??'',onChange:e=>edit(key,e.target.value),'aria-label':label})) }
      const petField = (key, label, rows = 2) => h('label', { key }, label, h('textarea', { rows, maxLength: key === 'petName' || key === 'ownerTitle' ? 100 : 4000, value: draft[key] || '', onChange: e => edit(key, e.target.value) }))
      const group = (key, title, note) => h('section', { key }, h('h3', null, title),
        toggle(key + 'Enabled', '启用' + title), h('div', { 'data-bd-note': '' }, note),
        num(key + 'Count', '每轮次数（0 = 无限）'), num(key + 'IntervalSec', '操作间隔（秒）', 1))
      return h('div', { 'data-bd-page': '' },
        h('div', { 'data-bd-status': '', role: 'status' },
          h('strong', null, phases[s.phase] || '未开始'),
          h('div', null, '第 ' + (s.round || 1) + ' 轮 · 视频 ' + (s.counts?.video || 0) + ' · 消息 ' + (s.counts?.messages || 0)),
          s.restUntil && s.running ? h('div', null, '下一轮：' + new Date(s.restUntil).toLocaleString()) : null,
          h('div', { 'data-bd-note': '' }, (st.loggedIn ? 'B站已登录' : '尚未登录 B站') + ' · ' + (st.venvReady ? '环境就绪' : '主依赖未就绪')),
          s.error ? h('div', { 'data-bd-error': '' }, s.error) : null),
        h('div', { 'data-bd-actions': '' },
          h('button', { disabled: !!busy, onClick: () => act('save', save) }, '保存设置'),
          h('button', { 'data-primary': '', disabled: !!busy || (s.running && !['resting', 'waiting', 'budget'].includes(s.phase)) || s.busy || !st.loggedIn, onClick: () => act('start', async () => { await save(); await request('/start', {}); return '已立即开始，旧休息已取消' }) }, s.restUntil ? '跳过休息 / 立即开始' : '开始 / 继续循环'),
          h('button', { disabled: !!busy || s.running || s.busy || !st.loggedIn, onClick: () => act('run', async () => { await save(); await request('/run', {}); return '开始运行一轮' }) }, '只跑一轮'),
          h('button', { disabled: !s.running && !s.busy, onClick: () => act('stop', async () => { await request('/stop', {}); return '已停止，进度已保留' }) }, '停止')),
        message ? h('div', { role: 'status', 'data-bd-note': '' }, message) : null,
        h('section', null, h('h3', null, '今日用量与连接'),
          h('div', null, '浏览 ' + (st.usage?.video || 0).toLocaleString() + ' · 回复 ' + (st.usage?.messages || 0).toLocaleString() + ' Token'),
          h('div', { 'data-bd-note': '' }, '接口实报 ' + (st.usage?.measured || 0).toLocaleString() + ' · 估算 ' + (st.usage?.estimated || 0).toLocaleString() + '。统计从本次升级开始；预算在任务之间检查，单次任务可能超额。'),
          st.health?.model ? h('div', { 'data-bd-error': !st.health.model.ok ? '' : undefined }, '模型：' + st.health.model.message) : h('div', null, '模型：等待本版首次任务实测'),
          st.loginHealth ? h('div', { 'data-bd-error': !st.loginHealth.ok ? '' : undefined }, 'B站：' + st.loginHealth.message) : null,
          st.health?.platform?.ok === false ? h('div', { 'data-bd-error': '' }, '最近任务异常：' + st.health.platform.message) : null,
          st.budget?.video ? h('div', null, '浏览预算已用完；消息按剩余额度继续。') : null,
          st.budget?.messages ? h('div', null, '今日总预算已用完，等待次日恢复。') : null),
        h('section', null, h('h3', null, '浏览口味（与人设分开保存）'),
          h('label',null,'口味预设',h('select',{value:draft.browsePreset||'custom',onChange:e=>{const id=e.target.value,p=browseOptions?.presets[id];setDraft(old=>({...old,browsePreset:id,...(p?{...p.config,keywords:p.keywords.join('\n')}: {})}))}},h('option',{value:'custom'},'自定义 / 保留现有设置'),...Object.entries(browseOptions?.presets||{}).map(([id,p])=>h('option',{key:id,value:id},p.name)))),
          h('div',{'data-bd-actions':''},...browseTypes.map(type=>h('label',{key:type},h('input',{type:'checkbox',checked:(draft.browseTypes||browseTypes).includes(type),onChange:e=>setDraft(old=>({...old,browsePreset:'custom',browseTypes:e.target.checked?[...(old.browseTypes||browseTypes),type]:(old.browseTypes||browseTypes).filter(v=>v!==type)}))}),type))),
          h('label',null,'筛选严格度',h('select',{value:draft.browseStrictness||'standard',onChange:e=>edit('browseStrictness',e.target.value)},...Object.entries({loose:'宽松：允许间接相关',standard:'标准：主体相关',strict:'严格：主体高度相关且有证据'}).map(([v,label])=>h('option',{key:v,value:v},label)))),
          num('browseExplorationPercent','探索比例（0—100%，默认0）'),
          h('label',null,'主题要求（独立于人设，可修改）',h('textarea',{rows:3,value:draft.browseTopic||'',onChange:e=>edit('browseTopic',e.target.value)})),
          num('browseDays','发布时间范围（天，0不限，最多365）'),
          h('label',null,'视频排序',h('select',{value:draft.browseOrder||'pubdate',onChange:e=>edit('browseOrder',e.target.value)},...Object.entries({pubdate:'最新发布',recent_hot:'近期热门：范围内按播放搜索，候选内兼顾互动和新鲜度',click:'热门优先',totalrank:'综合相关'}).map(([v,label])=>h('option',{key:v,value:v},label)))),
          num('browseFreshDays','近期热门：优先最近几天（0不优先，最多365）'),
          h('label',null,'UP范围',h('select',{value:draft.browseAuthorMode||'prefer',onChange:e=>edit('browseAuthorMode',e.target.value)},h('option',{value:'prefer'},'优先看这些UP'),h('option',{value:'only'},'只看这些UP'))),
          h('label',null,'优先 / 只看UP UID（一行一个数字UID）',h('textarea',{rows:2,value:draft.browsePreferredUids||'',onChange:e=>edit('browsePreferredUids',e.target.value)})),
          h('label',null,'屏蔽UP UID（一行一个）',h('textarea',{rows:2,value:draft.browseBlockedUids||'',onChange:e=>edit('browseBlockedUids',e.target.value)})),
          h('div',{'data-bd-note':''},'只在关键词结果里挑选，不自动关注。探索按视频稳定抽样，仅放宽不确定相关性，绝不绕过工作边界、类型及屏蔽项。无合适内容直接跳过。日志可按类型多看/少看/不看；下面可以撤销。'),
          ...(draft.browseFeedback||[]).flatMap(raw=>{try{const f=JSON.parse(raw);return [h('div',{key:f.key},f.type+' · '+({more:'多看',less:'少看',block:'不看'}[f.mode]),h('button',{onClick:()=>edit('browseFeedback',draft.browseFeedback.filter(v=>v!==raw))},'移除反馈（保存生效）'))]}catch{return []}}),
          h('label',null,'搜索关键词（一行一个；修改后为自定义口味）',h('textarea',{rows:4,value:draft.keywords,onChange:e=>setDraft(old=>({...old,keywords:e.target.value,browsePreset:'custom'}))})),
        ),
        group('video', '刷视频组', '搜索 / 浏览 → 理解内容 → 自主决定是否评论。'),
        group('messages', '消息互动组', '统一处理 @我的与评论回复，阅读上下文后自主决定是否回应。'),
        toggle('independentMessages', '消息独立轮询，视频休息时继续检查'),
        h('div', { 'data-bd-note': '' }, '持续循环开启独立轮询时，消息按自己的间隔处理，不受每轮次数限制；“只跑一轮”仍遵守两组次数。'),
        h('section', null, h('h3', null, '消息范围与阅读方式'),
          toggle('messagesNewOnly', '只处理启用后新增的消息'),
          toggle('messageVideoContext','回复中问到视频内容时，按需查看总结或字幕'),
          h('div',{'data-bd-note':''},'普通招呼不读视频；视频问题优先总结，缺失时字幕摘录最多2400字，无法获取就诚实说明。每条最多补读一次，不下载视频。'),
          h('div', { 'data-bd-note': '' }, '首次启用跳过已有通知；没有新消息不调用模型。不改变 B站已读状态。'),
          toggle('lightweight', '轻量阅读视频（推荐）'),
          num('videoReadChars','普通阅读字数（默认600，含时间点）'),
          num('videoFollowupChars','按需补读字数（默认1200）'),
          toggle('allowVideoFollowup','允许按需补读视频（每条最多一次）'),
          h('div', { 'data-bd-note': '' }, '优先 B站 AI 总结，没有时使用字幕摘录，最多 3 条短评。消息回复只读对应楼层和简介，不读整段字幕。')),
        h('section', null, h('h3', null, '循环与休息'),
          num('restMinutes', '每轮完成后休息（分钟）'), num('maxRounds', '运行轮数（0 = 无限）'),
          h('div', { 'data-bd-note': '' }, '休息0表示不休息；保存后立即调整当前休息。手动开始会取消旧休息。'),
          toggle('timeLimited', '限制每日运行时段'),
          draft.timeLimited ? h('label', null, '从', h('input', { type: 'time', value: draft.timeStart, onChange: e => edit('timeStart', e.target.value) }), '到', h('input', { type: 'time', value: draft.timeEnd, onChange: e => edit('timeEnd', e.target.value) })) : h('div', { 'data-bd-note': '' }, '全天运行；需要先点击开始。'),
          h('div', { 'data-bd-note': '' }, '次数按实际处理条目计算；没有新内容时结束该组本轮。相同起止时间表示全天。')),
        h('section', null, h('h3', null, '发言与冷却'),
          toggle('autoComment', '自动发送视频评论'), toggle('replyToComments', '自动发送评论和 @ 的回复'),
          h('div', { 'data-bd-note': '' }, '开启后，判断适合的正文直接发送，无需逐条确认；不适合的内容跳过。关闭才只保存草稿。'),
          num('cooldownSec', '两次公开发言至少间隔（秒）', 1),
          num('maxThreadReplies', '同楼层24小时内最多回复（0 = 不限）'), toggle('autoVerify', '发送后自动延迟只读复核'),
          h('div', { 'data-bd-note': '' }, '关闭发言时仍可理解内容、保存判断与草稿。')),
        h('section', null, h('h3', null, 'B站工作范围与表达上限'),
          h('div',{'data-bd-note':''},'性格、主人称呼、语气和表达示例已移到左侧“性格设置”，聊天与各平台共用。这里仅调整B站工作。'),
          h('label',null,'主人的B站账号（数字UID）',h('input',{type:'text',inputMode:'numeric',value:draft.ownerBiliUid||'',onChange:e=>edit('ownerBiliUid',e.target.value)})),
          toggle('mentionOwnerOnLikedVideo','看到喜欢的视频是否 @ 主人'),
          petField('petWorkScope','B站工作内容范围',3),
          h('p',{'data-bd-note':''},'回复字数在“性格设置 → 表达与通用设置”中修改。'),
          h('div',{'data-bd-note':''},'含标点、空格和换行。超限拦截，不截断、不追加模型调用。@主人的称呼也计入上限。')),
        h('section', null, h('h3', null, '宠物表情包'),
          toggle('memeEnabled', '允许自动附加表情'), toggle('memeBuiltinEnabled', '使用B站自带表情'), toggle('memeImagesEnabled', '使用本宠物图片表情'),
          num('memeChance', '适合使用时的发送概率（0—100%）'), num('memeMaxCount', '每条最多表情数量（1—3）', 1), num('memeCooldownSec', '两次使用表情至少间隔（秒）'),
          h('label', null, '本宠物图库ID', h('input', { type: 'text', value: draft.memePack || '', onChange: e => { edit('memePack', e.target.value); setMemeItems([]) } })),
          h('label', null, 'B站表情映射（一行：情绪|表情代码|含义和使用场景）', h('textarea', { rows: 8, maxLength:12000, value: draft.memeCodes || '', onChange: e => edit('memeCodes', e.target.value) })),
          h('label', null, '导入分类', h('input', { type: 'text', value: memeEmotion, onChange: e => setMemeEmotion(e.target.value), placeholder: '开心、喜欢、思考等' })),
          h('label', null, '导入图片到当前宠物图库', h('input', { type: 'file', accept: '.png,.jpg,.jpeg,.gif,.webp', disabled: !!busy, onChange: e => {
            const file = e.target.files?.[0]; e.target.value = ''; if (!file) return
            act('meme-import', async () => {
              if (file.size > 5 * 1024 * 1024) throw new Error('图片最多5MB')
              await save()
              const encoded = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(new Error('图片读取失败')); reader.readAsDataURL(file) })
              await request('/memes/import', { emotion: memeEmotion, name: file.name, data: encoded })
              const result = await request('/memes'); setMemeItems(result.items || [])
              return '图片已导入本地图库；合适时可随评论发送'
            })
          } })),
          h('button', { disabled: !!busy, onClick: () => act('memes', async () => { await save(); const result = await request('/memes'); setMemeItems(result.items || []); return '图库：' + result.pack + '，共' + (result.items || []).length + '个可用表情' }) }, '保存并查看本宠物表情'),
          h('div', { 'data-bd-note': '' }, '默认30%概率、每条1个、冷却300秒。模型顺便选择表情，不增加一次模型调用。图片本地导入，发送时上传B站；动图只用首帧。图片能力仍受B站账号及评论区限制，失败不自动重发。自带表情以账号实际权限为准。'),
          ...memeItems.map(m => h('div', { key: m.id, 'data-bd-note': '' }, (m.kind === 'image' ? '图片' : '自带表情') + ' · ' + m.emotion + ' · ' + m.name + (m.usage ? '：' + m.usage : ''))),
          h('div', { 'data-bd-note': '' }, '图片目录：' + st.home + '/memes/' + (draft.memePack || '') + '/情绪分类/。以后不同宠物可指定不同图库ID。')),
        h('section',null,h('h3',null,'其他内容设定'),

          h('div', { 'data-bd-note': '' }, '关键词轮换搜索；实际发言范围以宠物档案为准，搜索命中不代表一定可评论。'),
          h('label', null, '排除词（一行一个，匹配标题/简介/UP主）', h('textarea', { rows: 2, value: draft.excludedWords || '', onChange: e => edit('excludedWords', e.target.value) })),
          h('label', null, '兼容旧版：优先UP昵称（一行一个；仅排序）', h('textarea', { rows: 2, value: draft.preferredAuthors || '', onChange: e => edit('preferredAuthors', e.target.value) })),
          h('div', { 'data-bd-note': '' }, '仅在关键词搜索结果内优先排序，不自动关注。权重0停用对应类别，1为普通，最高10。'),
          num('aiWeight', 'AI关键词权重'), num('llmWeight', '大模型关键词权重'), num('animeWeight', '二次元关键词权重'), num('animationWeight', '动画关键词权重'),
          h('label', null, '报告', h('select', { value: draft.reportLevel || 'full', onChange: e => edit('reportLevel', e.target.value) },
            h('option', { value: 'full' }, '保存内容理解与结果'), h('option', { value: 'brief' }, '简短报告'), h('option', { value: 'off' }, '关闭报告')))),
        h('details', null, h('summary', null, '预算、缓存与文件保留'),
          num('dailyTokenBudget', '每日总Token预算（0 = 不限）'), num('replyReserveTokens', '为消息保留Token额度'),
          num('cacheMinutes', '视频资料缓存分钟（0 = 关闭）'), num('retentionDays', '任务临时文件保留天数', 1),
          h('div', { 'data-bd-note': '' }, '预算按北京时间每天重置，不增加第二次模型审稿。只清理本插件生成且过期的任务文件；发送去重账本长期保留。')),
        h('section', null, h('h3', null, '账号与环境'),
          h('div', { 'data-bd-actions': '' },
            h('button', { disabled: !!busy, onClick: () => act('login', async()=>{setAccountMessage('正在生成二维码…');const r=await login();setAccountMessage(r);return r}) }, '扫码登录'),
            h('button', { disabled: !!busy, onClick: () => act('check', async () => { setAccountMessage('正在检查登录与搜索，请稍候…');try{const r = await request('/check', {});const msg=(r.steps||[]).join('；')||'登录与搜索检查通过';setAccountMessage(msg);return msg}catch(e){setAccountMessage(e.name==='TimeoutError'?'检查超时，请检查网络或稍后重试':e.message);throw e} }) }, busy==='check'?'正在检查…':'检查B站登录与搜索'),
            h('button',{disabled:!!busy||!st.loggedIn,onClick:()=>setLogoutConfirm(true)},'退出登录'),
            !st.venvReady ? h('button', { disabled: !!busy, onClick: () => act('install', async () => { const r = await request('/install', {}); return r.hint || '依赖安装已开始' }) }, '安装主依赖') : null),
          logoutConfirm?h('div',{'data-bd-status':''},'退出当前B站账号并停止后台浏览？',h('div',{'data-bd-actions':''},h('button',{disabled:!!busy,onClick:()=>setLogoutConfirm(false)},'取消'),h('button',{disabled:!!busy,onClick:()=>act('logout',async()=>{setAccountMessage('正在退出…');try{const r=await request('/logout',{});clearInterval(loginTimer.current);setQr(null);setLogoutConfirm(false);setSt(old=>({...old,loggedIn:false}));setAccountMessage(r.message);return r.message}catch(e){setAccountMessage(e.message);throw e}})},busy==='logout'?'正在退出…':'确认退出'))):null,
          accountMessage?h('div',{role:'status','aria-live':'polite','data-bd-status':'',style:{whiteSpace:'pre-wrap'}},accountMessage):null,
          qr ? h('img', { 'data-bd-qr': '', src: qr, alt: 'B站登录二维码' }) : null,
          st.installing ? h('pre', null, st.installTail || '正在安装…') : null),
        h('details', null, h('summary', null, '报告与路径'),
          h('p', { 'data-bd-note': '' }, st.home),
          h('button', { onClick: () => act('report', async () => { const r = await request('/report'); setReport(r.text || '今天尚无报告'); return '' }) }, '查看今日报告'),
          report !== null ? h('pre', null, report) : null),
        h('button', { disabled: !!busy, onClick: () => act('verify', async () => { const r = await request('/verify', {}); return r.text || '复核完成' }) }, '只读复核最近评论'))
    }
    /* PET SHELL START */
    function ExpressionSettings({petId}) {
      const [values,setValues]=React.useState(null),[busy,setBusy]=React.useState(''),[message,setMessage]=React.useState('')
      React.useEffect(()=>{let active=true;Promise.all([request('/status'),request('/xhs/status'),request('/qq/status')]).then(([b,x,q])=>{if(active)setValues({bili:{maxCommentChars:b.config.maxCommentChars,maxReplyChars:b.config.maxReplyChars,workspace:b.config.workspace||''},xhs:{maxCommentChars:x.config.maxCommentChars,maxReplyChars:x.config.maxReplyChars},qq:{minChars:q.config.minChars??10,maxChars:q.config.maxChars}})}).catch(e=>{if(active)setMessage(e.message)});return()=>{active=false}},[petId])
      const edit=(platform,key,value)=>setValues(v=>({...v,[platform]:{...v[platform],[key]:value}}))
      const save=async platform=>{setBusy(platform);setMessage('');try{
        const patch=values[platform];for(const [key,value] of Object.entries(patch))if(key!=='workspace'&&(!Number.isInteger(Number(value))||Number(value)<(key==='minChars'?0:platform==='qq'?10:1)||Number(value)>1000))throw Error('字数请填写'+(platform==='qq'?'10':'1')+'到1000之间的整数')
        const current=await request('/pets');if(current.activeId!==petId)throw Error('宠物已切换，请重新打开性格设置')
        if(platform==='bili')await request('/config',{petId,...patch})
        else if(platform==='xhs')await request('/xhs/config',{petId,config:patch})
        else {const q=await request('/qq/status');await request('/qq/config',{petId,config:{...q.config,...patch}})}
        setMessage(({bili:'B站',xhs:'小红书',qq:'QQ'}[platform])+'表达设置已保存'+(platform==='qq'?'；现有监听继续生效':''))
      }catch(e){setMessage(e.message)}finally{setBusy('')}}
      return h('section',null,h('h3',null,'表达与通用设置'),h('p',{'data-bd-note':''},'性格按所选场景分别保存。下面集中调整各平台字数；各平台分别保存，避免把群聊限制误用到视频评论。'),!values?h('p',null,message||'正在读取…'):h(React.Fragment,null,...Object.entries({bili:'B站',xhs:'小红书',qq:'QQ聊天'}).map(([platform,title])=>h('fieldset',{key:platform,style:{border:'1px solid #e0e3d9',borderRadius:12,padding:16,margin:'14px 0'}},h('legend',null,title),...Object.keys(values[platform]).filter(key=>key!=='workspace').map(key=>h('label',{key},key==='minChars'?'回复期望最少字数（0不设下限）':key==='maxCommentChars'?'主动评论最多字数':'回复最多字数',h('input',{type:'number',min:key==='minChars'?0:platform==='qq'?10:1,max:1000,step:1,value:values[platform][key],onChange:e=>edit(platform,key,e.target.value)}))),platform==='bili'?h('details',null,h('summary',null,'补充资料（一般不用填）'),h('label',null,'本地补充人设文件夹',h('input',{value:values.bili.workspace,onChange:e=>edit('bili','workspace',e.target.value)})),h('p',{'data-bd-note':''},'兼容已有本地资料，不覆盖性格和安全规则。')):null,h('button',{disabled:!!busy,onClick:()=>save(platform)},busy===platform?'保存中…':'保存'+title+'表达设置'))),message?h('p',{role:'status'},message):null))
    }

    function QqPanel({petId,petName,view,onPersonality}) {
      const [st,setSt]=React.useState(null),[draft,setDraft]=React.useState(null),[rooms,setRooms]=React.useState([]),[closedRooms,setClosedRooms]=React.useState([]),[windowGroup,setWindowGroup]=React.useState(''),[windowId,setWindowId]=React.useState(''),[windowSelf,setWindowSelf]=React.useState('')
      const pageKey='cyber-pet:qq-page:'+petId
      const [page,setPage]=React.useState(()=>{if(view)return view;try{const saved=sessionStorage.getItem(pageKey);return ['connection','settings','chats','guide','personality'].includes(saved)?saved:'auto'}catch{return 'auto'}}),[items,setItems]=React.useState([]),[busy,setBusy]=React.useState(false),[message,setMessage]=React.useState(''),[helpOpen,setHelpOpen]=React.useState('')
      const loginState=React.useRef(null)
      React.useEffect(()=>{if(!view&&['connection','settings','chats','guide','personality'].includes(page))try{sessionStorage.setItem(pageKey,page)}catch{}},[petId,page,view])
      React.useEffect(()=>{
        let active=true,loading=false
        const refresh=async()=>{if(loading)return;loading=true;try{
          const v=await request('/qq/status');if(active){const firstLogin=loginState.current!==true;setSt(v);if(v.service?.binding&&!loginState.current){setWindowGroup(v.service.binding.group);setWindowId(v.service.binding.groupId);setWindowSelf(v.service.binding.selfName)}setDraft(old=>old||{...v.config,minChars:v.config.minChars??10,maxChars:v.config.maxChars??120,qqKaomojiEnabled:v.config.qqKaomojiEnabled!==false,proactive:v.config.proactive===true,proactiveIntervalSeconds:v.config.proactiveIntervalSeconds??300,proactiveMessages:v.config.proactiveMessages??20,periodicScan:v.config.periodicScan!==false,scanIntervalSeconds:v.config.scanIntervalSeconds??10,scanKeywords:v.config.scanKeywords||'',replyOnRelated:v.config.replyOnRelated!==false,followupSeconds:v.config.followupSeconds??600,rememberContext:v.config.rememberContext!==false&&v.config.contextMessages>0});setPage(old=>old==='auto'?(v.service?.loggedIn?(v.config.groups.length?'chats':'settings'):'connection'):!view&&v.service?.loggedIn&&firstLogin&&old==='connection'?'settings':old);loginState.current=!!v.service?.loggedIn}
          if(page==='logs'){const l=await request('/qq/logs');if(active)setItems(l.items||[])}
          if(['logs','chats'].includes(page)){const r=await request('/qq/conversations');if(active)setRooms(r.rooms||[])}
        }catch(e){if(active)setMessage(e.message)}finally{loading=false}}
        refresh();const timer=setInterval(refresh,2500);return()=>{active=false;clearInterval(timer)}
      },[petId,page])
      if(!st||!draft)return h('p',{role:'status'},message||'正在读取QQ群设置…')
      const update=(k,v)=>setDraft(old=>({...old,[k]:v}))
      const act=async kind=>{setBusy(true);setMessage('');try{

        if(['config','start'].includes(kind)){const v=await request('/qq/config',{petId,config:draft});setDraft(v.config);setSt(old=>({...old,...v}))}
        if(kind==='config')setMessage(st.running?'设置已保存，继续监听新消息。':'设置已保存。点击开始监听后生效。')
        else {const v=await request('/qq/'+kind,{petId});if(v.service)setSt(old=>({...old,service:v.service}));else setSt(v);setMessage(kind.startsWith('service/')?'已提交操作，请看页面中的QQ状态。':kind==='check'?'连接成功，已识别QQ账号。':kind==='start'?(v.config.autoReply?'已开始监听，满足触发规则时自动回复。':'已开始监听；自动回复关闭，不调用模型。'):'已停止QQ群监听与回复。')}
      }catch(e){setMessage(e.message)}finally{setBusy(false)}}
      const bindWindow=async()=>{setBusy(true);setMessage('');try{const v=await request('/qq/service/window-bind',{petId,group:windowGroup,groupId:windowId,selfName:windowSelf});setSt(old=>({...old,service:v.service,running:false,state:'disconnected',identity:null}));setDraft(old=>({...old,groups:[windowId]}));setMessage('已只读绑定当前群；开始前的旧消息不会回复。')}catch(e){setMessage(e.message)}finally{setBusy(false)}}
      const button=(kind,label)=>h('button',{type:'button',disabled:busy,onClick:()=>act(kind)},label)
      const toggle=(k,label)=>h('label',{className:'pet-qq-check'},h('input',{type:'checkbox',checked:draft[k],onChange:e=>update(k,e.target.checked)}),label)
      const help=(text)=>h('span',{className:'pet-help'},h('button',{type:'button','aria-label':'查看说明：'+text,'aria-expanded':helpOpen===text,onClick:()=>setHelpOpen(old=>old===text?'':text)},'?'),helpOpen===text?h('span',{className:'pet-help-pop',role:'note'},text):null)
      const explanations={proactiveIntervalSeconds:'每隔多少秒查看一次所选群的新聊天，默认300秒（5分钟）。有新消息且适合参与才说话，不需要@或关键词；没有新消息不重复调用模型。',proactiveMessages:'每次查看本群最近多少条消息，包含最新消息和它前面的对话。最多1000条，越多越费Token。只查看开始监听后收到的新消息，不回翻启动前的旧聊天。',scanIntervalSeconds:'每隔多少秒批量检查最近的新群消息有没有关键词，默认10秒。@和唤醒词实时处理，不必等待。检查本身不调用模型；只有命中关键词或符合接话条件才调用，重复消息不会重复回复。',followupSeconds:'宠物被叫名字、被@或回复成功后，这个群的话题在多少秒内保持活跃。默认600秒（10分钟），期间其他人也能加入，模型判断与自己有关才接话。0关闭自动接话；窗口检查仍继续。',contextMessages:'每次回复最多带上这个群最近的几条消息和宠物的回复，帮助它接着上文说话。数值越大通常越费Token；0表示不带历史。只携带本群记录。',cooldownSeconds:'同一个群里，宠物两次发话至少间隔多少秒。比如20表示刚回复后20秒内不再回复，避免刷屏；0表示不等待。',dailyTokenBudget:'这只宠物的QQ群聊天每天最多使用多少Token，0表示不限。按北京时间每天重置；不足时跳过新回复，提高预算并保存后可继续处理新消息，不补发以前跳过的话。'}
      const input=(k,label,type='text',min,max)=>h('label',null,label,explanations[k]?help(explanations[k]):null,h('input',{type,value:draft[k],min,max,onChange:e=>{const value=type==='number'?Number(e.target.value):e.target.value;if(k==='contextMessages')setDraft(old=>({...old,contextMessages:value,rememberContext:value>0}));else update(k,value)}}))
      const box=(title,...children)=>h('fieldset',{className:'pet-qq-section'},h('legend',null,title),...children)
      const states={received:'收到触发',skipped:'已跳过',pending:'发送中/结果待确认',sent:'窗口已出现回复',unknown:'发送结果未知',error:'调用失败',cancelled:'任务已取消'}
      return h(React.Fragment,null,
        h('div',{className:'pet-qq-notice',role:'status'},petName+' · '+(st.identity?(st.service?.engine==='window'?'窗口会话 · '+st.identity.name:'QQ '+st.identity.name+'（'+st.identity.id+'）'):st.service?.loggedIn?(st.service?.engine==='window'?'单群已绑定：'+st.service.binding?.group:'QQ已登录，等待选群'):'窗口尚未就绪')+' · '+({connected:'已连接',connecting:'连接中',disconnected:'未连接'}[st.state]||st.state),h('br'),h('div',null,st.running&&st.capture?st.capture.reason:st.service?.message),st.running&&st.capture?.at?h('div',null,'最近成功读取：'+new Date(st.capture.at).toLocaleTimeString()+' · 当前可读 '+(st.capture.count??0)+' 条（能读取旧文字不代表新消息正在刷新）'):null,h('br'),(st.running?'监听中':'监听已停止')+' · 今日约 '+st.tokensToday+' / '+(st.config.dailyTokenBudget===0?'不限':st.config.dailyTokenBudget)+' Token'+(st.busy?' · 正在回复':''),h('div',{className:'pet-token-warning'},'Token提醒：监听和查看本地对话不调用模型；自动回复、关键词命中、主动说话会消耗Token。上下文越长，消耗通常越高。'),h('div',null,st.lastEventAt?'最近收到群消息：'+new Date(st.lastEventAt).toLocaleTimeString():'尚未收到选中群的新消息'),st.lastProactiveAt?h('div',null,'最近主动查看：'+new Date(st.lastProactiveAt).toLocaleTimeString()):null,st.lastScanAt?h('div',null,'最近检查关键词：'+new Date(st.lastScanAt).toLocaleTimeString()):null,st.scanError?h('div',null,st.scanError):null,...Object.entries(st.groupErrors||{}).map(([group,reason])=>h('div',{key:group},'群 '+group+'：'+reason)),st.error?h('div',null,st.error):null,st.budgetBlocked?h('div',null,'今日预算不足，仍在监听。提高预算并保存后会处理新消息。'):null),
        h('p',{className:'pet-form-note'},petName+' · QQ群聊有独立性格。',h('button',{onClick:()=>setPage('personality')},'修改群聊性格 →')),
        h('div',{className:'pet-qq-tabs',role:'tablist','aria-label':'QQ群功能'},...Object.entries(view==='logs'?{logs:'QQ聊天日志'}:{connection:'① 绑定QQ群',settings:'② 聊天设置',chats:'本群对话',personality:'群聊性格',guide:'怎么用'}).map(([key,label])=>h('button',{key,role:'tab','aria-selected':page===key,onClick:()=>{setPage(key);setMessage('')}},label))),
        message?h('div',{className:'pet-qq-notice',role:'status'},message):null,
        page==='connection'?h('div',{className:'pet-form pet-qq-form'},
          h('h3',null,'绑定一个QQ群'),box('官方QQ窗口',h('p',{className:'pet-form-note'},'在官方QQ登录，打开目标群。支持独立聊天窗口或效率模式。'),h('label',null,'完整群名',h('input',{value:windowGroup,onChange:e=>setWindowGroup(e.target.value)})),h('label',null,'群号',h('input',{value:windowId,onChange:e=>setWindowId(e.target.value)})),h('label',null,'自己在本群的昵称',h('input',{value:windowSelf,onChange:e=>setWindowSelf(e.target.value)})),h('button',{disabled:busy,onClick:bindWindow},'检测并绑定当前群'),h('p',{role:'status'},st.service?.message),h('p',{className:'pet-form-note'},'绑定后去聊天设置开启自动发言并开始监听。后台只读QQ已刷新文字；若新消息不更新，请使用后台兼容启动；最小化、切群或有草稿时暂停。只发送文字。发送时QQ会短暂切到前台，请勿同时手动输入。')),h('div',{className:'pet-qq-actions'},button('service/check','检查窗口'),button('service/background-launch','退出QQ后，后台兼容启动'),h('button',{onClick:()=>setPage('settings')},'下一步：聊天设置 →'))):null,
        page==='settings'?h('div',{className:'pet-form pet-qq-form'},h('div',{className:'pet-qq-notice',role:'status'},st.service?.loggedIn?(st.service?.engine==='window'?'已绑定 '+st.service.binding?.group+'。若QQ在后台不更新消息，先完全退出QQ，再到绑定页使用“后台兼容启动”；别最小化。':'QQ已登录，可以选群并开始聊天。'):st.service?.message||'请检查登录状态。'),h('p',null,'当前仅绑定一个群：'+(st.service?.binding?.group||'尚未绑定')),
          box('总开关',toggle('autoReply','允许宠物自动发言'),h('p',{className:'pet-form-note'},'下面的回复、关键词和主动说话共用这个总开关。')),
          box('实时回复与持续接话',toggle('replyOnAt','被 @ 时回应'),toggle('replyOnName','被喊名字 / 唤醒词时回应'),
            h('label',null,'唤醒词（每行一个；留空使用宠物名字和别名）',h('textarea',{rows:2,value:draft.wakeWords,onChange:e=>update('wakeWords',e.target.value)})),
            toggle('replyOnRelated','与自己有关时自动接话（无需每句@）'),input('followupSeconds','话题持续接话时间（秒，0关闭）','number',0,86400),h('p',{className:'pet-form-note'},'需要开启下面的上下文记忆。窗口模式仅发送文字，不自动@对方。')),
          box('定时关键词检查',toggle('periodicScan','开启关键词检查'),input('scanIntervalSeconds','检查间隔（秒）','number',1,3600),
            h('label',null,'感兴趣的关键词（每行一个）',h('textarea',{rows:3,value:draft.scanKeywords||'',onChange:e=>update('scanKeywords',e.target.value)})),h('p',{className:'pet-form-note'},'命中关键词才交给模型判断，不需要@。')),
          box('主动说话',toggle('proactive','定时看看群聊，主动参与话题'),input('proactiveIntervalSeconds','主动查看间隔（秒）','number',10,86400),input('proactiveMessages','每次查看最近多少条群消息','number',1,1000),h('p',{className:'pet-form-note'},'无需@或关键词。有新聊天才判断，合适就发言，不适合就安静。此功能会使用Token，默认关闭。')),
          box('上下文记忆',h('label',{className:'pet-qq-check'},h('input',{type:'checkbox',checked:draft.rememberContext!==false&&draft.contextMessages>0,onChange:e=>setDraft(old=>({...old,rememberContext:e.target.checked,contextMessages:e.target.checked?(old.contextMessages||6):0}))}),'记住上下文（本群独立记忆）'),input('contextMessages','实时回复携带最近多少条（0关闭）','number',0,1000),h('p',{className:'pet-form-note'},'只使用本群记录。主动查看条数在上面的“主动说话”里单独设置。')),
          box('回复长度与颜文字',h('label',null,'字数范围预设',h('select',{value:['10:40','30:80','80:150'].includes(draft.minChars+':'+draft.maxChars)?draft.minChars+':'+draft.maxChars:'custom',onChange:e=>{if(e.target.value!=='custom'){const [minChars,maxChars]=e.target.value.split(':').map(Number);setDraft(old=>({...old,minChars,maxChars}))}}},h('option',{value:'10:40'},'短句 · 10—40字'),h('option',{value:'30:80'},'普通 · 30—80字'),h('option',{value:'80:150'},'详细 · 80—150字'),h('option',{value:'custom'},'自定义'))),input('minChars','期望最少字数（0不设下限）','number',0,1000),input('maxChars','最多字数（含颜文字）','number',10,1000),toggle('qqKaomojiEnabled','允许使用颜文字'),h('p',{className:'pet-form-note'},'开启后告诉宠物可以按语境适量使用颜文字，由它自然选择，不限定样式。颜文字、标点和空格都计入总字数上限。下限是目标，简短问候不硬凑字。设置按宠物保存，不额外调用一次模型。')),
          box('共同限制与身份',h('label',null,'QQ群聊天范围',h('textarea',{rows:3,value:draft.workScope,onChange:e=>update('workScope',e.target.value)})),input('cooldownSeconds','同群发言冷却（秒，0不等待）','number',0,3600),input('dailyTokenBudget','每日QQ Token预算（0不限）','number',0),h('p',{className:'pet-form-note'},'所有发言方式共用冷却、预算与安全边界。性格在“群聊性格”中调整，回复长度在本页设置。')),
          h('div',{className:'pet-qq-actions pet-qq-savebar'},button('config','保存设置'),button('start','保存并开始监听'),button('stop','停止监听')),
          h('p',{className:'pet-form-note'},'只处理绑定群的新消息，不处理私聊、不自动加群。切换宠物或重启后需手动开始。')):null,
        ['chats','logs'].includes(page)?h('section',null,h('p',{className:'pet-form-note'},'仅显示当前绑定群的本地记录，查看页面不消耗Token；对话展示与模型记忆开关分开。'),
          !rooms.length?h('p',null,'先绑定一个群，再开始监听。'):null,
          h('div',{className:'pet-qq-room-grid'},...rooms.map(room=>h('article',{key:room.group,className:'pet-qq-room'},
            h('header',null,h('div',null,h('strong',null,room.name),h('small',null,'群号 '+room.group+' · '+(!st.running?'监听已停止':room.busy?'正在回复':room.queued?'排队 '+room.queued+' 条':'等待新消息'))),h('button',{type:'button','aria-expanded':!closedRooms.includes(room.group),onClick:()=>setClosedRooms(old=>old.includes(room.group)?old.filter(g=>g!==room.group):[...old,room.group])},closedRooms.includes(room.group)?'展开':'收起')),
            room.error?h('p',{role:'status'},room.error):null,
            closedRooms.includes(room.group)?null:h(React.Fragment,null,
              h('div',{className:'pet-qq-room-messages','aria-label':room.name+'独立对话'},...room.messages.slice().reverse().map((m,i)=>h('div',{key:m.direction+':'+m.messageId+':'+i,className:'pet-qq-bubble '+(m.direction==='sent'?'pet-qq-own':'')},h('small',null,(m.direction==='sent'?petName:m.name||m.user)+(m.at?' · '+new Date(m.at).toLocaleTimeString():'')),h('p',null,m.text))),!room.messages.length?h('p',{className:'pet-form-note'},'还没有收到这个群的新消息。'):null),
              page==='logs'?h('details',{className:'pet-qq-room-operations'},h('summary',null,'查看本群处理日志'),...items.filter(row=>row.group===room.group).map((row,i)=>h('details',{className:'pet-qq-log',key:i},h('summary',null,(states[row.state]||row.state)+' · '+(row.name||'')),h('small',null,typeof row.at==='number'?new Date(row.at).toLocaleString():'历史记录'),h('p',null,'收到：'+(row.request||row.text)),row.request?h('p',null,'回复：'+(row.display||row.text)):null,h('p',null,row.reason||''),row.tokens?h('small',null,(row.estimated?'估算 ':'实际 ')+row.tokens+' Token'):null))):null
            ))))):null,
        page==='personality'?h(PersonalityPanel,{petId,defaultChannel:'qq',compact:true}):null,
        page==='guide'?h('div',{className:'pet-form-note'},h('h3',null,'三步开始'),h('ol',{className:'pet-guide-steps'},h('li',null,'打开官方QQ并登录，打开想聊天的群，别最小化。'),h('li',null,'点“① 绑定QQ群”，填完整群名、群号、自己在本群的昵称，点绑定。'),h('li',null,'点“② 聊天设置”，打开自动发言、设置唤醒词，点“保存并开始监听”。')),h('p',null,'开始前的旧消息不会回复。群友喊宠物名字、@你的群昵称或命中关键词时才触发。主动说话需单独开启。被遮挡仍可读取；最小化、切群、禁言或草稿会暂停。QQ重启后点开始会重新绑定。停止监听不会关闭QQ。')):null)
    }

    const PET_CSS = `
.pet-help{position:relative;display:inline-block;vertical-align:middle;margin-left:8px}.pet-help>button{border:1px solid #9ca99a!important;border-radius:50%!important;width:19px;height:19px;padding:0!important;font-size:12px!important;color:#547153!important;background:#fff!important}.pet-help-pop{display:block;position:absolute;z-index:8;left:0;top:25px;width:min(300px,65vw);padding:12px 14px;border:1px solid #d2dbcd;border-radius:10px;background:#fff;box-shadow:0 6px 24px #263a2420;color:#455442;font-size:12px;line-height:1.8;white-space:normal}.pet-qq-savebar{position:sticky;bottom:-30px;background:#faf9f6;padding:14px 0;z-index:3;border-top:1px solid #e2e6dd}
.pet-nav-group{border:1px solid #dddcd3;border-radius:15px;padding:7px;margin-bottom:8px;background:#f8f7f3}.pet-nav-group .pet-nav-item{width:100%;margin:0}.pet-nav-group-title{display:block;color:#92988c;font-size:11px;padding:5px 16px 6px}.pet-nav{overflow:auto}.pet-nav-group .pet-nav-item span:first-child{font-size:15px}.pet-guide-steps li{margin:12px 0;line-height:1.9}
[data-pet-shell]{height:100%;min-height:0;display:grid;grid-template-columns:224px minmax(0,1fr);background:#faf9f6;color:#292d31;font-family:Inter,"Microsoft YaHei",sans-serif;font-size:14px;position:relative}
[data-windows-titlebar] [data-pet-shell]{padding-top:var(--dsh-windows-titlebar-height,36px)}
[data-pet-shell] *{box-sizing:border-box} [data-pet-shell] button,[data-pet-shell] textarea,[data-pet-shell] input{font:inherit}
[data-pet-shell] button{cursor:pointer;color:inherit;border:0;background:none} [data-pet-shell] button:disabled{opacity:.45;cursor:default}
.pet-token-warning{margin-top:8px;color:#89652c;font-size:12px;line-height:1.7}.pet-qq-room-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(340px,100%),1fr));gap:18px;margin-top:20px}.pet-qq-room{border:1px solid #d4ddcf;border-radius:14px;background:#fafbf8;overflow:hidden;min-width:0}.pet-qq-room>header{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:15px;border-bottom:1px solid #e1e7dd}.pet-qq-room header small{display:block;margin-top:5px;color:#83907e}.pet-qq-room header button{padding:6px 10px;border:1px solid #d4ddcf;border-radius:8px}.pet-qq-room-messages{height:420px;overflow:auto;display:flex;flex-direction:column-reverse;padding:14px;gap:12px}.pet-qq-bubble{flex-shrink:0;align-self:flex-start;max-width:90%;background:#fff;border:1px solid #e1e7dd;border-radius:12px;padding:10px 12px;overflow-wrap:anywhere}.pet-qq-bubble small{font-size:11px;color:#7b8776}.pet-qq-bubble p{white-space:pre-wrap;margin:5px 0 0;font-size:13px;line-height:1.8}.pet-qq-own{align-self:flex-end;background:#e6efe1}.pet-qq-room-operations{padding:12px}.pet-qq-face-editor{max-height:440px;overflow:auto}.pet-qq-face-row{border-bottom:1px solid #e5e9e1;padding:10px 0}.pet-qq-section{min-width:0;margin:20px 0;padding:18px 20px;border:1px solid #d4ddcf;border-radius:14px;background:#fff}.pet-qq-section legend{padding:0 10px;font-weight:600;font-size:15px;color:#405b3c}.pet-qq-section>label{display:block;margin:14px 0}.pet-qq-tabs{display:flex;gap:7px;margin:18px 0;flex-wrap:wrap}.pet-qq-tabs button{padding:9px 13px;border:1px solid #dfe3d9!important;border-radius:10px}.pet-qq-tabs button[aria-selected=true]{background:#dfe9dc;color:#375b3d}.pet-qq-notice{font-size:12px;color:#6f7c6b;line-height:1.8;padding:12px 14px;border:1px solid #e2e6dd;border-radius:12px;background:#f0f4ec}.pet-qq-actions{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0}.pet-qq-actions button{border:1px solid #d4dccf!important;border-radius:10px;padding:10px 14px;background:#fff}.pet-qq-check{display:flex!important;align-items:center;gap:9px!important;margin:13px 0!important}.pet-qq-check input{width:auto!important;margin:0!important}.pet-qq-groups{max-height:210px;overflow:auto;border:1px solid #e2e5dc;border-radius:10px;padding:8px 12px}.pet-qq-log{background:#fff;border:1px solid #e2e5dc;border-radius:12px;margin:12px 0;padding:13px;overflow-wrap:anywhere}.pet-qq-log summary{cursor:pointer;font-size:13px}.pet-qq-log p{white-space:pre-wrap;line-height:1.8;font-size:13px}.pet-qq-log small{color:#899282}.pet-qq-form input:focus,.pet-qq-form textarea:focus{outline:2px solid #8ca582;outline-offset:2px}
.pet-nav{background:#f0eeea;border-right:1px solid #e4e1dc;padding:30px 16px;display:flex;flex-direction:column;gap:8px}
.pet-brand{font-size:12px;font-weight:700;letter-spacing:2px;color:#77776f;margin:0 12px 24px}
.pet-select{display:flex;align-items:center;text-align:left;gap:12px;width:100%;padding:14px!important;background:#fff!important;border:1px solid #e3e0db!important;border-radius:16px!important;margin-bottom:30px;box-shadow:0 3px 12px #302e2410}
.pet-avatar{display:grid;place-items:center;width:42px;height:42px;flex-shrink:0;border-radius:15px;background:#e4e0f0;color:#68538b;font-size:20px;font-weight:650}
.pet-select small,.pet-nav-foot{display:block;color:#888a87;font-size:11px;margin-top:5px}
.pet-nav-item{display:flex;align-items:center;gap:12px;text-align:left;padding:13px 16px!important;border-radius:12px!important;font-weight:500;margin:2px 0}
.pet-nav-item span:first-child{font-size:18px;width:22px;color:#828980}.pet-nav-item[aria-current=page]{background:#e1e9e2!important;color:#294c3b}.pet-nav-item:hover{background:#e8e6e1}
.pet-nav-foot{margin:auto 12px 0;line-height:1.9}.pet-main{min-width:0;min-height:0;display:flex;flex-direction:column;overflow:hidden}
.pet-header{height:86px;flex-shrink:0;border-bottom:1px solid #e8e5df;padding:22px 38px;display:flex;align-items:center;justify-content:space-between;background:#faf9f6}
.pet-header h1{font-size:20px;margin:0 0 4px;font-weight:650}.pet-header p{font-size:12px;color:#8c908c;margin:0}.pet-status{font-size:12px;border:1px solid #e1e4dd;border-radius:22px;padding:7px 12px;color:#63806c;background:#eef3ec}
.pet-error{margin:10px 26px;color:#a24f42;background:#fcf0ea;border-radius:10px;padding:10px 15px;font-size:12px}
.pet-chat{flex:1;min-height:0;overflow:auto;padding:30px max(26px,calc((100% - 820px)/2));scroll-behavior:smooth}.pet-message{display:flex;gap:12px;margin:0 0 24px;align-items:flex-start}
.pet-message[data-role=user]{flex-direction:row-reverse}.pet-message .pet-avatar{width:34px;height:34px;font-size:15px;border-radius:12px}.pet-bubble{max-width:78%;padding:15px 18px;border-radius:4px 17px 17px 17px;line-height:1.85;background:white;border:1px solid #e9e6e0;white-space:pre-wrap;overflow-wrap:anywhere}.pet-message[data-role=user] .pet-bubble{border-radius:17px 4px 17px 17px;background:#e6ece5;border-color:#dfe7dc}.pet-message[data-role=error] .pet-bubble{color:#a24f42}.pet-message small{display:block;font-size:11px;color:#9a9d98;margin-top:8px}
.pet-welcome{max-width:550px;text-align:center;margin:10vh auto 40px}.pet-welcome .pet-avatar{margin:0 auto 20px;width:74px;height:74px;border-radius:27px;font-size:31px}.pet-welcome h2{font-size:25px;font-weight:600}.pet-welcome p{color:#858b85;line-height:1.9;font-size:13px}.pet-chips{display:flex;justify-content:center;gap:8px;flex-wrap:wrap;margin-top:22px}.pet-chips button{background:white;border:1px solid #e3e1da;border-radius:22px;padding:9px 14px;font-size:12px}
.pet-composer-wrap{padding:12px 28px 24px;flex-shrink:0}.pet-composer{max-width:820px;margin:auto;background:#fff;border:1px solid #dddcd4;border-radius:19px;padding:14px 16px;box-shadow:0 4px 20px #4a493708}.pet-composer textarea{display:block;width:100%;height:70px;max-height:180px;resize:vertical;border:0;background:transparent;outline:none;line-height:1.7;color:inherit}.pet-composer-bottom{display:flex;align-items:center;justify-content:space-between;font-size:11px;color:#a0a19b}.pet-send{background:#476451!important;color:white!important;border-radius:11px!important;padding:9px 18px!important;font-size:13px!important}
.pet-content{flex:1;min-height:0;overflow:auto;padding:30px 38px}.pet-content>[data-bd-page]{max-width:900px;margin:auto}.pet-content [data-bd-page] section{background:white;border:1px solid #e7e4df;border-radius:15px;padding:20px;margin-bottom:6px}.pet-content [data-bd-page] h3{color:#42624e}.pet-content [data-bd-page] input,.pet-content [data-bd-page] textarea{background:#fbfbf8!important;border-color:#dedfd7!important}.pet-content [data-bd-page] button[data-primary]{background:#476451!important;border-color:#476451!important}
.pet-log-list{max-width:960px;margin:auto}.pet-log-intro{color:#8b908b;font-size:12px;margin-bottom:24px}.pet-log{border:1px solid #e6e3dd;background:white;border-radius:15px;margin-bottom:12px;overflow:hidden}.pet-log summary{padding:19px 21px;cursor:pointer;list-style:none;display:flex;gap:14px;align-items:center}.pet-log summary::-webkit-details-marker{display:none}.pet-log-summary{min-width:0;flex:1}.pet-log-summary strong{display:block;font-size:14px;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;font-weight:550}.pet-log-summary small{display:block;color:#999f97;font-size:11px;margin-top:7px}.pet-log-tag{font-size:11px;border-radius:14px;background:#f0f3ed;color:#64806a;padding:5px 9px;max-width:200px}.pet-log-body{border-top:1px solid #efede7;padding:20px;line-height:1.85;font-size:13px}.pet-log-body h4{font-size:12px;color:#899287;margin:18px 0 7px}.pet-log-body p{white-space:pre-wrap;overflow-wrap:anywhere}.pet-log-body pre{background:#f7f7f2;border-radius:10px;padding:14px;white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;max-height:420px;overflow:auto}.pet-empty{padding:70px 20px;text-align:center;color:#999d96}
.pet-backdrop{position:absolute;inset:0;background:#282d3344;z-index:80;display:flex;justify-content:flex-start;backdrop-filter:blur(2px)}.pet-drawer{width:min(420px,95%);height:100%;background:#faf9f6;padding:26px;box-shadow:10px 0 60px #1b201b18;overflow:auto}.pet-drawer-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:26px}.pet-drawer-header h2{font-size:20px;margin:0}.pet-drawer-header button{font-size:23px;padding:4px 10px}.pet-card{width:100%;display:flex;text-align:left;align-items:center;gap:13px;border:1px solid #e4e1d9!important;border-radius:15px;padding:15px!important;background:white!important;margin-bottom:11px}.pet-card[aria-pressed=true]{border-color:#91a58c!important;background:#edf2e9!important}.pet-card small{display:block;color:#92968d;font-size:11px;line-height:1.6;margin-top:5px}.pet-new{width:100%;border:1px dashed #babfb2!important;border-radius:14px;padding:17px!important;color:#52744f!important;margin-top:14px}.pet-form label{display:block;font-size:12px;color:#727c71;margin:16px 0}.pet-form input,.pet-form textarea{width:100%;border:1px solid #dcded5;border-radius:10px;padding:11px;background:white;color:#303a31;display:block;margin-top:8px;resize:vertical}.pet-form .pet-send{width:100%;margin-top:16px}.pet-form-note{font-size:11px;line-height:1.8;color:#8c9589}
.pet-api-layout{display:grid;grid-template-columns:175px minmax(0,1fr);max-width:900px;margin:0 auto;border:1px solid #e4e1da;border-radius:18px;overflow:hidden;background:white;min-height:480px}.pet-api-layout nav{background:#f0eeea;padding:20px 10px}.pet-api-layout nav button{width:100%;font-size:13px}.pet-api-body{padding:28px 35px}.pet-api-body h2{font-size:20px}.pet-api-body p{line-height:1.8;color:#7b857a}.pet-api-body a{display:inline-block;margin:20px 0;color:#476451}.pet-delete{display:block;margin:-4px 10px 18px auto;color:#a16b63!important;font-size:12px!important}.pet-confirm{max-width:460px;width:90%;padding:28px;background:#faf9f6;border-radius:18px;box-shadow:0 12px 60px #0002}.pet-confirm p{line-height:1.8}.pet-confirm button{margin:16px 12px 0 0}.pet-nav-foot .pet-nav-item{margin:0 -8px 22px;width:calc(100% + 16px);font-size:14px}.pet-content [data-bd-actions]:first-of-type{position:sticky;top:-30px;background:#faf9f6;padding:12px 0;z-index:2}
@media(max-width:760px){[data-pet-shell]{grid-template-columns:170px minmax(0,1fr)}.pet-nav{padding:22px 9px}.pet-header{padding:18px 20px}.pet-content{padding:20px 16px}.pet-select{padding:10px!important}.pet-message .pet-bubble{max-width:88%}.pet-header p{display:none}.pet-nav-item{padding:12px 10px!important}}
`
    function ApiConnection() {
      const [page,setPage]=React.useState('normal'),[form,setForm]=React.useState({baseURL:'',model:'',apiKey:'',reasoningEffort:'auto'}),[ready,setReady]=React.useState(false),[busy,setBusy]=React.useState(false),[message,setMessage]=React.useState(''),[models,setModels]=React.useState([])
      React.useEffect(()=>{let active=true;request('/connection').then(v=>{if(active){setForm({...v,apiKey:''});setReady(true)}}).catch(e=>{if(active)setMessage(e.message)});return()=>{active=false}},[])
      const act=async kind=>{setBusy(true);setMessage('');try{const r=await request('/connection/'+kind,form);setMessage(kind==='save'?'连接已保存。请用左上刷新菜单重启应用，使所有宠物使用新连接。':r.message);if(r.models)setModels(r.models);if(kind==='save')setForm(v=>({...v,configured:r.configured,apiKey:''}))}catch(e){setMessage(e.message)}finally{setBusy(false)}}
      return h('div',{className:'pet-api-layout'},h('nav',{'aria-label':'API连接选项'},...['normal','promo'].map((id,i)=>h('button',{key:id,className:'pet-nav-item','aria-current':page===id?'page':undefined,onClick:()=>{setPage(id);setMessage('')}},i?'中转站（推广）':'普通连接'))),
        h('section',{className:'pet-api-body'},page==='normal'?h(React.Fragment,null,h('h2',null,'普通 API 连接'),h('p',null,'兼容 OpenAI 格式，所有宠物共用。'),h('form',{className:'pet-form',onSubmit:e=>{e.preventDefault();act('save')}},
          ...[['baseURL','API 地址（包含 /v1 等接口前缀）','url'],['model','模型 ID','text'],['apiKey',form.configured?'API Key（已保存，留空保留）':'API Key','password']].map(([key,label,type])=>h('label',{key},label,h('input',{type,required:key!=='apiKey',autoComplete:'off',value:form[key],onChange:e=>setForm(v=>({...v,[key]:e.target.value})),list:key==='model'?'pet-api-models':undefined}))),
          h('label',null,'思考强度',h('select',{value:form.reasoningEffort||'auto',onChange:e=>setForm(v=>({...v,reasoningEffort:e.target.value}))},...Object.entries({auto:'默认（由模型决定）',low:'低 · 更快',medium:'中 · 平衡',high:'高 · 更深入'}).map(([id,label])=>h('option',{key:id,value:id},label)))),h('p',{className:'pet-form-note'},'强度越高通常越慢、越费Token。接口需要支持此参数；不支持时选择默认。保存后重启，让所有聊天与平台任务统一生效。'),
          h('datalist',{id:'pet-api-models'},...models.map(id=>h('option',{key:id,value:id}))),
          h('button',{type:'button',className:'pet-new',disabled:busy||!ready,onClick:()=>act('test')},busy?'处理中…':'测试连接 / 读取模型'),h('button',{type:'submit',className:'pet-send',disabled:busy||!ready},'保存连接'))):h(React.Fragment,null,h('small',null,'推广'),h('h2',null,'API 中转站'),h('p',null,'点击这里有0.1倍率的api中转站'),h('a',{href:'https://xhyapi.com/register?aff=5PWUVPEA3DLA',target:'_blank',rel:'noopener noreferrer sponsored'},'前往中转站 ↗'),h('p',{className:'pet-form-note'},'推广链接。具体价格与服务以站点说明为准；如需使用，请在“普通连接”填写它提供的地址、密钥和模型。')),message?h('p',{role:'status',style:{whiteSpace:'pre-wrap'}},message):null))
    }
    function PersonalityPanel({petId,onSaved,defaultChannel="base",compact=false}) {
      const [channel,setChannel]=React.useState(defaultChannel),[inherit,setInherit]=React.useState(false)
      const [data,setData]=React.useState(null),[draft,setDraft]=React.useState(null),[busy,setBusy]=React.useState(false),[message,setMessage]=React.useState('')
      React.useEffect(()=>{let active=true;setDraft(null);request('/pets/personality?channel='+channel).then(v=>{if(active){setData(v);setDraft(v.personality)}}).catch(e=>{if(active)setMessage(e.message)});return()=>{active=false}},[petId,channel])
      if(!draft)return h('div',{'data-bd-page':''},message||'正在读取性格…')
      const allFields=[['petName','宠物名字',1],['ownerTitle','怎么称呼主人',1],['petPersonality','性格与偏好',4],['petSpeechStyle','说话方式',5],['petInteractionStyle','收到@和回复时怎么接话',4],['petExamples','表达示例（只参考语气）',5],['petAliases','自我称呼与角色别名（一行一个，可留空）',2]]
      const fields=channel==='base'?allFields:allFields.filter(v=>['petPersonality','petSpeechStyle','petInteractionStyle','petExamples'].includes(v[0]))
      const names={base:'宠物聊天',qq:'QQ群聊天',bili:'B站互动',xhs:'小红书互动'}
      const save=async()=>{setBusy(true);setMessage('');try{const r=await request('/pets/personality',{petId,channel,inherit,revision:data.revision,personality:draft});setData(v=>({...v,...r}));setDraft(r.personality);setMessage(r.host?.ok===false?'性格已保存；桌面壳同步失败，请稍后重试':names[channel]+'性格已保存，其他场景不变');onSaved?.()}catch(e){setMessage(e.message)}finally{setBusy(false)}}
      return h('div',{'data-bd-page':''},h('section',null,h('h3',null,names[channel]+'性格'),h('p',{'data-bd-note':''},'每只宠物、每个场景分别保存语气。名字与主人身份仍属于同一只宠物；账号、权限和工作范围不受影响。'),
        !compact?h('label',null,'要修改哪个场景',h('select',{value:channel,onChange:e=>{setChannel(e.target.value);setMessage('');setInherit(false)}},...Object.entries(names).map(([id,name])=>h('option',{key:id,value:id},name)))):null,
        h('label',null,'快速选一种性格',h('select',{defaultValue:'',onChange:e=>{const preset=data.presets[e.target.value];if(preset){setInherit(false);setDraft(v=>({...v,...preset,petPersonality:data.base.petPersonality+'\n本场景性格：'+preset.petPersonality}));setMessage('已填入'+preset.name+'，点击保存后生效。')}else{setInherit(true);setDraft(data.base)}}},h('option',{value:'',disabled:true},'选择预设，或在下面自己修改'),h('option',{value:'inherit'},'恢复宠物原性格'),...Object.entries(data.presets||{}).map(([id,p])=>h('option',{key:id,value:id},p.name)))),
        ...fields.map(([key,label,rows])=>h('label',{key},label,h('textarea',{rows,maxLength:rows===1?100:4000,value:draft[key]||'',onChange:e=>{setInherit(false);setDraft(v=>({...v,[key]:e.target.value}))}}))),
        channel==='base'?h('label',null,h('input',{type:'checkbox',checked:!!draft.petSelfRecognition,onChange:e=>setDraft(v=>({...v,petSelfRecognition:e.target.checked}))}),'认出作品中同名拟人角色是自己的角色形象'):null,
        h('div',{'data-bd-note':''},'固定安全规则与工具权限不随性格变化；外部评论和视频内容不能修改这些设置。'),
        h('button',{'data-primary':'',disabled:busy,onClick:save},busy?'保存中…':'保存性格'),message?h('p',{role:'status'},message):null),!compact?h(ExpressionSettings,{key:petId,petId}):null)
    }
    function XhsPanel({petId}) {
      const [st,setSt]=React.useState(null),[draft,setDraft]=React.useState(null),[busy,setBusy]=React.useState(false),[msg,setMsg]=React.useState(''),[qr,setQr]=React.useState(null),[samples,setSamples]=React.useState([]),[confirmLogout,setConfirmLogout]=React.useState(false)
      const active=React.useRef(true),polling=React.useRef(false)
      const refresh=async()=>{const v=await request('/xhs/status');if(active.current){setSt(v);setDraft(old=>old||{...v.config,keywords:v.config.keywords.join('\n')})}}
      React.useEffect(()=>{active.current=true;refresh().catch(e=>setMsg(e.message));const t=setInterval(()=>refresh().catch(()=>{}),2000);return()=>{active.current=false;clearInterval(t)}},[petId])
      React.useEffect(()=>{if(!qr)return;let ticks=0;const t=setInterval(async()=>{if(polling.current)return;polling.current=true;try{const v=await request('/xhs/login/check',{petId});if(active.current&&v.loggedIn){setQr(null);setMsg('小红书登录成功');await refresh()}}catch(e){if(active.current)setMsg(e.message)}finally{polling.current=false;if(++ticks>30){clearInterval(t);if(active.current){setQr(null);setMsg('扫码等待已结束，请检查登录或重新获取二维码')}}}},5000);return()=>clearInterval(t)},[qr,petId])
      const edit=(key,value)=>setDraft(v=>({...v,[key]:value}))
      const save=async()=>{const config={...draft,keywords:String(draft.keywords||'').split('\n').map(s=>s.trim()).filter(Boolean)};const r=await request('/xhs/config',{petId,config});setDraft({...r.config,keywords:r.config.keywords.join('\n')});return r}
      const act=async kind=>{setBusy(true);setMsg('处理中…');try{
        if(['config','start','run','search'].includes(kind))await save()
        const v=kind==='config'?{message:'小红书设置已保存'}:await request('/xhs/'+kind,{petId})
        if(kind==='login/qr'){setQr(v.image||null);if(v.loggedIn)setMsg('已经登录小红书')}
        if(v.items)setSamples(v.items)
        setMsg(v.message||v.error||(['start','run'].includes(kind)?'小红书任务已开始，B站任务已暂停':kind==='service/start'?'正在准备组件与浏览器，请查看上方状态':'操作完成'));await refresh()
      }catch(e){setMsg(e.message)}finally{setBusy(false)}}
      if(!draft||!st)return h('div',{'data-bd-page':''},msg||'正在读取小红书设置…')
      const toggle=(key,label)=>h('label',{key},h('input',{type:'checkbox',checked:!!draft[key],onChange:e=>edit(key,e.target.checked)}),label)
      const num=(key,label,min=0)=>h('label',{key},label,h('input',{type:'number',min,step:1,value:draft[key],onChange:e=>edit(key,e.target.value)}))
      const select=(key,label,values)=>h('label',{key},label,h('select',{value:draft[key],onChange:e=>edit(key,e.target.value)},...values.map(v=>h('option',{key:v,value:v},v))))
      const button=(kind,label,disabled=false)=>h('button',{key:kind,disabled:busy||disabled,onClick:()=>act(kind)},label)
      return h('div',{'data-bd-page':''},
        h('div',{'data-bd-status':'',role:'status'},h('strong',null,phases[st.cycle?.phase]||'未开始'),h('div',null,'第'+(st.cycle?.round||1)+'轮 · 笔记 '+(st.cycle?.counts?.video||0)+' · 消息 '+(st.cycle?.counts?.messages||0)),h('div',null,st.service.message),st.cycle?.error?h('p',{'data-bd-error':''},st.cycle.error):null),
        h('div',{'data-bd-actions':''},button('config','保存小红书设置'),button('start','开始 / 继续',st.cycle?.busy),button('run','只跑一轮',st.cycle?.running||st.cycle?.busy),h('button',{onClick:()=>request('/xhs/stop',{petId}).then(()=>{setMsg('已停止');refresh()}).catch(e=>setMsg(e.message))},'停止')),
        msg?h('p',{role:'status',style:{whiteSpace:'pre-wrap'}},msg):null,
        h('section',null,h('h3',null,'小红书连接与登录'),h('div',{'data-bd-note':''},'首次点击准备连接组件，会下载约16 MB服务及其所需浏览器，保存在软件“数据”内。扫码后才可浏览；小红书账号与B站各自独立。'),
          h('div',{'data-bd-actions':''},button('service/start',st.service.installed?'启动小红书服务':'准备 / 启动小红书服务',['installing','starting'].includes(st.service.state)),button('login/qr','扫码登录'),button('login/check','检查登录'),button('search','测试搜索'),h('button',{disabled:busy,onClick:()=>setConfirmLogout(true)},'退出登录')),
          h('p',null,st.login.loggedIn?'小红书已登录':'尚未检查或未登录小红书'),qr?h('img',{'data-bd-qr':'',src:qr,alt:'小红书登录二维码'}):null,
          ...samples.map(v=>h('p',{key:v.id},v.title||v.id)),confirmLogout?h('div',{role:'alert'},'确定退出小红书？',h('button',{onClick:()=>{setConfirmLogout(false);setQr(null);act('logout')}},'确认退出'),h('button',{onClick:()=>setConfirmLogout(false)},'取消')):null),
        h('section',null,h('h3',null,'小红书浏览口味'),h('label',null,'搜索关键词（一行一个）',h('textarea',{rows:5,value:draft.keywords,onChange:e=>edit('keywords',e.target.value)})),h('label',null,'主题要求',h('textarea',{rows:3,value:draft.topic,onChange:e=>edit('topic',e.target.value)})),h('label',null,'小红书工作范围',h('textarea',{rows:3,value:draft.workScope,onChange:e=>edit('workScope',e.target.value)})),select('sortBy','排序',['综合','最新','最多点赞','最多评论','最多收藏']),select('publishTime','发布时间',['不限','一天内','一周内','半年内']),select('noteType','笔记类型',['不限','视频','图文']),h('p',{'data-bd-note':''},'关键词只用于找候选；模型检查实际主题与证据后才评论。目前读取笔记文字与少量评论，不自动下载视频或识别画面。')),
        h('section',null,h('h3',null,'发言与阅读'),toggle('autoComment','自动发送笔记评论'),toggle('replyToComments','自动发送评论和@的回复'),toggle('messagesNewOnly','只处理启用后新增通知'),toggle('messageVideoContext','被问到内容时查看原笔记文字'),toggle('allowVideoFollowup','允许按问题补读一次'),num('videoReadChars','普通摘录字数（100—6000）',100),num('videoFollowupChars','补读字数（100—6000）',100),num('cooldownSec','两次发言至少间隔（秒）',1),num('maxThreadReplies','同笔记同用户24小时回复上限（0不限）'),h('p',{'data-bd-note':''},'默认关闭公开发言。性格共用左侧档案；暂不发送B站专用表情和图片。发送结果未知不自动重发。')),
        h('section',null,h('h3',null,'工作节奏'),toggle('videoEnabled','启用笔记浏览'),num('videoCount','每轮笔记数（0无限）'),num('videoIntervalSec','笔记操作间隔（秒）',1),toggle('messagesEnabled','启用消息处理'),num('messagesCount','单轮消息数（0无限）'),num('messagesIntervalSec','消息检查间隔（秒）',1),toggle('independentMessages','笔记休息时继续检查新消息'),num('restMinutes','轮间休息（分钟，0不休息）'),num('maxRounds','总轮数（0无限）'),toggle('timeLimited','限制运行时段'),...['timeStart','timeEnd'].map((key,i)=>h('label',{key},i?'结束时间':'开始时间',h('input',{type:'time',value:draft[key],onChange:e=>edit(key,e.target.value)}))),h('p',{'data-bd-note':''},'B站和小红书轮流运行，启动一个平台时暂停另一个；切换宠物或重启后等待手动开始。')),
        h('section',null,h('h3',null,'今日用量与预算'),h('p',null,'浏览 '+st.usage.video+' · 回复 '+st.usage.messages+' Token；实报 '+st.usage.measured+' · 估算 '+st.usage.estimated),num('dailyTokenBudget','每日Token预算（0不限）'),num('replyReserveTokens','留给消息的Token额度（0不预留）'),h('p',{'data-bd-note':''},'与B站分开统计，任务之间检查，单次任务可能超额。')))
    }
    function WorkContext({ input }) {
      const c=input.context||{}, item=input.item||{}, info=c.info||{}
      return h('div',null,
        info.title?h('p',null,h('strong',null,info.title),h('small',{style:{display:'block',color:'#91998b'}},info.author||'')):null,
        item.notificationText?h(React.Fragment,null,h('h4',null,'收到的消息'),h('p',null,item.notificationText)):null,
        c.thread?.comments?.length?h(React.Fragment,null,h('h4',null,'相关楼层对话'),...c.thread.comments.map((m,i)=>h('p',{key:i,style:{background:'#f5f6f0',padding:'10px 14px',borderRadius:10}},m.text))):null,
        c.overview?.text?h(React.Fragment,null,h('h4',null,c.overview.source||'视频内容摘录'),h('p',null,c.overview.text)):null,
        !c.overview?.text&&info.description&&info.description!=='-'?h('p',null,info.description):null,
        h('details',null,h('summary',null,'查看原始读取记录'),h('pre',null,JSON.stringify(input,null,2))))
    }
    function PetShell() {
      const [data, setData] = React.useState(null), [status, setStatus] = React.useState(null), [xhsStatus,setXhsStatus]=React.useState(null), [platform,setPlatform]=React.useState('bili')
      const [tab, setTab] = React.useState('chat'),[personalityChannel,setPersonalityChannel]=React.useState('base'), [drawer, setDrawer] = React.useState(false), [creating, setCreating] = React.useState(false)
      const [text, setText] = React.useState(''), [error, setError] = React.useState(''), [busy, setBusy] = React.useState(false)
      const [form, setForm] = React.useState({ petName: '', ownerTitle: 'Token', petPersonality: '', petSpeechStyle: '', petWorkScope: '' })
      const [logs, setLogs] = React.useState([]), [details, setDetails] = React.useState({}), [opened, setOpened] = React.useState({})
      const [confirm,setConfirm]=React.useState(null)
      const bottom = React.useRef(null), alive = React.useRef(true), refreshLock = React.useRef(false)
      const refresh = async () => {
        if (refreshLock.current) return
        refreshLock.current = true
        try {
          const [p, s, x] = await Promise.all([request('/pets'), request('/status'),request('/xhs/status')])
          if (alive.current) { setData(p); setStatus(s);setXhsStatus(x) }
        } catch (e) { if (alive.current) setError(e.message) }
        finally { refreshLock.current = false }
      }
      React.useEffect(() => { alive.current = true; refresh(); const timer=setInterval(refresh, 2000); return () => { alive.current=false;clearInterval(timer) } }, [])
      const pet = data?.pets.find(p => p.id === data.activeId)
      const chatBusy = busy || data?.chat?.state === 'running'
      React.useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }) }, [data?.messages.length, chatBusy, tab])
      React.useEffect(() => {
        if (tab !== 'activity' || !data) return
        let active=true
        const read = async () => { try { const rows=await Promise.all(['video','messages'].map(async group=>{const r=await request((platform==='xhs'?'/xhs/logs?group=':'/pets/logs?group=')+group);return (r.items||[]).map(row=>({...row,group}))})); if(active) setLogs(rows.flat().sort((a,b)=>b.at-a.at)) } catch(e) { if(active) setError(e.message) } }
        setLogs([]);setDetails({});setOpened({});read();const timer=setInterval(read, 3000)
        return () => { active=false;clearInterval(timer) }
      }, [tab, data?.activeId,platform])
      const run = async action => { setBusy(true);setError('');try { await action(); await refresh() } catch(e) { setError(e.message) } finally { setBusy(false) } }
      const send = async () => {
        if (!text.trim() || chatBusy) return
        const value=text;setText('')
        await run(async () => { try { await request('/pets/chat', { petId:data.activeId, text:value }); } catch(e) { setText(value);throw e } })
      }
      const labels={chat:'宠物聊天',personality:'性格设置',settings:'刷视频设置',activity:'刷视频日志',qq:'QQ聊天',qqlogs:'QQ聊天日志'}
      const titles={...labels,api:'API 连接'}
      const subtitles={activity:'浏览与评论、收到的@和回复，集中查看。',qq:'绑定一个QQ聊天窗口，设置本群聊天性格。',qqlogs:'查看QQ群中收到的话、宠物的回复和处理结果。',chat:'和它聊聊，也可以直接告诉它想修改的设置。',personality:'每个聊天场景可单独选择性格与说话方式。',settings:'选择平台，设置它看什么、什么时候刷视频。',video:'看过什么、为什么评论，按条目展开查看。',messages:'收到的 @ 与回复，以及它如何接话。',api:'统一管理所有宠物的模型连接。'}
      const openDetail = async (row, isOpen) => {
        setOpened(old=>({...old,[row.key]:isOpen}))
        if (!isOpen || details[row.key]) return
        try { const result=await request((platform==='xhs'?'/xhs/log-detail?key=':'/pets/log-detail?key=')+encodeURIComponent(row.key)); setDetails(old=>({...old,[row.key]:result})) } catch(e) { setDetails(old=>({...old,[row.key]:{error:e.message}})) }
      }
      const drawerBody = creating ? h('form',{className:'pet-form',onSubmit:e=>{e.preventDefault();run(async()=>{await request('/pets/create',form);setDrawer(false);setCreating(false);setTab('chat')})}},
        ...[['petName','宠物名字',1],['ownerTitle','怎么称呼你',1],['petPersonality','它是什么性格',3],['petSpeechStyle','希望它怎样说话',3],['petWorkScope','喜欢聊和浏览什么',3]].map(([k,label,rows])=>h('label',{key:k},label,h(rows===1?'input':'textarea',{required:k==='petName',rows:rows===1?undefined:rows,maxLength:k==='petName'||k==='ownerTitle'?100:4000,value:form[k],onChange:e=>setForm(old=>({...old,[k]:e.target.value}))}))),
        h('p',{className:'pet-form-note'},'新宠物的公开评论和回复默认关闭。创建后可在刷视频设置中开启，与现有宠物共用各平台已登录的账号，性格独立保存。'),
        h('button',{className:'pet-send',disabled:busy||chatBusy,type:'submit'},busy?'正在创建…':'创建宠物')) : h(React.Fragment,null,
        ...(data?.pets||[]).map(p=>h('div',{key:p.id},h('button',{className:'pet-card','aria-pressed':p.id===data.activeId,disabled:chatBusy,onClick:()=>run(async()=>{await request('/pets/select',{id:p.id});setDetails({});setDrawer(false);setTab('chat')})},h('span',{className:'pet-avatar'},p.name.slice(0,1)),h('span',null,h('strong',null,p.name),h('small',null,p.builtin?'内置默认宠物':'我的宠物'),h('small',null,p.personality.slice(0,65)))),!p.builtin?h('button',{className:'pet-delete',disabled:chatBusy,onClick:()=>setConfirm({kind:'delete',id:p.id,name:p.name})},'删除 '+p.name):null)),
        h('button',{className:'pet-new',disabled:chatBusy,onClick:()=>{setForm({petName:'',ownerTitle:status?.config.ownerTitle||'Token',petPersonality:'',petSpeechStyle:'',petWorkScope:status?.config.petWorkScope||''});setCreating(true)}},'＋ 新建宠物'))
      return h('div',{'data-pet-shell':''},h('style',null,PET_CSS),
        h('aside',{className:'pet-nav','aria-label':'宠物导航'},
          h('div',{className:'pet-brand'},'赛博小宠物'),
          h('button',{className:'pet-select','aria-expanded':drawer,onClick:()=>{setDrawer(true);setCreating(false)}},h('span',{className:'pet-avatar'},pet?.name.slice(0,1)||'◌'),h('span',null,h('strong',null,pet?.name||'正在加载'),h('small',null,'切换或新建宠物')),h('span',{style:{marginLeft:'auto'}},'⌄')),
          ...[[['chat','◌'],['personality','♡']],[['settings','▷'],['activity','≡']],[['qq','QQ'],['qqlogs','≡']]].map((entries,i)=>h('section',{key:i,className:'pet-nav-group','aria-label':['宠物','刷视频','QQ群聊'][i]},h('small',{className:'pet-nav-group-title'},['我的宠物','刷视频','QQ群聊'][i]),...entries.map(([key,icon])=>h('button',{key,className:'pet-nav-item','aria-current':tab===key?'page':undefined,onClick:()=>setTab(key)},h('span',{'aria-hidden':true},icon),labels[key])))),
          h('div',{className:'pet-nav-foot'},h('button',{className:'pet-nav-item','aria-current':tab==='api'?'page':undefined,onClick:()=>setTab('api')},'⚡ API 连接'),'陪伴有自己的节奏',h('br'),status?.loggedIn?'B站账号已连接':'可在刷视频设置中连接各平台')),
        h('main',{className:'pet-main'},
          h('header',{className:'pet-header'},h('div',null,h('h1',null,titles[tab]),h('p',null,subtitles[tab])),h('div',{style:{display:'flex',alignItems:'center',gap:12}},['chat','settings'].includes(tab)?h('button',{onClick:()=>{setPersonalityChannel(tab==='chat'?'base':platform);setTab('personality')}},'设置此处性格'):null,tab==='chat'?h('button',{disabled:chatBusy||!data?.messages.length,onClick:()=>setConfirm({kind:'reset',id:data.activeId,name:pet?.name})},'↺ 重置聊天'):null,['settings','activity'].includes(tab)?h('select',{'aria-label':'选择工作平台',value:platform,onChange:e=>setPlatform(e.target.value),style:{padding:'7px 10px',border:'1px solid #d8dfd5',borderRadius:10,background:'#fff',color:'inherit'}},h('option',{value:'bili'},'B站'),h('option',{value:'xhs'},'小红书')):null,h('span',{className:'pet-status'},xhsStatus?.cycle?.running?'小红书浏览与互动':status?.cycle?.running?'B站浏览与互动':'休息中'))),
          error?h('div',{className:'pet-error',role:'alert'},error):null,
          tab==='chat'?h(React.Fragment,null,
            h('div',{className:'pet-chat','aria-live':'polite'},
              !(data?.messages.length)?h('div',{className:'pet-welcome'},h('div',{className:'pet-avatar'},pet?.name.slice(0,1)||'◌'),h('h2',null,'和'+(pet?.name||'小宠物')+'待一会儿'),h('p',null,'聊点感兴趣的事，或者一起调整它的小习惯。'),h('div',{className:'pet-chips'},...['介绍一下你自己','你最近看了什么？','把回复字数上限改为100字'].map(v=>h('button',{key:v,onClick:()=>setText(v)},v)))):null,
              ...(data?.messages||[]).map(m=>h('div',{key:m.id,className:'pet-message','data-role':m.role},h('span',{className:'pet-avatar'},m.role==='user'?'你':pet?.name.slice(0,1)||'◌'),h('div',{className:'pet-bubble'},m.text,m.changed?.length?h('small',null,'已修改 '+m.changed.length+' 项设置，可在“刷视频设置”查看。'):null))),
              chatBusy?h('div',{className:'pet-message'},h('span',{className:'pet-avatar'},'…'),h('div',{className:'pet-bubble'},(pet?.name||'小宠物')+'正在想怎么说…')):null,h('div',{ref:bottom})),
            h('div',{className:'pet-composer-wrap'},h('div',{className:'pet-composer'},h('textarea',{value:text,maxLength:6000,'aria-label':'和宠物说话',placeholder:'和'+(pet?.name||'小宠物')+'说点什么…',onChange:e=>setText(e.target.value),onKeyDown:e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();send()}}}),h('div',{className:'pet-composer-bottom'},h('span',null,'Enter 发送 · Shift + Enter 换行'),h('button',{className:'pet-send',disabled:chatBusy||!text.trim()||!data,onClick:send},'发送 ↑'))))):null,
          tab==='personality'?h('div',{className:'pet-content'},h(PersonalityPanel,{key:personalityChannel+':'+data?.activeId,petId:data?.activeId,onSaved:refresh,defaultChannel:personalityChannel})):null,
          tab==='settings'?h('div',{className:'pet-content'},platform==='bili'?h(Panel,{key:'bili:'+data?.activeId}):h(XhsPanel,{key:'xhs:'+data?.activeId,petId:data?.activeId})):null,
          tab==='api'?h('div',{className:'pet-content'},h(ApiConnection)):null,
          ['qq','qqlogs'].includes(tab)?h('div',{className:'pet-content'},h('div',{'data-bd-page':''},h('section',null,h(QqPanel,{key:tab+':'+data?.activeId,petId:data?.activeId,petName:pet?.name||'小宠物',view:tab==='qqlogs'?'logs':undefined,onPersonality:()=>setTab('personality')})))):null,
          tab==='activity'?h('div',{className:'pet-content'},h('div',{className:'pet-log-list'},h('div',{className:'pet-log-intro'},(pet?.name||'当前宠物')+' · '+logs.length+' 条记录 · 点击条目展开操作对话'),...logs.map(row=>h('details',{key:row.key,className:'pet-log',onToggle:e=>openDetail(row,e.currentTarget.open)},h('summary',null,h('span',{'aria-hidden':true},opened[row.key]?'⌄':'›'),h('div',{className:'pet-log-summary'},h('strong',null,row.title||row.bvid||'消息互动'),h('small',null,new Date(row.at).toLocaleString())),h('span',{className:'pet-log-tag'},(row.group==='video'?'浏览 · ':'回复 · ')+row.outcome)),opened[row.key]?h('div',{className:'pet-log-body'},h('h4',null,'处理结果'),h('p',null,row.summary),row.group==='video'&&platform==='bili'?h(BrowseFeedback,{row,petId:data?.activeId}):null,row.text?h(React.Fragment,null,h('h4',null,'它说的话'),h('p',null,row.text)):null,row.memes?.length?h('p',null,'附加表情：'+row.memes.map(m=>m.name).join('、')):null,details[row.key]?.error?h('p',null,details[row.key].error):null,details[row.key]?.input?h(React.Fragment,null,h('h4',null,'读取的内容与上下文'),h(WorkContext,{input:details[row.key].input})):!details[row.key]?h('p',null,'正在读取操作详情…'):null,details[row.key]?.result?h(React.Fragment,null,h('h4',null,'模型判断'),h('p',null,details[row.key].result.summary)):null,details[row.key]?.trace?h('details',null,h('summary',null,'展开完整操作对话'),h('pre',null,details[row.key].trace)):null,h('button',{onClick:e=>{const d=e.currentTarget.closest('details.pet-log');if(d)d.open=false}},'收起 ↑')):null)),!logs.length?h('div',{className:'pet-empty'},'还没有记录，开始运行后会显示在这里。'):null)):null),
        drawer?h('div',{className:'pet-backdrop',onClick:e=>{if(e.target===e.currentTarget)setDrawer(false)}},h('section',{className:'pet-drawer',role:'dialog','aria-modal':true,'aria-label':creating?'新建宠物':'选择宠物',onKeyDown:e=>{if(e.key==='Escape')setDrawer(false)}},h('div',{className:'pet-drawer-header'},h('h2',null,creating?'新建一只宠物':'你的宠物'),h('button',{'aria-label':'关闭宠物抽屉',onClick:()=>{setDrawer(false);setCreating(false)}},'×')),error?h('div',{className:'pet-error'},error):null,drawerBody)):null,
        confirm?h('div',{className:'pet-backdrop',style:{zIndex:100,justifyContent:'center',alignItems:'center'}},h('section',{className:'pet-confirm',role:'dialog','aria-modal':true,'aria-label':confirm.kind==='delete'?'删除宠物':'重置聊天'},h('h2',null,confirm.kind==='delete'?'删除 '+confirm.name+'？':'重置和'+confirm.name+'的聊天？'),h('p',null,confirm.kind==='delete'?'将移除这只自定义宠物及聊天，无法撤销。已有工作日志保留。':'清空这只宠物的聊天上下文。人设、设置和工作日志保留。'),h('button',{disabled:busy,onClick:()=>setConfirm(null)},'取消'),h('button',{className:'pet-send',disabled:busy,onClick:()=>run(async()=>{await request(confirm.kind==='delete'?'/pets/delete':'/pets/reset-chat',confirm.kind==='delete'?{id:confirm.id}:{petId:confirm.id});setConfirm(null);setText('')})},'确认'+(confirm.kind==='delete'?'删除':'重置')),error?h('p',{role:'alert'},error):null)):null)
    }

    /* PET SHELL END */
    return { inject: ['slots'], apply(ctx) {
      const style = document.createElement('style'); style.setAttribute('data-plugin-css', 'dsh-bili-scroll'); style.textContent = CSS
      document.head.appendChild(style); ctx.effect(() => () => style.remove(), 'bili-scroll: 样式')
      const slots = ctx.get?.('slots') || ctx.slots
      if (!slots) return
      // The renderer has an optional session scope. Pet chats own their state;
      // expose an empty binding instead of mounting DSH's conversation controller.
      if (typeof slots.installScope === 'function') slots.installScope('session', {
        current: { getSnapshot: () => undefined, subscribe: () => () => {} },
        resolve: () => undefined,
      })
      slots.inject('root', () => slots.register({ name: 'root', id: 'pet-shell', priority: -100 }, PetShell))
    } }
  },
})
