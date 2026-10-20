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
