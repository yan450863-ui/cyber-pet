import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { createApiConnection } from './api-connection.mjs'
const yaml = createRequire(new URL('../../../resources/app/package.json', import.meta.url))('yaml')
test('API连接双profile同步、保留凭证记录、密钥不回传，测试不保存且不跟随重定向', async t => {
  const home = mkdtempSync(join(tmpdir(), 'pet-api-'))
  t.after(()=>rmSync(home,{recursive:true,force:true}))
  for (const name of ['desktop','headless']) {
    mkdirSync(join(home,'profiles',name),{recursive:true})
    writeFileSync(join(home,'profiles',name,'cordis.patch.yml'),yaml.stringify([
      {id:'llm-pi-ai',config:{providers:{workbuddy:{baseURL:'http://localhost:7863/v1',apiKeyEnv:'WORKBUDDY_API_KEY'}}}},
      {id:'agent-default-model',config:{provider:'workbuddy',model:'old'}},
      {id:'other',config:{keep:42}},
    ]))
  }
  writeFileSync(join(home,'.credentials.yaml'),yaml.stringify({version:1,records:{keep:'record'},refs:{WORKBUDDY_API_KEY:'secret-fixture'}}))
  let options
  const api=createApiConnection(home,async (url,opts)=>{options=opts;assert.equal(url,'http://localhost:9000/v1/models');return {ok:true,json:async()=>({data:[{id:'new-model'}]})}})
  assert.equal(JSON.stringify(api.status()).includes('secret-fixture'),false)
  await api.test({baseURL:'http://localhost:9000/v1',model:'new-model'})
  assert.equal(options.redirect,'error')
  assert.equal(api.status().model,'old')
  api.save({baseURL:'http://localhost:9000/v1/',model:'new-model',apiKey:''})
  for (const name of ['desktop','headless']) {
    const rows=yaml.parse(readFileSync(join(home,'profiles',name,'cordis.patch.yml'),'utf8'))
    assert.equal(rows[1].config.model,'new-model');assert.equal(rows[2].config.keep,42)
    assert.equal(rows[0].config.providers.workbuddy.baseURL,'http://localhost:9000/v1')
  }
  const credentials=yaml.parse(readFileSync(join(home,'.credentials.yaml'),'utf8'))
  assert.equal(credentials.refs.WORKBUDDY_API_KEY,'secret-fixture')
  assert.equal(credentials.records.keep,'record')
  assert.throws(()=>api.save({baseURL:'https://key@example.com/v1',model:'new-model'}))
})
