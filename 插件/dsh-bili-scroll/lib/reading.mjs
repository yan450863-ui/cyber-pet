const clip = (text, max) => String(text || '').slice(0, max)

// 纯本地摘录，不调用模型做第二次总结；明确标记资料来源和截断。
export function excerpt(text, max = 2400) {
  text = String(text || '')
  if (text.length <= max) return { text, originalChars: text.length, partial: false }
  const size = Math.floor((max - 60) / 6)
  return { text: Array.from({ length: 6 }, (_, i) => {
    const start = Math.floor((text.length - size) * i / 5)
    return text.slice(start, start + size)
  }).join('\n[…中间省略…]\n'), originalChars: text.length, partial: true }
}

export function videoBrief(info) {
  return { title: clip(info.title, 160), description: clip(info.description, 600), author: clip(info.author, 60), duration: info.duration }
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
  if (!lightweight && group === 'video') return { persona, memories: memories.slice(-15), item, context }
  const note = item.notification?.item || {}
  return {
    persona: clip(persona, 2000),
    memories: memories.slice(-3).map(m => ({ summary: clip(m.summary, 180) })),
    item: { bvid: item.bvid, rpid: item.rpid, root: item.root, kind: item.kind,
      notificationText: clip(note.source_content || note.title || note.content, 500) },
    context,
  }
}
