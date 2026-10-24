const short = (v, n = 500) => String(v || '').slice(0, n)
const identity = v => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(v) ? v : ''

// Only the host holds xsec tokens. Normalized model inputs contain text, never cookies/tokens.
export function xhsFeed(raw) {
  const card = raw.noteCard || raw.note_card || raw
  return { id:identity(raw.id || raw.note_id), token:short(raw.xsecToken || raw.xsec_token, 2000),
    title:short(card.displayTitle || card.display_title || card.title, 180),
    description:short(card.desc || card.description, 12000), author:short(card.user?.nickname, 80),
    type:short(card.type || 'normal', 30), authorId:identity(card.user?.userId || card.user?.user_id) }
}
export function xhsNotification(raw) {
  const commentId = identity(raw.comment_id)
  if (!commentId) return null
  const id = identity(raw.id) || commentId
  const time = Number(raw.time)
  return { id, commentId, feedId:identity(raw.feed_id), token:short(raw.feed_xsec_token,2000),
    title:short(raw.feed_title,180), text:short(raw.comment_text || raw.title,1000), author:short(raw.from?.nickname,80),
    authorId:identity(raw.from?.user_id), time:Number.isFinite(time) ? (time > 1e12 ? time : time*1000) : 0 }
}
export class XhsClient {
  constructor({ connection, fetchImpl = fetch }) { this.connection = connection; this.fetch = fetchImpl; this.queue = Promise.resolve() }
  request(path, body, { signal, timeout = 120000, method } = {}) {
    const run = async () => {
      signal?.throwIfAborted()
      const cfg = this.connection()
      const base = new URL(cfg.url)
      if (base.protocol !== 'http:' || !['127.0.0.1','localhost','[::1]'].includes(base.hostname) || base.username || base.password || base.search || base.hash || base.pathname !== '/') throw Error('小红书服务只能连接本机回环地址')
      const abort = signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout)
      const response = await this.fetch(new URL(path, base), { method:method || (body === undefined ? 'GET' : 'POST'), redirect:'error', signal:abort,
        headers:{ ...(cfg.token ? { Authorization:'Bearer '+cfg.token } : {}), ...(body === undefined ? {} : {'Content-Type':'application/json'}) },
        ...(body === undefined ? {} : {body:JSON.stringify(body)}) })
      const raw = await response.text()
      if (raw.length > 4_000_000) throw Error('小红书服务返回内容过大')
      let result; try { result = JSON.parse(raw) } catch { throw Error('小红书服务未返回JSON，请检查版本') }
      if (!response.ok || result.success === false || result.error) throw Error('小红书接口失败（'+response.status+'）：'+short(result.error || result.message || result.code,200))
      return result.data ?? result
    }
    const job = this.queue.then(run); this.queue = job.catch(()=>{}); return job
  }
  async check(signal) { const v = await this.request('/api/v1/login/status',undefined,{signal}); return { loggedIn:v.is_logged_in === true, username:short(v.username,80) } }
  async qr(signal) {
    const v = await this.request('/api/v1/login/qrcode',undefined,{signal})
    if (v.is_logged_in) return { loggedIn:true }
    let image = v.img || v.image || v.qrcode
    if (typeof image !== 'string') throw Error('未生成登录二维码')
    if (!image.startsWith('data:')) image = 'data:image/png;base64,'+image
    if (!/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=\r\n]+$/.test(image) || image.length > 2_000_000) throw Error('二维码格式无效')
    return { loggedIn:false, image, timeout:short(v.timeout,100) }
  }
  logout(signal) { return this.request('/api/v1/login/cookies',undefined,{signal,method:'DELETE'}) }
  async search(keyword, filters, signal) {
    const v = await this.request('/api/v1/feeds/search',{keyword,filters},{signal})
    if (!Array.isArray(v.feeds)) throw Error('搜索返回格式不兼容，请更新小红书服务')
    return v.feeds.map(xhsFeed).filter(v=>v.id && v.token).slice(0,20)
  }
  async detail(feed, signal) {
    const v = await this.request('/api/v1/feeds/detail',{feed_id:feed.id,xsec_token:feed.token,load_all_comments:false},{signal})
    const data = v.data || v
    const card = data.note || data.noteCard || data.note_card
    if (!card || typeof card !== 'object') throw Error('笔记详情格式不兼容')
    const info = { ...feed, ...xhsFeed({id:feed.id, xsecToken:feed.token,noteCard:card}) }
    const comments = Array.isArray(data.comments?.list) ? data.comments.list : []
    return { info, comments:comments.slice(0,3).map(c=>({id:identity(c.id),text:short(c.content,300)})) }
  }
  async notifications(signal) {
    const v = await this.request('/api/v1/notifications/list',{tab:'mentions',limit:50},{signal})
    if (!Array.isArray(v.items)) throw Error('通知接口不兼容，请安装支持评论和@通知的新版本')
    return v.items.map(xhsNotification).filter(Boolean)
  }
  comment(feed, content, signal) { return this.request('/api/v1/feeds/comment',{feed_id:feed.id,xsec_token:feed.token,content},{signal}) }
  reply(item, content, signal) { return this.request('/api/v1/notifications/reply',{comment_id:item.commentId,content},{signal}) }
}
