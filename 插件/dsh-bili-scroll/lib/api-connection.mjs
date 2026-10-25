import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, renameSync, existsSync, realpathSync } from 'node:fs'
import { join, dirname, resolve, relative, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'

// 共用模型连接独立于宠物档案；绝不把密钥返回给浏览器或写入宠物记录。
const appRequire = createRequire(process.env.CYBER_PET_ROOT ? join(process.env.CYBER_PET_ROOT, 'resources/app/package.json') : join(dirname(realpathSync(fileURLToPath(import.meta.url))), '../../../resources/app/package.json'))
const yaml = appRequire('yaml')
const atomic = (path, text) => { writeFileSync(path + '.tmp', text, { mode: 0o600 }); renameSync(path + '.tmp', path) }
export function createApiConnection(home, fetcher = fetch) {
  const profile = name => join(home, 'profiles', name, 'cordis.patch.yml')
  const read = path => yaml.parse(readFileSync(path, 'utf8'))
  const credentialPath = () => {
    const rows = read(profile('desktop'))
    const file = rows.find(r => r.id === 'credentials')?.config?.path || join(home, '.credentials.yaml')
    const rel = relative(resolve(home), resolve(file))
    if (process.env.CYBER_PET_HOME && (rel === '..' || rel.startsWith('../') || rel.startsWith('..\\') || isAbsolute(rel))) throw Error('凭证目录必须位于赛博小宠物自己的数据目录内')
    return file
  }
  const credentials = () => existsSync(credentialPath()) ? read(credentialPath()) : { version: 1, records: {}, refs: {} }
  const current = () => {
    const rows = read(profile('desktop')), model = rows.find(r => r.id === 'agent-default-model')?.config || {}
    const p = rows.find(r => r.id === 'llm-pi-ai')?.config?.providers?.[model.provider] || {}
    return { baseURL: p.baseURL || '', model: model.model || '', provider: model.provider || 'custom', api: p.api || 'openai-completions', reasoningEffort:model.reasoningEffort||'auto', keyRef: p.apiKeyEnv || 'PET_API_KEY' }
  }
  const status = () => { const c = current(); return { baseURL: c.baseURL, model: c.model, reasoningEffort:c.reasoningEffort, configured: !!credentials().refs?.[c.keyRef] } }
  const validate = body => {
    const c = current(), baseURL = String(body.baseURL || '').trim().replace(/\/+$/, ''), model = String(body.model || '').trim()
    let u; try { u = new URL(baseURL) } catch { throw Error('请填写完整的 API 地址') }
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.search || u.hash) throw Error('API 地址只支持 HTTP/HTTPS，不要在地址里放密钥或参数')
    if (!model || model.length > 200 || /[\r\n]/.test(model)) throw Error('请填写模型 ID')
    const key = String(body.apiKey || '').trim() || credentials().refs?.[c.keyRef] || ''
    if (typeof key !== 'string' || /[\r\n]/.test(key)) throw Error('API Key 格式无效')
    const reasoningEffort=body.reasoningEffort??c.reasoningEffort;if(!['auto','low','medium','high'].includes(reasoningEffort))throw Error('请选择有效的思考强度');return { ...c, baseURL, model, key,reasoningEffort }
  }
  return {
    status,
    async complete({ messages, maxTokens = 512, signal, json = false }) {
      const c = current(), key = credentials().refs?.[c.keyRef] || ''
      if (!c.baseURL || !c.model) throw Error('请先配置模型API')
      const response = await fetcher(c.baseURL + '/chat/completions', {
        method:'POST', redirect:'error', signal:signal ? AbortSignal.any([signal,AbortSignal.timeout(90000)]) : AbortSignal.timeout(90000),
        headers:{'Content-Type':'application/json',...(key?{Authorization:'Bearer '+key}:{})},
        body:JSON.stringify({model:c.model,messages,max_tokens:maxTokens,stream:false,...(c.reasoningEffort!=='auto'?{reasoning_effort:c.reasoningEffort}:{}),...(json?{response_format:{type:'json_object'}}:{})}),
      })
      if (!response.ok) throw Error('模型接口返回 HTTP '+response.status)
      const reader=response.body.getReader(),decoder=new TextDecoder();let text=''
      try {for(;;){const {done,value}=await reader.read();if(done)break;text+=decoder.decode(value,{stream:true});if(text.length>1_000_000)throw Error('模型响应过大')}text+=decoder.decode()}finally{await reader.cancel().catch(()=>{})}
      const data=JSON.parse(text),content=data.choices?.[0]?.message?.content
      if(typeof content!=='string'||!content.trim())throw Error('模型没有返回正文')
      return {text:content.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''),tokens:Number(data.usage?.total_tokens)||null}
    },
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
        doc.setIn([pi, 'config', 'providers', c.provider], { displayName: '自定义 API', api: 'openai-completions', baseURL: c.baseURL, apiKeyEnv: c.keyRef, models: [{ id: c.model, name: c.model,...(c.reasoningEffort!=='auto'?{reasoningEfforts:{low:'low',medium:'medium',high:'high'}}:{}) }] })
        doc.setIn([mi, 'config'], { provider: c.provider, model: c.model,...(c.reasoningEffort!=='auto'?{reasoningEffort:c.reasoningEffort}:{}) })
        doc.setIn([mi, 'disabled'], false)
        const ci = rows.findIndex(r => r.id === 'credentials')
        if (ci < 0) throw Error('本地凭证配置不完整，尚未保存')
        doc.setIn([ci, 'disabled'], false)
        doc.setIn([ci, 'config', 'path'], join(home, '.credentials.yaml'))
        doc.setIn([ci, 'config', 'dshHome'], home)
        changes.push([path, String(doc)])
      }
      const creds = credentials(); creds.refs ||= {}; creds.refs[c.keyRef] = c.key
      atomic(credentialPath(), yaml.stringify(creds))
      for (const [path, text] of changes) atomic(path, text)
      return { ...status(), restartRequired: true }
    },
  }
}
