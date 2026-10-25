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
