import { existsSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const ACTIVITY_DEFAULTS = {
  dailyTokenBudget: 0, replyReserveTokens: 0, maxThreadReplies: 3,
  cacheMinutes: 360, retentionDays: 7, autoVerify: true,
  excludedWords: [], preferredAuthors: [], aiWeight: 1, llmWeight: 1, animeWeight: 1, animationWeight: 1,
}
export const chinaDay = (now = Date.now()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
export const threadKey = item => `${item.bvid}:${item.root || item.rpid || 0}`
export function relevantMemories(memories, item) {
  return memories.filter(m => m.bvid === item.bvid && (!item.root || String(m.root) === String(item.root))).slice(-3)
}
export function usageTotal(usage) {
  const n = v => Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : 0
  return n(usage?.totalTokens) || n(usage?.inputTokens) + n(usage?.outputTokens) + n(usage?.cacheReadTokens) + n(usage?.cacheWriteTokens)
}
export function todayUsage(ledger, now = Date.now()) {
  return ledger.usage?.[chinaDay(now)] || { video: 0, messages: 0, measured: 0, estimated: 0, calls: 0 }
}
export function budgetBlocked(ledger, cfg, group, now = Date.now()) {
  if (!(cfg.dailyTokenBudget > 0)) return false
  const u = todayUsage(ledger, now), total = (u.video || 0) + (u.messages || 0)
  const limit = group === 'video' ? Math.max(0, cfg.dailyTokenBudget - (cfg.replyReserveTokens || 0)) : cfg.dailyTokenBudget
  return total >= limit
}
export function addUsage(ledger, group, usage, estimate, now = Date.now()) {
  ledger.usage ||= {}
  const day = chinaDay(now), u = ledger.usage[day] ||= { video: 0, messages: 0, measured: 0, estimated: 0, calls: 0 }
  const measured = usage && usageTotal(usage) > 0
  const tokens = measured ? usageTotal(usage) : Math.max(1, Math.ceil(estimate))
  u[group] = (u[group] || 0) + tokens; u[measured ? 'measured' : 'estimated'] += tokens; u.calls++
  for (const d of Object.keys(ledger.usage).sort().slice(0, -90)) delete ledger.usage[d]
  return { tokens, estimated: !measured }
}
export function keywordWeight(keyword, cfg) {
  if (/大模型|deepseek|gpt|llm|agent|多模态|模型/i.test(keyword)) return cfg.llmWeight ?? 1
  if (/二次元|动漫|番剧|国创/.test(keyword)) return cfg.animeWeight ?? 1
  if (/动画|制作|演出/.test(keyword)) return cfg.animationWeight ?? 1
  return cfg.aiWeight ?? 1
}
export function contentFilter(item, cfg) {
  const text = `${item.title || ''}\n${item.description || ''}\n${item.author || ''}`.toLowerCase()
  return (cfg.excludedWords || []).find(w => w && text.includes(w.toLowerCase()))
}
// 只清理本插件生成的 UUID 任务文件；不碰凭证、发送账本、日报和未知资料。
export function maintainFiles(home, cfg, now = Date.now()) {
  const days = Math.max(1, cfg.retentionDays || 7), dir = join(home, 'decisions')
  if (existsSync(dir)) for (const name of readdirSync(dir)) {
    if (!/^[\da-f-]{36}(?:-input|-usage|-trace)?\.(?:json|log)$/i.test(name)) continue
    const file = join(dir, name)
    try { if (now - statSync(file).mtimeMs > days * 864e5) unlinkSync(file) } catch {}
  }
  const log = join(home, 'duty.log')
  try {
    if (statSync(log).size > 2 * 1024 * 1024) {
      const text = readFileSync(log, 'utf8')
      writeFileSync(log, '日志已截短，保留最近内容\n' + text.slice(-1024 * 1024), 'utf8')
    }
  } catch {}
}
