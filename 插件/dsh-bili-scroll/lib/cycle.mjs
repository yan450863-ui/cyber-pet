// 单步串行执行，两组交替选取；计时从操作结束时开始。
export const CYCLE_DEFAULTS = {
  videoEnabled: true, videoCount: 5, videoIntervalSec: 60,
  messagesEnabled: true, messagesCount: 5, messagesIntervalSec: 30,
  restMinutes: 10, maxRounds: 0, timeLimited: false,
  timeStart: '00:00', timeEnd: '00:00', cooldownSec: 60,
  independentMessages: false,
}

export function normalizeCycle(src) {
  const out = {}
  for (const [key, base] of Object.entries(CYCLE_DEFAULTS)) {
    const v = src[key]
    if (typeof base === 'boolean') out[key] = typeof v === 'boolean' ? v : base
    else if (typeof base === 'number') out[key] = Number.isFinite(Number(v))
      ? Math.max(key.endsWith('IntervalSec') || key === 'cooldownSec' ? 1 : 0, Math.min(1e6, Math.floor(Number(v)))) : base
    else out[key] = /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : base
  }
  return out
}

export function withinHours(date, cfg) {
  if (!cfg.timeLimited || cfg.timeStart === cfg.timeEnd) return true
  const now = date.getHours() * 60 + date.getMinutes()
  const minutes = s => Number(s.slice(0, 2)) * 60 + Number(s.slice(3))
  const start = minutes(cfg.timeStart), end = minutes(cfg.timeEnd)
  return start < end ? now >= start && now < end : now >= start || now < end
}

