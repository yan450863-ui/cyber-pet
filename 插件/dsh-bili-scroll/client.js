/* 浏览器自注册入口：设置页与对话区共用同一个面板。 */
window.__ModuleLoader__.load({
  id: 'dsh-bili-scroll',
  factory(require) {
    const React = require('react'), h = React.createElement
    const API = '/api/bili-duty'
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
            if (alive.current) { setSt(result); setDraft(old => old || { ...result.config, keywords: (result.config.keywords || []).join('\n'), excludedWords: (result.config.excludedWords || []).join('\n'), preferredAuthors: (result.config.preferredAuthors || []).join('\n'),browsePreferredUids:(result.config.browsePreferredUids||[]).join('\n'),browseBlockedUids:(result.config.browseBlockedUids||[]).join('\n') }) }
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
        const cfg = { ...draft, keywords: String(draft.keywords || '').split('\n').map(s => s.trim()).filter(Boolean) }
        for (const key of ['excludedWords', 'preferredAuthors','browsePreferredUids','browseBlockedUids']) cfg[key] = String(draft[key] || '').split('\n').map(s => s.trim()).filter(Boolean)
        for(const key of ['browsePreferredUids','browseBlockedUids'])if(cfg[key].some(v=>!/^\d{1,20}$/.test(v)||Number(v)<=0))throw Error('UP列表请填写数字UID，一行一个')
        if(Number(cfg.browseExplorationPercent)>100)throw Error('探索比例须为0—100')
        for (const key of ['browseExplorationPercent','memeChance', 'memeMaxCount', 'memeCooldownSec', 'maxCommentChars', 'maxReplyChars', 'videoCount', 'videoIntervalSec', 'messagesCount', 'messagesIntervalSec', 'restMinutes', 'maxRounds', 'cooldownSec', 'dailyTokenBudget', 'replyReserveTokens', 'maxThreadReplies', 'cacheMinutes', 'retentionDays', 'aiWeight', 'llmWeight', 'animeWeight', 'animationWeight']) {
          const n = Number(cfg[key])
          if (cfg[key] === '' || !Number.isInteger(n) || n < (key.endsWith('IntervalSec') || ['cooldownSec', 'retentionDays'].includes(key) ? 1 : 0) || n > 100000000) throw new Error('请填写有效整数；间隔及保留天数至少1，休息0表示不休息')
          cfg[key] = n
        }
        for (const key of ['maxCommentChars', 'maxReplyChars']) if (cfg[key] < 1 || cfg[key] > 1000) throw new Error('评论和回复字数上限须为1—1000')
        for (const key of ['petName', 'ownerTitle', 'petPersonality', 'petSpeechStyle', 'petExamples', 'petWorkScope', 'petInteractionStyle']) if (!String(cfg[key] || '').trim()) throw new Error('请填写完整宠物档案')
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
      const toggle = (key, label) => h('label', { key }, h('input', { type: 'checkbox', checked: !!draft[key], onChange: e => edit(key, e.target.checked) }), label)
      const num = (key, label, min = 0) => h('label', { key }, label, h('input', { type: 'number', min, max: 1000000, step: 1, value: draft[key] ?? '', onChange: e => edit(key, e.target.value), 'aria-label': label }))
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
          h('label',null,'口味预设',h('select',{value:draft.browsePreset||'custom',onChange:e=>{const id=e.target.value,p=browseOptions?.presets[id];setDraft(old=>({...old,browsePreset:id,...(p?{keywords:p.keywords.join('\n'),browseTypes:p.types}: {})}))}},h('option',{value:'custom'},'自定义 / 保留现有设置'),...Object.entries(browseOptions?.presets||{}).map(([id,p])=>h('option',{key:id,value:id},p.name)))),
          h('div',{'data-bd-actions':''},...browseTypes.map(type=>h('label',{key:type},h('input',{type:'checkbox',checked:(draft.browseTypes||browseTypes).includes(type),onChange:e=>setDraft(old=>({...old,browsePreset:'custom',browseTypes:e.target.checked?[...(old.browseTypes||browseTypes),type]:(old.browseTypes||browseTypes).filter(v=>v!==type)}))}),type))),
          h('label',null,'筛选严格度',h('select',{value:draft.browseStrictness||'standard',onChange:e=>edit('browseStrictness',e.target.value)},...Object.entries({loose:'宽松：允许间接相关',standard:'标准：主体相关',strict:'严格：主体高度相关且有证据'}).map(([v,label])=>h('option',{key:v,value:v},label)))),
          num('browseExplorationPercent','探索比例（0—100%，默认0）'),
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
        h('section', null, h('h3', null, '宠物档案（可修改）'),
          petField('petName', '宠物名字', 1), petField('ownerTitle', '主人称呼', 1),
          h('label',null,'主人的B站账号（数字UID）',h('input',{type:'text',inputMode:'numeric',value:draft.ownerBiliUid||'',placeholder:'例如：个人主页 space.bilibili.com/ 后面的数字',onChange:e=>edit('ownerBiliUid',e.target.value)})),
          toggle('mentionOwnerOnLikedVideo','看到喜欢的视频是否 @ 主人'),
          h('div',{'data-bd-note':''},'开启后，宠物只在判断值得分享的视频评论里@这一个UID；需要同时开启自动评论。@称呼计入字数上限，超限时跳过@。'),
          petField('petPersonality', '性格与偏好'), petField('petSpeechStyle', '说话方式', 4),
          petField('petInteractionStyle', '收到@和回复时怎么互动', 4), petField('petExamples', '表达示例（仅参考语气）', 4), petField('petWorkScope', '工作内容范围', 3),
          num('maxCommentChars', '主动评论最多字数（1—1000）', 1), num('maxReplyChars', '消息回复最多字数（1—1000）', 1),
          h('div', { 'data-bd-note': '' }, '含标点、空格和换行，按Unicode字符计数。超限拦截，不截断或额外调用模型。保存后用于新任务；每只宠物独立保存档案和设置，可在左上抽屉选择或新建。安全与工具权限不随人设改变。')),
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
          h('label', null, '补充人设工作区（可选）', h('input', { type: 'text', value: draft.workspace || '', onChange: e => edit('workspace', e.target.value), placeholder: '兼容读取已有 AGENTS.md；不能覆盖本地宠物档案与安全边界' })),
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
    const PET_CSS = `
[data-pet-shell]{height:100%;min-height:0;display:grid;grid-template-columns:224px minmax(0,1fr);background:#faf9f6;color:#292d31;font-family:Inter,"Microsoft YaHei",sans-serif;font-size:14px;position:relative}
[data-windows-titlebar] [data-pet-shell]{padding-top:var(--dsh-windows-titlebar-height,36px)}
[data-pet-shell] *{box-sizing:border-box} [data-pet-shell] button,[data-pet-shell] textarea,[data-pet-shell] input{font:inherit}
[data-pet-shell] button{cursor:pointer;color:inherit;border:0;background:none} [data-pet-shell] button:disabled{opacity:.45;cursor:default}
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
      const [page,setPage]=React.useState('normal'),[form,setForm]=React.useState({baseURL:'',model:'',apiKey:''}),[ready,setReady]=React.useState(false),[busy,setBusy]=React.useState(false),[message,setMessage]=React.useState(''),[models,setModels]=React.useState([])
      React.useEffect(()=>{let active=true;request('/connection').then(v=>{if(active){setForm({...v,apiKey:''});setReady(true)}}).catch(e=>{if(active)setMessage(e.message)});return()=>{active=false}},[])
      const act=async kind=>{setBusy(true);setMessage('');try{const r=await request('/connection/'+kind,form);setMessage(kind==='save'?'连接已保存。请用左上刷新菜单重启应用，使所有宠物使用新连接。':r.message);if(r.models)setModels(r.models);if(kind==='save')setForm(v=>({...v,configured:r.configured,apiKey:''}))}catch(e){setMessage(e.message)}finally{setBusy(false)}}
      return h('div',{className:'pet-api-layout'},h('nav',{'aria-label':'API连接选项'},...['normal','promo'].map((id,i)=>h('button',{key:id,className:'pet-nav-item','aria-current':page===id?'page':undefined,onClick:()=>{setPage(id);setMessage('')}},i?'中转站（推广）':'普通连接'))),
        h('section',{className:'pet-api-body'},page==='normal'?h(React.Fragment,null,h('h2',null,'普通 API 连接'),h('p',null,'兼容 OpenAI 格式，所有宠物共用。'),h('form',{className:'pet-form',onSubmit:e=>{e.preventDefault();act('save')}},
          ...[['baseURL','API 地址（包含 /v1 等接口前缀）','url'],['model','模型 ID','text'],['apiKey',form.configured?'API Key（已保存，留空保留）':'API Key','password']].map(([key,label,type])=>h('label',{key},label,h('input',{type,required:key!=='apiKey',autoComplete:'off',value:form[key],onChange:e=>setForm(v=>({...v,[key]:e.target.value})),list:key==='model'?'pet-api-models':undefined}))),
          h('datalist',{id:'pet-api-models'},...models.map(id=>h('option',{key:id,value:id}))),
          h('button',{type:'button',className:'pet-new',disabled:busy||!ready,onClick:()=>act('test')},busy?'处理中…':'测试连接 / 读取模型'),h('button',{type:'submit',className:'pet-send',disabled:busy||!ready},'保存连接'))):h(React.Fragment,null,h('small',null,'推广'),h('h2',null,'API 中转站'),h('p',null,'点击这里有0.1倍率的api中转站'),h('a',{href:'https://xhyapi.com/register?aff=5PWUVPEA3DLA',target:'_blank',rel:'noopener noreferrer sponsored'},'前往中转站 ↗'),h('p',{className:'pet-form-note'},'推广链接。具体价格与服务以站点说明为准；如需使用，请在“普通连接”填写它提供的地址、密钥和模型。')),message?h('p',{role:'status',style:{whiteSpace:'pre-wrap'}},message):null))
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
      const [data, setData] = React.useState(null), [status, setStatus] = React.useState(null)
      const [tab, setTab] = React.useState('chat'), [drawer, setDrawer] = React.useState(false), [creating, setCreating] = React.useState(false)
      const [text, setText] = React.useState(''), [error, setError] = React.useState(''), [busy, setBusy] = React.useState(false)
      const [form, setForm] = React.useState({ petName: '', ownerTitle: 'Token', petPersonality: '', petSpeechStyle: '', petWorkScope: '' })
      const [logs, setLogs] = React.useState([]), [details, setDetails] = React.useState({}), [opened, setOpened] = React.useState({})
      const [confirm,setConfirm]=React.useState(null)
      const bottom = React.useRef(null), alive = React.useRef(true), refreshLock = React.useRef(false)
      const refresh = async () => {
        if (refreshLock.current) return
        refreshLock.current = true
        try {
          const [p, s] = await Promise.all([request('/pets'), request('/status')])
          if (alive.current) { setData(p); setStatus(s) }
        } catch (e) { if (alive.current) setError(e.message) }
        finally { refreshLock.current = false }
      }
      React.useEffect(() => { alive.current = true; refresh(); const timer=setInterval(refresh, 2000); return () => { alive.current=false;clearInterval(timer) } }, [])
      const pet = data?.pets.find(p => p.id === data.activeId)
      const chatBusy = busy || data?.chat?.state === 'running'
      React.useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }) }, [data?.messages.length, chatBusy, tab])
      React.useEffect(() => {
        if (!['video', 'messages'].includes(tab) || !data) return
        let active=true
        const read = async () => { try { const r=await request('/pets/logs?group='+tab); if(active) setLogs(r.items || []) } catch(e) { if(active) setError(e.message) } }
        setLogs([]);setDetails({});setOpened({});read();const timer=setInterval(read, 3000)
        return () => { active=false;clearInterval(timer) }
      }, [tab, data?.activeId])
      const run = async action => { setBusy(true);setError('');try { await action(); await refresh() } catch(e) { setError(e.message) } finally { setBusy(false) } }
      const send = async () => {
        if (!text.trim() || chatBusy) return
        const value=text;setText('')
        await run(async () => { try { await request('/pets/chat', { petId:data.activeId, text:value }); } catch(e) { setText(value);throw e } })
      }
      const labels={chat:'宠物聊天',settings:'宠物设置',video:'刷视频日志',messages:'回复日志'}
      const titles={...labels,api:'API 连接'}
      const subtitles={chat:'和它聊聊，也可以直接告诉它想修改的设置。',settings:'人设、兴趣与工作节奏，都由你来决定。',video:'看过什么、为什么评论，按条目展开查看。',messages:'收到的 @ 与回复，以及它如何接话。',api:'统一管理所有宠物的模型连接。'}
      const openDetail = async (row, isOpen) => {
        setOpened(old=>({...old,[row.key]:isOpen}))
        if (!isOpen || details[row.key]) return
        try { const result=await request('/pets/log-detail?key='+encodeURIComponent(row.key)); setDetails(old=>({...old,[row.key]:result})) } catch(e) { setDetails(old=>({...old,[row.key]:{error:e.message}})) }
      }
      const drawerBody = creating ? h('form',{className:'pet-form',onSubmit:e=>{e.preventDefault();run(async()=>{await request('/pets/create',form);setDrawer(false);setCreating(false);setTab('chat')})}},
        ...[['petName','宠物名字',1],['ownerTitle','怎么称呼你',1],['petPersonality','它是什么性格',3],['petSpeechStyle','希望它怎样说话',3],['petWorkScope','喜欢聊和浏览什么',3]].map(([k,label,rows])=>h('label',{key:k},label,h(rows===1?'input':'textarea',{required:k==='petName',rows:rows===1?undefined:rows,maxLength:k==='petName'||k==='ownerTitle'?100:4000,value:form[k],onChange:e=>setForm(old=>({...old,[k]:e.target.value}))}))),
        h('p',{className:'pet-form-note'},'新宠物的公开评论和回复默认关闭。创建后可在宠物设置中开启，与现有宠物共用当前 B站账号。'),
        h('button',{className:'pet-send',disabled:busy||chatBusy,type:'submit'},busy?'正在创建…':'创建宠物')) : h(React.Fragment,null,
        ...(data?.pets||[]).map(p=>h('div',{key:p.id},h('button',{className:'pet-card','aria-pressed':p.id===data.activeId,disabled:chatBusy,onClick:()=>run(async()=>{await request('/pets/select',{id:p.id});setDetails({});setDrawer(false);setTab('chat')})},h('span',{className:'pet-avatar'},p.name.slice(0,1)),h('span',null,h('strong',null,p.name),h('small',null,p.builtin?'内置默认宠物':'我的宠物'),h('small',null,p.personality.slice(0,65)))),!p.builtin?h('button',{className:'pet-delete',disabled:chatBusy,onClick:()=>setConfirm({kind:'delete',id:p.id,name:p.name})},'删除 '+p.name):null)),
        h('button',{className:'pet-new',disabled:chatBusy,onClick:()=>{setForm({petName:'',ownerTitle:status?.config.ownerTitle||'Token',petPersonality:'',petSpeechStyle:'',petWorkScope:status?.config.petWorkScope||''});setCreating(true)}},'＋ 新建宠物'))
      return h('div',{'data-pet-shell':''},h('style',null,PET_CSS),
        h('aside',{className:'pet-nav','aria-label':'宠物导航'},
          h('div',{className:'pet-brand'},'赛博小宠物'),
          h('button',{className:'pet-select','aria-expanded':drawer,onClick:()=>{setDrawer(true);setCreating(false)}},h('span',{className:'pet-avatar'},pet?.name.slice(0,1)||'◌'),h('span',null,h('strong',null,pet?.name||'正在加载'),h('small',null,'切换或新建宠物')),h('span',{style:{marginLeft:'auto'}},'⌄')),
          ...Object.entries(labels).map(([key,label],i)=>h('button',{key,className:'pet-nav-item','aria-current':tab===key?'page':undefined,onClick:()=>setTab(key)},h('span',{'aria-hidden':true},['◌','⚙','▷','↩'][i]),label)),
          h('div',{className:'pet-nav-foot'},h('button',{className:'pet-nav-item','aria-current':tab==='api'?'page':undefined,onClick:()=>setTab('api')},'⚡ API 连接'),'陪伴有自己的节奏',h('br'),status?.loggedIn?'B站账号已连接':'可在宠物设置中连接 B站')),
        h('main',{className:'pet-main'},
          h('header',{className:'pet-header'},h('div',null,h('h1',null,titles[tab]),h('p',null,subtitles[tab])),h('div',{style:{display:'flex',alignItems:'center',gap:12}},tab==='chat'?h('button',{disabled:chatBusy||!data?.messages.length,onClick:()=>setConfirm({kind:'reset',id:data.activeId,name:pet?.name})},'↺ 重置聊天'):null,h('span',{className:'pet-status'},status?.cycle?.running?'正在浏览与互动':'休息中'))),
          error?h('div',{className:'pet-error',role:'alert'},error):null,
          tab==='chat'?h(React.Fragment,null,
            h('div',{className:'pet-chat','aria-live':'polite'},
              !(data?.messages.length)?h('div',{className:'pet-welcome'},h('div',{className:'pet-avatar'},pet?.name.slice(0,1)||'◌'),h('h2',null,'和'+(pet?.name||'小宠物')+'待一会儿'),h('p',null,'聊点感兴趣的事，或者一起调整它的小习惯。'),h('div',{className:'pet-chips'},...['介绍一下你自己','你最近看了什么？','把回复字数上限改为100字'].map(v=>h('button',{key:v,onClick:()=>setText(v)},v)))):null,
              ...(data?.messages||[]).map(m=>h('div',{key:m.id,className:'pet-message','data-role':m.role},h('span',{className:'pet-avatar'},m.role==='user'?'你':pet?.name.slice(0,1)||'◌'),h('div',{className:'pet-bubble'},m.text,m.changed?.length?h('small',null,'已修改 '+m.changed.length+' 项设置，可在“宠物设置”查看。'):null))),
              chatBusy?h('div',{className:'pet-message'},h('span',{className:'pet-avatar'},'…'),h('div',{className:'pet-bubble'},(pet?.name||'小宠物')+'正在想怎么说…')):null,h('div',{ref:bottom})),
            h('div',{className:'pet-composer-wrap'},h('div',{className:'pet-composer'},h('textarea',{value:text,maxLength:6000,'aria-label':'和宠物说话',placeholder:'和'+(pet?.name||'小宠物')+'说点什么…',onChange:e=>setText(e.target.value),onKeyDown:e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();send()}}}),h('div',{className:'pet-composer-bottom'},h('span',null,'Enter 发送 · Shift + Enter 换行'),h('button',{className:'pet-send',disabled:chatBusy||!text.trim()||!data,onClick:send},'发送 ↑'))))):null,
          tab==='settings'?h('div',{className:'pet-content'},h(Panel,{key:data?.activeId})):null,
          tab==='api'?h('div',{className:'pet-content'},h(ApiConnection)):null,
          ['video','messages'].includes(tab)?h('div',{className:'pet-content'},h('div',{className:'pet-log-list'},h('div',{className:'pet-log-intro'},(pet?.name||'当前宠物')+' · '+logs.length+' 条记录 · 点击条目展开操作对话'),...logs.map(row=>h('details',{key:row.key,className:'pet-log',onToggle:e=>openDetail(row,e.currentTarget.open)},h('summary',null,h('span',{'aria-hidden':true},opened[row.key]?'⌄':'›'),h('div',{className:'pet-log-summary'},h('strong',null,row.title||row.bvid||'消息互动'),h('small',null,new Date(row.at).toLocaleString())),h('span',{className:'pet-log-tag'},row.outcome)),opened[row.key]?h('div',{className:'pet-log-body'},h('h4',null,'处理结果'),h('p',null,row.summary),tab==='video'?h(BrowseFeedback,{row,petId:data?.activeId}):null,row.text?h(React.Fragment,null,h('h4',null,'它说的话'),h('p',null,row.text)):null,row.memes?.length?h('p',null,'附加表情：'+row.memes.map(m=>m.name).join('、')):null,details[row.key]?.error?h('p',null,details[row.key].error):null,details[row.key]?.input?h(React.Fragment,null,h('h4',null,'读取的内容与上下文'),h(WorkContext,{input:details[row.key].input})):!details[row.key]?h('p',null,'正在读取操作详情…'):null,details[row.key]?.result?h(React.Fragment,null,h('h4',null,'模型判断'),h('p',null,details[row.key].result.summary)):null,details[row.key]?.trace?h('details',null,h('summary',null,'展开完整操作对话'),h('pre',null,details[row.key].trace)):null,h('button',{onClick:e=>{const d=e.currentTarget.closest('details.pet-log');if(d)d.open=false}},'收起 ↑')):null)),!logs.length?h('div',{className:'pet-empty'},'还没有记录，开始运行后会显示在这里。'):null)):null),
        drawer?h('div',{className:'pet-backdrop',onClick:e=>{if(e.target===e.currentTarget)setDrawer(false)}},h('section',{className:'pet-drawer',role:'dialog','aria-modal':true,'aria-label':creating?'新建宠物':'选择宠物',onKeyDown:e=>{if(e.key==='Escape')setDrawer(false)}},h('div',{className:'pet-drawer-header'},h('h2',null,creating?'新建一只宠物':'你的宠物'),h('button',{'aria-label':'关闭宠物抽屉',onClick:()=>{setDrawer(false);setCreating(false)}},'×')),error?h('div',{className:'pet-error'},error):null,drawerBody)):null,
        confirm?h('div',{className:'pet-backdrop',style:{zIndex:100,justifyContent:'center',alignItems:'center'}},h('section',{className:'pet-confirm',role:'dialog','aria-modal':true,'aria-label':confirm.kind==='delete'?'删除宠物':'重置聊天'},h('h2',null,confirm.kind==='delete'?'删除 '+confirm.name+'？':'重置和'+confirm.name+'的聊天？'),h('p',null,confirm.kind==='delete'?'将移除这只自定义宠物及聊天，无法撤销。已有工作日志保留。':'清空这只宠物的聊天上下文。人设、设置和工作日志保留。'),h('button',{disabled:busy,onClick:()=>setConfirm(null)},'取消'),h('button',{className:'pet-send',disabled:busy,onClick:()=>run(async()=>{await request(confirm.kind==='delete'?'/pets/delete':'/pets/reset-chat',confirm.kind==='delete'?{id:confirm.id}:{petId:confirm.id});setConfirm(null);setText('')})},'确认'+(confirm.kind==='delete'?'删除':'重置')),error?h('p',{role:'alert'},error):null)):null)
    }

    /* PET SHELL END */
    function ChatPanel() {
      const [open, setOpen] = React.useState(false)
      return h('div', { 'data-bd-dock': '' },
        h('button', { onClick: () => setOpen(!open), 'aria-expanded': open, 'aria-label': '刷 B站设置' }, '刷 B站 ' + (open ? '▴' : '▾')),
        open ? h('div', { 'data-bd-dock-body': '' }, h(Panel)) : null)
    }
    return { inject: ['slots'], apply(ctx) {
      const style = document.createElement('style'); style.setAttribute('data-plugin-css', 'dsh-bili-scroll'); style.textContent = CSS
      document.head.appendChild(style); ctx.effect(() => () => style.remove(), 'bili-scroll: 样式')
      const slots = ctx.get?.('slots') || ctx.slots
      if (!slots) return
      slots.inject('settings.section', () => slots.register({ name: 'settings.section', id: 'bili-scroll', order: 30, label: '刷 B站' }, () => h(Panel)))
      slots.inject('root', () => slots.register({ name: 'root', id: 'pet-shell', priority: -100 }, PetShell))
    } }
  },
})
