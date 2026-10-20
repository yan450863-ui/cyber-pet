import { existsSync, realpathSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { writeFileSync } from 'node:fs'
import { usageTotal } from './activity.mjs'

export const name = 'bili-task-boundary'
export const inject = ['tools']

function canonical(path) {
  const absolute = resolve(path)
  const real = existsSync(absolute) ? realpathSync(absolute) : join(realpathSync(dirname(absolute)), basename(absolute))
  return process.platform === 'win32' ? real.toLowerCase() : real
}

// 路径只来自宿主启动参数，模型无法扩大读写范围。缺少绑定时拒绝启动。
export function taskGuard(inputFile, resultFile) {
  if (!inputFile || !resultFile) throw new Error('缺少本次任务的文件边界')
  const input = canonical(inputFile), output = canonical(resultFile)
  if (input === output) throw new Error('输入与结果文件不能相同')
  return exec => {
    if (!['read', 'write'].includes(exec.name)) return '工作边界：仅允许读取任务输入、写入判断结果'
    const args = exec.arguments
    if (typeof args?.file_path !== 'string' || args.sandbox_permissions || args.escalation) return '工作边界：禁止更改文件权限或扩大访问范围'
    try {
      const path = canonical(args.file_path)
      if (exec.name === 'read' && [input, output].includes(path)) return
      if (exec.name === 'write' && path === output) return
    } catch {}
    return '工作边界：不能访问本次任务以外的文件'
  }
}

export function apply(ctx) {
  ctx.tools.guard(taskGuard(process.env.BILI_TASK_INPUT, process.env.BILI_TASK_OUTPUT))
  ctx.on('agent/created', ({ agent }) => {
    agent.ctx.tools.restrict({ allow: ['read', 'write'] })
  })
  // 宿主监听真实用量事件，模型不能写入/伪造统计文件。
  let total = 0
  ctx.on('session/event', (session, event) => {
    if (event.type !== 'assistant/message' || !event.data?.usage) return
    total += usageTotal(event.data.usage)
    if (process.env.BILI_TASK_USAGE) writeFileSync(process.env.BILI_TASK_USAGE, JSON.stringify({ totalTokens: total }), 'utf8')
  })
}