export class Cycle {
  constructor({ config, step, save, state = {}, now = Date.now, onError = () => {} }) {
    Object.assign(this, { config, step, save, now, onError })
    this.state = { round: 1, completed: 0, counts: { video: 0, messages: 0 },
      done: {}, next: {}, turn: 'video', restUntil: 0, ...state,
      running: false, phase: state.phase === 'complete' ? 'complete' : state.running || state.phase === 'paused' ? 'paused' : 'stopped',
      error: state.running ? '程序重启，点击开始继续已保存进度' : '' }
    this.busy = false
    this.commit()
  }
  commit() { this.save(structuredClone(this.state)) }
  start({ once = false } = {}) {
    if (this.busy || (this.state.running && !['resting', 'waiting', 'budget'].includes(this.state.phase))) return { ok: false, error: '当前操作尚未结束' }
    const cfg = this.config()
    if (!cfg.videoEnabled && !cfg.messagesEnabled) return { ok: false, error: '请至少启用一个任务组' }
    const groups = ['video', 'messages'].filter(g => cfg[g + 'Enabled'] && !(cfg.independentMessages && !once && g === 'messages'))
    const exhausted = groups.length && groups.every(g => this.state.done[g] || (cfg[g + 'Count'] > 0 && this.state.counts[g] >= cfg[g + 'Count']))
    if (this.state.phase === 'complete' || this.state.restUntil || exhausted) this.newRound()
    this.state.restUntil = 0
    this.state.next = {}
    Object.assign(this.state, { running: true, once, phase: 'running', error: '', completed: 0 })
    this.controller = new AbortController()
    this.commit()
    return { ok: true, started: true }
  }
  stop() {
    this.state.running = false
    this.state.phase = 'paused'
    this.controller?.abort(new Error('用户停止'))
    this.commit()
    return { ok: true, stopped: true }
  }
  newRound() {
    const messageNext = this.config().independentMessages ? this.state.next.messages : undefined
    Object.assign(this.state, { round: this.state.round + 1, counts: { video: 0, messages: 0 },
      done: {}, next: {}, restUntil: 0, turn: 'video' })
    if (messageNext !== undefined) this.state.next.messages = messageNext
  }
  async tick() {
    if (!this.state.running || this.busy) return
    this.busy = true
    try {
      const s = this.state, cfg = this.config(), now = this.now()
      if (!withinHours(new Date(now), cfg)) { s.phase = 'outside-hours'; this.commit(); return }
      if (s.restUntil && s.restMinutesAt !== cfg.restMinutes) {
        s.restUntil = (s.restStartedAt || now) + cfg.restMinutes * 60_000
        s.restMinutesAt = cfg.restMinutes; this.commit()
      }
      // 单轮模式中，视频还在处理时不能因一次空收件箱永久结束消息组。
      if (s.once && cfg.independentMessages && cfg.messagesEnabled && cfg.videoEnabled && !s.done.video && (cfg.videoCount === 0 || s.counts.video < cfg.videoCount)) delete s.done.messages
      const serviceMessages = cfg.independentMessages && !s.once && cfg.messagesEnabled
      const messageDue = serviceMessages && (s.next.messages || 0) <= now
      const resting = s.restUntil > now
      if (messageDue && (resting || s.turn === 'messages' || !cfg.videoEnabled || s.done.video || (s.next.video || 0) > now || (cfg.videoCount > 0 && s.counts.video >= cfg.videoCount))) {
        s.activeGroup = 'messages'; s.phase = resting ? 'resting' : 'running'; this.commit()
        const result = await this.step('messages', { signal: this.controller.signal, round: s.round, poll: true })
        if (!result?.empty) s.counts.messages++
        s.next.messages = this.now() + cfg.messagesIntervalSec * 1000
        s.turn = 'video'; s.error = ''; s.failures = 0; this.commit(); return
      }
      if (resting) { s.phase = 'resting'; return }
      if (s.restUntil) this.newRound()
      const groups = ['video', 'messages'].filter(g => cfg[g + 'Enabled'] && !(serviceMessages && g === 'messages'))
      if (!groups.length) { if (serviceMessages) { s.phase = 'waiting'; return }; this.stop(); return }
      const finished = g => s.done[g] || (cfg[g + 'Count'] > 0 && s.counts[g] >= cfg[g + 'Count'])
      if (groups.every(finished)) {
        s.completed++
        if (s.once || (cfg.maxRounds > 0 && s.completed >= cfg.maxRounds)) {
          s.running = false; s.phase = 'complete'
        } else {
          if (cfg.restMinutes === 0) { this.newRound(); s.phase = 'waiting' }
          else { s.restStartedAt = now; s.restMinutesAt = cfg.restMinutes; s.restUntil = now + cfg.restMinutes * 60_000; s.phase = 'resting' }
        }
        this.commit(); return
      }
      const order = s.turn === 'video' ? ['video', 'messages'] : ['messages', 'video']
      const group = order.find(g => groups.includes(g) && !finished(g) && (s.next[g] || 0) <= now)
      if (!group) { s.phase = 'waiting'; return }
      s.phase = 'running'; s.activeGroup = group; this.commit()
      const result = await this.step(group, { signal: this.controller.signal, round: s.round })
      // 已结束的操作即使恰逢停止也记账，避免恢复时重复。
      if (result?.budget) { s.phase = 'budget'; s.next[group] = this.now() + 60000; s.turn = group === 'video' ? 'messages' : 'video'; this.commit(); return }
      if (result?.empty) s.done[group] = true
      else s.counts[group]++
      s.next[group] = this.now() + cfg[group + 'IntervalSec'] * 1000
      s.turn = group === 'video' ? 'messages' : 'video'
      s.error = ''; s.failures = 0
      this.commit()
    } catch (e) {
      if (this.state.running) {
        const s = this.state
        s.failures = (s.failures || 0) + 1
        s.error = String(e?.message || e)
        s.phase = 'retrying'
        const until = this.now() + Math.min(900_000, 30_000 * 2 ** Math.min(s.failures - 1, 5))
        if (s.activeGroup) {
          s.next[s.activeGroup] = until
          s.turn = s.activeGroup === 'video' ? 'messages' : 'video'
        }
        this.onError(e); this.commit()
      }
    } finally { this.busy = false; delete this.state.activeGroup }
  }
}
