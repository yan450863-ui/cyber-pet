const clip = (text, max) => String(text || '').slice(0, max)

export const READING_DEFAULTS = { videoReadChars:600, videoFollowupChars:1200, allowVideoFollowup:true }
export function normalizeReading(src={}) {
  const limit=(key)=>Number.isFinite(Number(src[key]))?Math.max(100,Math.min(6000,Math.floor(Number(src[key])))):READING_DEFAULTS[key]
  return {videoReadChars:limit('videoReadChars'),videoFollowupChars:limit('videoFollowupChars'),allowVideoFollowup:typeof src.allowVideoFollowup==='boolean'?src.allowVideoFollowup:true}
}
export function canSupplement(group,cfg,overview) {
  const c=normalizeReading(cfg)
  if(!c.allowVideoFollowup||overview?.followup||overview?.unavailable)return false
  return group==='messages'?cfg.messageVideoContext!==false&&!overview:!!overview?.partial&&c.videoFollowupChars>c.videoReadChars
}
const timeLabel = sec => { const n=Math.max(0,Math.floor(Number(sec)||0));return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}` }
// Local selection, never another model call. Preserve actual cue timestamps when available.
export function excerpt(text, max = 600, {query='',cues=[]}={}) {
  text=String(text||'');max=Math.max(1,Math.floor(Number(max)||600))
  const originalChars=text.length, seen=new Set(), units=[]
  const source=cues.length?cues.map(c=>({text:String(c.text??c.content??''),from:c.from})):text.split(/\r?\n|(?<=[。！？!?])\s*/u).map(text=>({text}))
  for(const cue of source){
    const value=cue.text.replace(/\s+/g,' ').trim();if(!value||seen.has(value))continue;seen.add(value)
    for(let at=0;at<value.length;at+=200)units.push({text:value.slice(at,at+200),from:cue.from})
  }
  const render=u=>(Number.isFinite(Number(u.from))?`[${timeLabel(u.from)}] `:'')+u.text
  const full=units.map(render).join('\n')
  if(full.length<=max)return {text:full,originalChars,partial:full!==text,selection:full===text?'完整短文本':'本地去重'}
  const q=String(query).toLowerCase(),terms=[...new Set([...(q.match(/[a-z0-9_]{2,}/g)||[]),...(q.match(/[\p{Script=Han}]{2,}/gu)||[]).flatMap(s=>Array.from({length:Math.max(0,s.length-1)},(_,i)=>s.slice(i,i+2)))])].slice(0,80)
  const time=/(\d{1,3}):(\d{2})/.exec(q), target=time?Number(time[1])*60+Number(time[2]):null
  const ranked=units.map((u,i)=>({i,score:terms.reduce((n,t)=>n+(u.text.toLowerCase().includes(t)?1:0),0)+(target!==null&&Number.isFinite(Number(u.from))?100/(1+Math.abs(Number(u.from)-target)):0)})).sort((a,b)=>b.score-a.score||a.i-b.i)
  const relevant=ranked[0]?.score>0, anchors=relevant?ranked.filter(v=>v.score>0).slice(0,2).map(v=>v.i):[0,Math.floor(units.length/2),units.length-1]
  const per=Math.max(1,Math.floor((max-18)/anchors.length))
  const blocks=[...new Set(anchors)].sort((a,b)=>a-b).map(i=>{
    const start=i
    return units.slice(start,Math.min(units.length,i+2)).map(render).join('\n').slice(0,per)
  })
  return {text:blocks.join('\n[…]\n').slice(0,max),originalChars,partial:true,selection:relevant?'问题相关片段':'首中尾摘录'}
}

export function videoBrief(info) {
  return { title: clip(info.title, 160), description: clip(info.description, 240), author: clip(info.author, 60), duration: info.duration }
}
export function asksAboutVideo(text) {
  return /视频.{0,35}(讲|说|内容|介绍|总结|什么|怎么|为什么|哪|[?？])|(?:这段|片中|片段|画面|这集|这期|番剧).{0,35}(?:[?？]|怎么|为什么|什么|哪|解释)|讲了什么|视频内容|总结.{0,12}视频/s.test(String(text || ''))
}

export function threadBrief(thread, targetId, rootId) {
  const comments = new Map()
  const walk = value => {
    if (!value || typeof value !== 'object') return
    if (value.rpid) {
      const text = typeof value.content === 'string' ? value.content : value.content?.message
      if (text) comments.set(String(value.rpid), { rpid: String(value.rpid), parent: String(value.parent || 0), text: clip(text, 500) })
    }
    for (const v of Object.values(value)) if (v && typeof v === 'object') Array.isArray(v) ? v.forEach(walk) : walk(v)
  }
  walk(thread)
  const ids = [...new Set([String(rootId), comments.get(String(targetId))?.parent, String(targetId)].filter(id => id && id !== '0'))]
  return { comments: ids.map(id => comments.get(id)).filter(Boolean), partial: true,
    note: '仅提供根评论、可定位的父评论和本次回复目标，不包含整个评论区。' }
}

export function modelInput({ group, item, context, memories, persona, lightweight }) {
  const threadTexts=new Set((context.thread?.comments||[]).map(c=>c.text?.trim()))
  if(context.previousReplies)context={...context,previousReplies:[...new Set(context.previousReplies)].filter(t=>!threadTexts.has(t.trim()))}
  const note = item.notification?.item || {}
  const target=context.thread?.comments?.find(c=>String(c.rpid)===String(item.rpid))
  const notificationText=clip(note.source_content || note.title || note.content,500)
  const known=new Set([...(context.previousReplies||[]),...(context.thread?.comments||[]).map(c=>c.text)])
  return {
    persona: clip(persona, 2000),
    memories: memories.slice(-3).filter(m=>!known.has(m.text)&&!known.has(m.summary)).map(m => ({ summary: clip(m.summary, 180) })),
    item: { bvid: item.bvid, rpid: item.rpid, root: item.root, kind: item.kind,
      ...(target?.text?.trim()===notificationText.trim()?{}:{notificationText}) },
    context,
  }
}
