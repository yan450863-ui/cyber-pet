import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { apply } from '../index.js'

test('宠物HTTP流程：现有配置迁入、新建/切换隔离，聊天目标不匹配时拒绝', async t => {
  const home = mkdtempSync(join(tmpdir(), 'bili-pets-api-')), cleanups = []
  let handler
  const row = { ns: 'bili', revision: 1, value: { videoCount: 5, restMinutes: 0, replyToComments: false, petName: 'GPT6', maxReplyChars: 200 }, user: { petName: 'GPT6', maxReplyChars: 200 } }
  const ctx = {
    get: k => k === 'dshHomePath' ? (...parts) => join(home, ...parts) : undefined,
    logger: { info() {} },
    tools: { register: value => value },
    settings: { describe: () => [row], update: async (ns, patch) => { Object.assign(row.value, patch); Object.assign(row.user, patch); row.revision++ } },
    webServer: { register: value => { handler = value.handler; return { dispose() {} } } },
    effect: fn => { const result = fn(); if (typeof result === 'function') cleanups.push(result); return result },
  }
  apply(ctx, {})
  t.after(() => { cleanups.reverse().forEach(fn => fn()); rmSync(home, { recursive: true, force: true }) })
  const request = (path, body) => new Promise(resolve => {
    const req = Readable.from([Buffer.from(JSON.stringify(body || {}))]); req.method = body ? 'POST' : 'GET'; req.url = '/api/bili-duty' + path
    const res = { writeHead(code) { this.code = code }, end(data) { resolve({ code: this.code, body: JSON.parse(data) }) } }
    handler(req, res)
  })
  assert.equal((await request('/pets')).body.activeId, 'gpt6')
  const created = await request('/pets/create', { petName: '团团', ownerTitle: 'Token', maxReplyChars: 60 })
  assert.equal(created.code, 200)
  assert.equal((await request('/config')).body.config.petName, '团团')
  assert.equal((await request('/config')).body.config.maxReplyChars, 60)
  assert.equal((await request('/config')).body.config.autoComment, false)
  await request('/pets/select', { id: 'gpt6' })
  assert.equal((await request('/config')).body.config.petName, 'GPT6')
  assert.equal((await request('/config')).body.config.maxReplyChars, 200)
  const personality=(await request('/pets/personality')).body
  assert.equal(personality.personality.petName,'GPT6')
  assert.equal((await request('/pets/personality',{petId:'gpt6',revision:'stale',personality:personality.personality})).code,500)
  assert.equal((await request('/pets/personality',{petId:'gpt6',revision:personality.revision,personality:{...personality.personality,petSpeechStyle:'跨平台共用的新语气'}})).code,200)
  await request('/config',{petSpeechStyle:'旧平台页面试图覆盖性格',restMinutes:0})
  assert.equal((await request('/pets/personality')).body.personality.petSpeechStyle,'跨平台共用的新语气')
  const xhs=(await request('/xhs/status')).body
  assert.equal(xhs.config.autoComment,false)
  assert.equal(xhs.config.replyToComments,false)
  assert.equal((await request('/xhs/config',{petId:created.body.id,config:{keywords:['错误宠物']}})).code,500)
  await request('/xhs/config',{petId:'gpt6',config:{keywords:['小红书独立词'],restMinutes:0,autoComment:false}})
  assert.deepEqual((await request('/xhs/status')).body.config.keywords,['小红书独立词'])
  assert.equal((await request('/config')).body.config.petName,'GPT6')
  assert.equal((await request('/pets/chat', { petId: created.body.id, text: '错宠物' })).code, 500)
  assert.equal((await request('/pets/logs?group=messages')).body.items.length, 0)
  const prefs=(await request('/browse-options')).body
  assert.equal(prefs.presets.practical.name,'AI实用派')
  await request('/config',{browsePreset:'practical'})
  assert.deepEqual((await request('/config')).body.config.keywords,prefs.presets.practical.keywords)
  const feedbackState=join(home,'bili-duty')
  writeFileSync(join(feedbackState,'cycle-memory.json'),JSON.stringify({events:[{key:'video:test',group:'video',petId:'gpt6',title:'AI教程',at:1}]}))
  assert.equal((await request('/pets/browse-feedback',{petId:created.body.id,key:'video:test',type:'教程',mode:'block'})).code,500)
  assert.equal((await request('/pets/browse-feedback',{petId:'gpt6',key:'video:test',type:'教程',mode:'block'})).code,200)
  assert.equal((await request('/pets/logs?group=video')).body.items[0].feedback.mode,'block')
  await request('/pets/select',{id:created.body.id})
  assert.notDeepEqual((await request('/xhs/status')).body.config.keywords,['小红书独立词'])
  assert.equal((await request('/config')).body.config.browseFeedback.length,0)
  assert.equal((await request('/pets/browse-feedback',{petId:created.body.id,key:'video:test',type:'教程',mode:'block'})).code,500)
  await request('/pets/select',{id:'gpt6'})
  assert.equal((await request('/config')).body.config.browseFeedback.length,1)
  await request('/pets/browse-feedback',{petId:'gpt6',key:'video:test',mode:'undo'})
  assert.equal((await request('/config')).body.config.browseFeedback.length,0)
  assert.equal((await request('/pets')).body.pets[0].builtin, true)
  assert.equal((await request('/pets/delete', { id: 'builtin-companion' })).code, 500)
  assert.equal((await request('/pets/reset-chat', { petId: created.body.id })).code, 500)
  assert.equal((await request('/pets/reset-chat', { petId: 'gpt6' })).code, 200)
  await request('/pets/select', { id: created.body.id })
  assert.equal((await request('/pets/delete', { id: created.body.id })).code, 200)
  assert.equal((await request('/pets')).body.activeId, 'builtin-companion')
  assert.equal((await request('/pets')).body.pets.some(p => p.id === 'gpt6'), true)
  const state = join(home,'bili-duty')
  writeFileSync(join(state,'bili_credential.json'),'{}')
  writeFileSync(join(state,'qrcode_login.png'),'fixture')
  assert.equal((await request('/status')).body.loggedIn,true)
  assert.equal((await request('/logout',{})).code,200)
  assert.equal((await request('/status')).body.loggedIn,false)
  assert.equal(existsSync(join(state,'bili_credential.json')),false)
  assert.equal(existsSync(join(state,'qrcode_login.png')),false)
  assert.equal((await request('/login/poll',{key:'old-cancelled-key'})).body.state,'expired')
  const check = (await request('/check',{})).body
  assert.equal(check.ok,false); assert.match(check.error,/环境还没装好|还没登录/)
})
