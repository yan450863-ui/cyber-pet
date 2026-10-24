import { CYCLE_DEFAULTS, normalizeCycle } from './cycle.mjs'
import { READING_DEFAULTS, normalizeReading } from './reading.mjs'
export const XHS_DEFAULTS = {
  ...CYCLE_DEFAULTS, ...READING_DEFAULTS, independentMessages:true,
  autoComment:false, replyToComments:false, messagesNewOnly:true, messageVideoContext:true,
  keywords:['大模型 拟人','Claude 拟人','DeepSeek 大肥鱼','GPT 小龙娘','Gemini 拟人','模型 同人','二次元 动画'],
  topic:'以大模型拟人、同人角色、动画和二次元内容为主，模型名字只是线索，纯硬件、带货和无关科技资讯跳过。',
  workScope:'AI、大模型、模型拟人、二次元与动画相关笔记和视频的理解、评论，以及其下的@和评论回复。',
  sortBy:'最多点赞', publishTime:'一周内', noteType:'不限',
  maxCommentChars:80, maxReplyChars:160, dailyTokenBudget:0, replyReserveTokens:0,
  maxThreadReplies:3,
}
export function normalizeXhs(src={}) {
  const out={...XHS_DEFAULTS,...normalizeCycle({...XHS_DEFAULTS,...src}),...normalizeReading(src)}
  for(const key of ['autoComment','replyToComments','messagesNewOnly','messageVideoContext'])out[key]=typeof src[key]==='boolean'?src[key]:XHS_DEFAULTS[key]
  for(const key of ['topic','workScope'])out[key]=typeof src[key]==='string'&&src[key].trim()?src[key].trim().slice(0,4000):XHS_DEFAULTS[key]
  out.keywords=Array.isArray(src.keywords)?[...new Set(src.keywords.filter(v=>typeof v==='string'&&v.trim()).map(v=>v.trim().slice(0,80)))].slice(0,60):[...XHS_DEFAULTS.keywords]
  for(const [key,values] of Object.entries({sortBy:['综合','最新','最多点赞','最多评论','最多收藏'],publishTime:['不限','一天内','一周内','半年内'],noteType:['不限','视频','图文']}))out[key]=values.includes(src[key])?src[key]:XHS_DEFAULTS[key]
  for(const key of ['maxCommentChars','maxReplyChars','dailyTokenBudget','replyReserveTokens','maxThreadReplies']) {
    const min=key.startsWith('max')&&key.endsWith('Chars')?1:0,max=key.endsWith('Chars')?1000:100000000
    out[key]=Number.isFinite(Number(src[key]))?Math.max(min,Math.min(max,Math.floor(Number(src[key])))):XHS_DEFAULTS[key]
  }
  return out
}
export function xhsPatch(body,current) {
  const clean=Object.fromEntries(Object.entries(body).filter(([k])=>Object.hasOwn(XHS_DEFAULTS,k)))
  for(const [k,v] of Object.entries(clean)) {
    const base=XHS_DEFAULTS[k]
    if(typeof base==='number'&&(!Number.isInteger(Number(v))||v===''||Number(v)<(k.endsWith('IntervalSec')||k==='cooldownSec'||k.endsWith('Chars')?1:0)))throw Error(k+'：请填写有效整数')
    if(typeof base==='boolean'&&typeof v!=='boolean')throw Error(k+'：开关格式错误')
  }
  if(clean.keywords && (!Array.isArray(clean.keywords)||!clean.keywords.length))throw Error('请至少填写一个搜索关键词')
  return normalizeXhs({...current,...clean})
}
