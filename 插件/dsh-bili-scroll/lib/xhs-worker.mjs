import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { decisionOf } from './cycle-worker.mjs'
import { personalityOf } from './pet-profile.mjs'
import { excerpt, asksAboutVideo } from './reading.mjs'
import { budgetBlocked, addUsage, todayUsage, maintainFiles } from './activity.mjs'
import { withinHours } from './cycle.mjs'

export function createXhsWorker({home,config,client,judge,now=Date.now}) {
  mkdirSync(home,{recursive:true})
  const file=join(home,'memory.json')
  let ledger={seen:{},sent:{},memories:[],events:[],inboxes:{},cursors:{}}
  if(existsSync(file)) {
    ledger=JSON.parse(readFileSync(file,'utf8'))
    if(!ledger.seen||!ledger.sent||!Array.isArray(ledger.events)||!ledger.inboxes)throw Error('小红书去重记录损坏，已保留文件并停止')
  }
  ledger.memories ||= [];ledger.cursors ||= {}
  const save=()=>{writeFileSync(file+'.tmp',JSON.stringify(ledger));renameSync(file+'.tmp',file)}
  const queues=new Map()
  const record=(group,item,decision,outcome,input)=>{
    const cfg=config(),row={at:now(),group,key:item.key,petId:cfg.petId,title:item.title||item.feedId||'评论和@',summary:decision.summary||'',text:decision.text||'',outcome,taskId:decision.taskId}
    ledger.events.push(row);ledger.events=ledger.events.slice(-500)
    if(input) { ledger.details ||= {};ledger.details[item.key]={input,result:decision};const keys=Object.keys(ledger.details);for(const k of keys.slice(0,-150))delete ledger.details[k] }
    ledger.seen[item.key]={at:now(),outcome}
    for(const key of item.coalescedKeys||[])ledger.seen[key]={at:now(),outcome:'已合并回复'}
    ledger.memories.push({...row,thread:item.thread});ledger.memories=ledger.memories.slice(-200)
    save()
  }
  async function primeInbox(signal) {
    const cfg=config(),id=cfg.petId
    if(!cfg.messagesEnabled)return
    let box=ledger.inboxes[id]
    if(!box||box.newOnly!==cfg.messagesNewOnly)box=ledger.inboxes[id]={since:Math.floor(now()/1000)*1000,newOnly:cfg.messagesNewOnly,ready:false}
    if(!box.ready) {
      if(cfg.messagesNewOnly){const rows=await client.notifications(signal);signal.throwIfAborted();for(const r of rows)ledger.seen['message:'+r.commentId]||={at:now(),outcome:'启用前已有通知'}}
      box.ready=true;save()
    }
  }
  const choose=async(group,signal)=>{
    const cfg=config(),id=cfg.petId
    if(group==='video') {
      let q=queues.get(id)
      const signature=JSON.stringify([cfg.keywords,cfg.topic,cfg.sortBy,cfg.publishTime,cfg.noteType])
      if(!q||q.signature!==signature){q={signature,items:[]};queues.set(id,q)}
      q.items=q.items.filter(v=>!ledger.seen['video:'+v.id])
      if(!q.items.length) {
        for(let i=0;i<Math.min(2,cfg.keywords.length);i++) {
          const at=ledger.cursors[id]||0;ledger.cursors[id]=at+1;save()
          const rows=await client.search(cfg.keywords[at%cfg.keywords.length],{sort_by:cfg.sortBy,publish_time:cfg.publishTime,note_type:cfg.noteType},signal)
          signal.throwIfAborted()
          q.items=rows.filter(v=>!ledger.seen['video:'+v.id]);if(q.items.length)break
        }
      }
      const feed=q.items.shift()
      return feed?{...feed,feedId:feed.id,key:'video:'+feed.id,thread:'feed:'+feed.id}:null
    }
    await primeInbox(signal)
    const box=ledger.inboxes[id],rows=await client.notifications(signal)
    signal.throwIfAborted()
    const fresh=rows.filter(v=>!ledger.seen['message:'+v.commentId]&&(!cfg.messagesNewOnly||v.time>=box.since))
    const item=fresh[0];if(!item)return null
    const extras=fresh.filter(v=>v!==item&&item.feedId&&v.feedId===item.feedId&&item.authorId&&v.authorId===item.authorId).slice(0,3)
    return {...item,key:'message:'+item.commentId,thread:'feed:'+item.feedId+':user:'+item.authorId,
      coalescedKeys:extras.map(v=>'message:'+v.commentId),extraTexts:extras.map(v=>v.text)}
  }
  async function step(group,{signal}) {
    const cfg={...config()},signature=JSON.stringify(personalityOf(cfg)),petId=cfg.petId
    if(budgetBlocked(ledger,cfg,group))return {empty:true,budget:true}
    const item=await choose(group,signal)
    signal.throwIfAborted();if(!item)return {empty:true}
    if(ledger.sent[item.key]){record(group,item,{summary:'此条已有发送尝试，结果未知也不重发'},'未重复发送');return {}}
    if(group==='messages'&&cfg.maxThreadReplies>0&&Object.values(ledger.sent).filter(s=>s.thread===item.thread&&s.state==='accepted'&&now()-s.at<864e5).length>=cfg.maxThreadReplies){record(group,item,{summary:'本笔记与该用户的24小时回复次数已达到上限'},'已跳过');return {}}
    let detail=null
    const needsDetail=group==='video'||cfg.messageVideoContext&&asksAboutVideo(item.text)
    if(needsDetail&&item.feedId&&item.token)detail=await client.detail({id:item.feedId,token:item.token},signal)
    signal.throwIfAborted()
    const info=detail?.info||item
    item.title=info.title||item.title
    const input={platform:'xiaohongshu',item:{id:item.feedId,commentId:item.commentId,notificationText:item.text,extraTexts:item.extraTexts},
      context:{info:{title:info.title,author:info.author,type:info.type},
        ...(detail?{overview:{source:'小红书笔记文字（未读取画面或音频）',...excerpt(info.description,cfg.videoReadChars)}}:{}),
        ...(group==='messages'?{thread:{comments:[{rpid:item.commentId,text:item.text},...(item.extraTexts||[]).map(text=>({text}))]}}:{comments:detail?.comments||[]})},
      memories:ledger.memories.filter(m=>m.petId===petId&&m.thread===item.thread).slice(-3).map(m=>({summary:m.summary,text:m.text}))}
    if(group==='messages'&&item.feedId)input.context.sameNoteOwnComments=ledger.memories.filter(m=>m.petId===petId&&m.group==='video'&&m.thread==='feed:'+item.feedId&&m.text).slice(-1).map(m=>({text:m.text,note:'同笔记中本宠物之前的发言，不保证是该通知的父评论'}))
    const think=async()=>{
      try { const result=await judge(group,input,signal);addUsage(ledger,group,result.usage,result.estimate||JSON.stringify(input).length/2,now());save();return {...decisionOf(result.raw),taskId:result.taskId} }
      catch(e){addUsage(ledger,group,e.usage,JSON.stringify(input).length/2,now());save();throw e}
    }
    let decision=await think()
    signal.throwIfAborted()
    if(decision.action==='read_video'&&cfg.allowVideoFollowup&&(group!=='messages'||cfg.messageVideoContext)&&item.feedId&&item.token&&!budgetBlocked(ledger,config(),group)) {
      detail ||= await client.detail({id:item.feedId,token:item.token},signal)
      input.context.overview={source:'小红书笔记文字（按问题补读）',...excerpt(detail.info.description,cfg.videoFollowupChars,{query:item.text}),followup:true,unavailable:!detail.info.description}
      decision=await think();signal.throwIfAborted()
    }
    if(decision.action!=='reply'){record(group,item,decision,'已跳过',input);return {}}
    let current=config()
    const enabled=c=>group==='video'?c.autoComment:c.replyToComments
    let reason=''
    if(group==='video'&&(decision.interest!=='match'||!decision.interestEvidence))reason='主题相关证据不足'
    else if(!enabled(current))reason='已保存草稿，自动发送关闭'
    else if(petId!==current.petId||signature!==JSON.stringify(personalityOf(current)))reason='宠物或性格已变更，旧判断未发布'
    else if(group==='video'&&JSON.stringify([cfg.topic,cfg.keywords,cfg.workScope])!==JSON.stringify([current.topic,current.keywords,current.workScope]))reason='浏览要求已变更，旧判断未发布'
    else if(Array.from(decision.text).length>current[group==='video'?'maxCommentChars':'maxReplyChars'])reason='正文超过字数上限'
    else if(/等待.{0,12}(确认|发送)|准备好.{0,12}(确认|发送)|请.{0,8}确认.{0,8}发送/.test(decision.text))reason='正文仍有待发送说明'
    else if(Object.values(ledger.sent).some(s=>s.thread===item.thread&&s.text.replace(/\s/g,'')===decision.text.replace(/\s/g,'')))reason='同一讨论正文重复'
    if(reason){record(group,item,decision,reason,input);return {}}
    const delay=current.cooldownSec*1000-(now()-(ledger.lastSentAt||0))
    if(delay>0)await new Promise((resolve,reject)=>{
      const end=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);resolve()},abort=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);reject(signal.reason)}
      const timer=setTimeout(end,delay);signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort()
    })
    signal.throwIfAborted();current=config()
    if(!enabled(current)||!current[group+'Enabled']||!withinHours(new Date(now()),current)||current.petId!==petId||JSON.stringify(personalityOf(current))!==signature||Array.from(decision.text).length>current[group==='video'?'maxCommentChars':'maxReplyChars']||JSON.stringify([cfg.topic,cfg.keywords,cfg.workScope])!==JSON.stringify([current.topic,current.keywords,current.workScope])){record(group,item,decision,'设置或运行时段已变更，未发送',input);return {}}
    ledger.sent[item.key]={at:now(),thread:item.thread,state:'pending',text:decision.text};ledger.lastSentAt=now();save()
    try {
      const receipt=group==='video'?await client.comment(item,decision.text,signal):await client.reply(item,decision.text,signal)
      ledger.sent[item.key].state='accepted';save()
      record(group,item,decision,'接口已接受，公开可见性未核实',input)
      // Keep only non-sensitive receipt status; never copy raw session/transport data into logs.
      return {accepted:receipt?.success!==false}
    } catch(e){record(group,item,decision,'发送结果未知，不自动重发',input);throw e}
  }
  return {
    step,primeInbox,
    status:()=>({usage:todayUsage(ledger,now()),lastSentAt:ledger.lastSentAt}),
    logs:group=>ledger.events.filter(r=>r.petId===config().petId&&r.group===group).slice(-150).reverse(),
    detail:key=>{if(!ledger.events.some(e=>e.key===key&&e.petId===config().petId))throw Error('日志不存在');return ledger.details?.[key]||{}},
    maintain:()=>maintainFiles(home,{retentionDays:7},now()),
  }
}
