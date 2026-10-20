// 浏览口味是每只宠物的可编辑配置，不参与身份或安全边界定义。
export const VIDEO_TYPES = ['教程','评测','资讯','论文解读','剧情解说','剪辑','制作分析','日常','其他']
export const MODEL_NAMES = ['Claude','DeepSeek','ChatGPT','GPT','Gemini','豆包','通义千问','Qwen','Kimi','智谱GLM','腾讯元宝','Grok','Llama','MiniMax']
export const BROWSE_PRESETS = {
  modelPersona: { name:'模型拟人 / 同人整活', keywords:[...MODEL_NAMES.flatMap(name=>[name+' 拟人',name+' 同人']), '大模型拟人','大肥鱼','DeepSeek 鲸鱼娘','GPT 小龙娘'], types:['剧情解说','剪辑','日常','其他'], topic:'主体是大模型或AI助手角色的拟人、同人、动画短片、角色日常或整活。模型名字只是角色线索，不代表相关：技术教程、部署、论文、产品测评、资讯以及仅使用AI生成的无关视频均不符合本口味。根据角色、情节和互动评论，不强行讨论技术。', days:30, order:'recent_hot', freshDays:7, strictness:'strict', exploration:0 },
  mixed: { name:'混合', keywords:['人工智能应用','大模型评测','二次元日常','动画制作分析'], types:VIDEO_TYPES },
  practical: { name:'AI实用派', keywords:['AI工具教程','大模型应用实测','AI Agent开发'], types:['教程','评测','资讯'] },
  papers: { name:'AI论文派', keywords:['大模型论文解读','多模态模型论文','人工智能研究进展'], types:['论文解读','制作分析','资讯'] },
  anime: { name:'二次元日常', keywords:['二次元日常','番剧推荐','动漫角色讨论'], types:['日常','评测','资讯'] },
  animation: { name:'动画赏析', keywords:['动画演出分析','动画制作解析','动画剧情解读'], types:['制作分析','剧情解说','评测'] },
}
export const BROWSE_DEFAULTS = { browsePreset:'custom', browseTypes:VIDEO_TYPES, browseStrictness:'standard', browseExplorationPercent:0, browseTopic:'', browseDays:0, browseOrder:'pubdate', browseFreshDays:7, browseAuthorMode:'prefer', browsePreferredUids:[], browseBlockedUids:[], browseFeedback:[] }
export function presetPatch(id) {
  const p=BROWSE_PRESETS[id]; if(!p)return {}
  return { browsePreset:id,keywords:[...p.keywords],browseTypes:[...p.types],browseTopic:p.topic||'',browseDays:p.days??0,browseOrder:p.order||'pubdate',browseFreshDays:p.freshDays??7,browseStrictness:p.strictness||'standard',browseExplorationPercent:p.exploration??0 }
}
export function feedbackEntries(cfg) {
  return (cfg.browseFeedback||[]).flatMap(s=>{try{const v=JSON.parse(s);return typeof v.key==='string' && v.key.length<200 && VIDEO_TYPES.includes(v.type) && ['more','less','block'].includes(v.mode)?[v]:[]}catch{return []}}).slice(-100)
}
export function normalizeBrowse(src={}) {
  const c={...BROWSE_DEFAULTS,...src}
  return {
    browsePreset:src.browsePreset==='custom'||BROWSE_PRESETS[src.browsePreset]?src.browsePreset:'custom',
    browseTypes:Array.isArray(c.browseTypes)?[...new Set(c.browseTypes.filter(v=>VIDEO_TYPES.includes(v)))]:[...VIDEO_TYPES],
    browseStrictness:['loose','standard','strict'].includes(c.browseStrictness)?c.browseStrictness:'standard',
    browseExplorationPercent:Math.max(0,Math.min(100,Math.floor(Number(c.browseExplorationPercent)||0))),
    browseTopic:typeof c.browseTopic==='string'?c.browseTopic.trim().slice(0,2000):'',
    browseDays:Math.max(0,Math.min(365,Math.floor(Number(c.browseDays)||0))),
    browseOrder:['pubdate','recent_hot','click','totalrank'].includes(c.browseOrder)?c.browseOrder:'pubdate',
    browseFreshDays:Math.max(0,Math.min(365,Math.floor(Number(c.browseFreshDays)||0))),
    browseAuthorMode:c.browseAuthorMode==='only'?'only':'prefer',
    ...Object.fromEntries(['browsePreferredUids','browseBlockedUids'].map(k=>[k,[...new Set((Array.isArray(c[k])?c[k]:[]).filter(v=>/^\d{1,20}$/.test(String(v))&&Number(v)>0).map(String))].slice(0,100)])),
    browseFeedback:feedbackEntries(c).map(v=>JSON.stringify({key:v.key,type:v.type,mode:v.mode})),
  }
}
export function videoType(item) {
  const s=`${item.title||''} ${item.description||''}`
  for(const [type,re] of [['论文解读',/论文|arxiv|paper/i],['制作分析',/演出分析|制作解析|制作分析|作画|分镜/],['教程',/教程|入门|教学|实战|开发|手把手/],['评测',/评测|测评|实测|对比/],['剧情解说',/剧情|大结局|故事解说|结局解析/],['剪辑',/混剪|剪辑|AMV|MAD/i],['资讯',/发布|官宣|新闻|资讯|进展/],['日常',/日常|闲聊|角色讨论|番剧推荐/]])if(re.test(s))return type
  return '其他'
}
export function typePreference(cfg,type) {
  const rows=feedbackEntries(cfg).filter(v=>v.type===type)
  return rows.some(v=>v.mode==='block')?'block':rows.at(-1)?.mode||''
}
export function exploration(item,cfg) {
  let hash=0;for(const c of item.bvid||'')hash=(hash*31+c.charCodeAt(0))>>>0
  return hash%100<normalizeBrowse(cfg).browseExplorationPercent
}
export function browseGate(item,cfg,{semantic=false}={}) {
  const c=normalizeBrowse(cfg),uid=String(item.author_uid||item.owner?.mid||'')
  if(c.browseDays>0){
    const stamp=Number(item.pubdate)*1000
    if(!Number.isFinite(stamp)||stamp<=0)return '无法核验发布时间，已跳过'
    if(stamp<Date.now()-c.browseDays*864e5||stamp>Date.now()+864e5)return '不在设定的近期时间范围内'
  }
  if(uid&&c.browseBlockedUids.includes(uid))return '命中屏蔽UP UID'
  if(c.browseAuthorMode==='only'&&(!uid||!c.browsePreferredUids.includes(uid)))return '不在指定UP UID列表内（或无法核验UID）'
  const type=semantic?item.videoType:videoType(item)
  if(typePreference(c,type)==='block')return `已设置不看这类：${type}`
  if(type&&type!=='其他'&&!c.browseTypes.includes(type))return `未选择视频类型：${type}`
  if(!c.browseTypes.length)return '未选择任何视频类型'
  if(semantic && (item.interest || c.browseStrictness==='strict' || c.browseTypes.length<VIDEO_TYPES.length || c.browsePreset!=='custom')){
    if(!VIDEO_TYPES.includes(type))return '无法确认视频类型，已跳过'
    if(!c.browseTypes.includes(type))return `未选择视频类型：${type}`
    if(item.interest==='mismatch')return '内容偏离当前浏览口味'
    if(item.interest!=='match'&&c.browseStrictness!=='loose'&&!exploration(item,c))return '相关性不明确，未启用此次探索'
    if(c.browseStrictness==='strict'&&item.interest==='match'&&item.interestEvidence!==true)return '严格模式缺少明确相关性证据'
  }
  return ''
}
export function browsePrompt(cfg) {
  const c=normalizeBrowse(cfg)
  const compact={keywords:cfg.keywords||[],topic:c.browseTopic,types:c.browseTypes,strictness:c.browseStrictness,explorationPercent:c.browseExplorationPercent,preferences:Object.fromEntries(VIDEO_TYPES.map(v=>[v,typePreference(c,v)]).filter(([,v])=>v))}
  return '\n浏览口味（只约束主动刷视频，不妨碍正常@回复）：'+JSON.stringify(compact)+'。主动视频判断必须额外返回videoType（教程/评测/资讯/论文解读/剧情解说/剪辑/制作分析/日常/其他）、interest（match/uncertain/mismatch）、interestEvidence（布尔值，资料中有明确证据才true）。按实际主体内容判断，不能因为标题带AI、动画就认定相关；AI生成的无关领域素材不等于AI技术视频。more优先、less尽量少选；block和未选类型必须跳过。严格模式要求主体高度相关、资料有证据；标准模式主体相关；宽松模式允许同一工作范围内的间接相关。探索仅允许相关性不确定的内容，不绕过类型、UP、屏蔽或固定工作边界。判断理由写summary，不增加一次模型调用。'
}
export const browseSignature=cfg=>JSON.stringify([normalizeBrowse(cfg),cfg.keywords||[],cfg.excludedWords||[]])
export function recentCandidate(item,cfg,now=Date.now()) {
  const days=normalizeBrowse(cfg).browseDays
  if(!days)return true
  const stamp=Number(item.pubdate)*1000
  return Number.isFinite(stamp)&&stamp>0&&stamp>=now-days*864e5&&stamp<=now+864e5
}
export function heat(item){
  const count=value=>{const s=String(value??'0').replace(/,/g,'');const n=parseFloat(s);return Number.isFinite(n)?n*(s.includes('亿')?1e8:s.includes('万')?1e4:1):0}
  return count(item.play)+5*count(item.danmaku)+10*count(item.review)
}
export function comparePopularity(a,b,cfg,now=Date.now()) {
  const c=normalizeBrowse(cfg)
  if(c.browseOrder==='recent_hot'){
    const fresh=v=>c.browseFreshDays>0&&Number(v.pubdate)*1000>=now-c.browseFreshDays*864e5?1:0
    return fresh(b)-fresh(a)||heat(b)-heat(a)||Number(b.pubdate)-Number(a.pubdate)
  }
  if(c.browseOrder==='click')return heat(b)-heat(a)
  return 0
}
