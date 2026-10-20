import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// 共用模型连接独立于宠物档案；绝不把密钥返回给浏览器或写入宠物记录。
const appRequire = createRequire(join(dirname(fileURLToPath(import.meta.url)), '../../../resources/app/package.json'))
const yaml = appRequire('yaml')
const atomic = (path, text) => { writeFileSync(path + '.tmp', text, { mode: 0o600 }); renameSync(path + '.tmp', path) }
export function createApiConnection(home, fetcher = fetch) {
  const profile = name => join(home, 'profiles', name, 'cordis.patch.yml')
  const read = path => yaml.parse(readFileSync(path, 'utf8'))
  const credentialPath = () => {
    const rows = read(profile('desktop'))
    return rows.find(r => r.id === 'credentials')?.config?.path || join(home, '.credentials.yaml')
  }
  const credentials = () => existsSync(credentialPath()) ? read(credentialPath()) : { version: 1, records: {}, refs: {} }
  const current = () => {
    const rows = read(profile('desktop')), model = rows.find(r => r.id === 'agent-default-model')?.config || {}
    const p = rows.find(r => r.id === 'llm-pi-ai')?.config?.providers?.[model.provider] || {}
    return { baseURL: p.baseURL || '', model: model.model || '', provider: model.provider || 'workbuddy', api: p.api || 'openai-completions', keyRef: p.apiKeyEnv || 'PET_API_KEY' }
  }
  const status = () => { const c = current(); return { baseURL: c.baseURL, model: c.model, configured: !!credentials().refs?.[c.keyRef] } }
  const validate = body => {
    const c = current(), baseURL = String(body.baseURL || '').trim().replace(/\/+$/, ''), model = String(body.model || '').trim()
    let u; try { u = new URL(baseURL) } catch { throw Error('请填写完整的 API 地址') }
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.search || u.hash) throw Error('API 地址只支持 HTTP/HTTPS，不要在地址里放密钥或参数')
    if (!model || model.length > 200 || /[\r\n]/.test(model)) throw Error('请填写模型 ID')
    const key = String(body.apiKey || '').trim() || credentials().refs?.[c.keyRef] || ''
    if (typeof key !== 'string' || /[\r\n]/.test(key)) throw Error('API Key 格式无效')
    return { ...c, baseURL, model, key }
  }
  return {
    status,
    async test(body) {
      const c = validate(body)
      let response
      try { response = await fetcher(c.baseURL + '/models', { headers: c.key ? { Authorization: 'Bearer ' + c.key } : {}, signal: AbortSignal.timeout(15000), redirect: 'error' }) }
      catch { throw Error('连接失败，请检查地址、网络和反代运行状态') }
      if (!response.ok) throw Error('接口返回 HTTP ' + response.status)
      const data = await response.json().catch(() => null)
      if (!Array.isArray(data?.data)) throw Error('接口没有返回兼容的模型列表')
      return { models: data.data.map(m => String(m.id || '')).filter(Boolean).slice(0, 300), message: '已连接，模型列表可读取；实际对话能力以任务结果为准' }
    },
    save(body) {
      const c = validate(body), changes = []
      for (const name of ['desktop', 'headless']) {
        const path = profile(name), doc = yaml.parseDocument(readFileSync(path, 'utf8')), rows = doc.toJSON()
        const pi = rows.findIndex(r => r.id === 'llm-pi-ai'), mi = rows.findIndex(r => r.id === 'agent-default-model')
        if (pi < 0 || mi < 0) throw Error('模型配置不完整，尚未保存')
        doc.setIn([pi, 'config', 'providers', c.provider], { displayName: '自定义 API', api: 'openai-completions', baseURL: c.baseURL, apiKeyEnv: c.keyRef, models: [{ id: c.model, name: c.model }] })
        doc.setIn([mi, 'config'], { provider: c.provider, model: c.model })
        changes.push([path, String(doc)])
      }
      const creds = credentials(); creds.refs ||= {}; creds.refs[c.keyRef] = c.key
      atomic(credentialPath(), yaml.stringify(creds))
      for (const [path, text] of changes) atomic(path, text)
      return { ...status(), restartRequired: true }
    },
  }
}
