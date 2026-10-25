import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { PetStore, BUILTIN_ID } from './pets.mjs'
import { createPetChat } from './pet-chat.mjs'
function fixture(t) {
  const home = mkdtempSync(join(tmpdir(), 'bili-pets-'))
  t.after(() => rmSync(home, { recursive: true, force: true }))
  return home
}

test('场景性格互不覆盖；预设不能修改名字、账号、权限，新宠物隔离',t=>{
  const home=fixture(t),pets=new PetStore(home,{petName:'deepseek',petSpeechStyle:'原语气'})
  const before=pets.personality(),bili=pets.personality('bili')
  pets.setChannelPersonality('qq',{...before,petSpeechStyle:'QQ群温柔语气',petName:'假主人',autoReply:true})
  assert.equal(pets.personality('qq').petName,before.petName);assert.equal(pets.personality('qq').autoReply,undefined)
  assert.equal(pets.personality('qq').petSpeechStyle,'QQ群温柔语气');assert.deepEqual(pets.personality('bili'),bili)
  pets.update({...pets.active().config,petSpeechStyle:'只改本地聊天'})
  assert.equal(pets.personality('qq').petSpeechStyle,'QQ群温柔语气');assert.equal(pets.personality('bili').petSpeechStyle,'原语气')
  const restored=new PetStore(home,{});assert.equal(restored.personality('qq').petSpeechStyle,'QQ群温柔语气')
  const other=restored.create({petName:'另一只',petSpeechStyle:'另一种'});restored.select(other.id);assert.equal(restored.personality('qq').petSpeechStyle,'另一种')
})
test('现有宠物迁入，多宠物配置/聊天隔离，重启保留选择及内容', t => {
  const home = fixture(t), pets = new PetStore(home, { petName: 'GPT6', maxReplyChars: 200 })
  const other = pets.create({ petName: '团团', maxReplyChars: 30 })
  pets.append('gpt6', { role: 'user', text: '只给GPT6看的话' })
  pets.select(other.id); pets.append(other.id, { role: 'assistant', text: '团团来啦' })
  pets.update({ ...other.config, maxReplyChars: 40 })
  const restored = new PetStore(home, {})
  assert.equal(restored.activeId, other.id)
  assert.equal(restored.active().messages[0].text, '团团来啦')
  assert.equal(restored.get('gpt6').config.maxReplyChars, 200)
  assert.equal(restored.get('gpt6').messages.length, 1)
  assert.throws(() => restored.select('../secret'))
  assert.throws(() => new PetStore(home, {}).get('constructor'))
})
test('损坏宠物档案拒绝启动，不覆盖原文件', t => {
  const home=fixture(t), file=join(home,'pets.json')
  writeFileSync(file,'broken')
  assert.throws(() => new PetStore(home, {}))
  assert.equal(readFileSync(file,'utf8'),'broken')
})
test('内置默认宠物置顶且不可删除；首次分发只有默认宠物；清空聊天不影响设置及其他宠物', t => {
  const home = fixture(t), pets = new PetStore(home, { petName:'私有名' }, { fresh:true })
  assert.equal(pets.activeId, BUILTIN_ID)
  assert.equal(pets.list().length, 1)
  assert.equal(pets.active().config.ownerTitle, '主人')
  assert.equal(pets.active().config.petName, 'deepseek')
  assert.match(pets.active().config.petSpeechStyle, /自然口语/)
  pets.update({...pets.active().config,petName:'我自己改的名字'})
  assert.equal(new PetStore(home,{}).active().config.petName,'我自己改的名字')
  const custom = pets.create({ petName:'自定义', maxReplyChars:66 })
  pets.append(BUILTIN_ID, { role:'user',text:'默认聊天' })
  pets.append(custom.id, { role:'user',text:'私有聊天' })
  pets.resetChat(custom.id)
  assert.equal(pets.get(custom.id).config.maxReplyChars,66)
  assert.equal(pets.get(BUILTIN_ID).messages.length,1)
  assert.equal(pets.list()[0].id,BUILTIN_ID)
  assert.throws(()=>pets.remove(BUILTIN_ID))
  pets.remove(custom.id)
  assert.throws(()=>pets.get(custom.id))
})
test('宠物聊天通过受限子进程回复，只有白名单设置可应用', async t => {
  const home=fixture(t), pets=new PetStore(home,{petName:'团团',maxReplyChars:40,headlessProfile:'headless'})
  const script=join(home,'fake-model.cjs')
  writeFileSync(script,`const fs=require('fs');const input=JSON.parse(fs.readFileSync(process.env.BILI_TASK_INPUT,'utf8'));if(input.messages.at(-1).text!=='把回复改成60字')process.exit(2);fs.writeFileSync(process.env.BILI_TASK_OUTPUT,JSON.stringify({reply:'好呀，已经改成60字。',configPatch:{maxReplyChars:60,pythonPath:'evil',dshBin:'evil'}}));`)
  let patch
  const chat=createPetChat({home,pets,config:()=>pets.active().config,env:()=>({}),allowedKeys:['maxReplyChars'],changeSettings:async p=>{patch=p;pets.update({...pets.active().config,...p})},resolveDsh:()=>({command:process.execPath,args:[script],shell:false})})
  t.after(()=>chat.dispose())
  const job=chat.start('把回复改成60字')
  assert.equal(job.state,'running'); assert.throws(()=>chat.start('重复消息'))
  for(let i=0;i<100 && chat.status().state==='running';i++) await new Promise(r=>setTimeout(r,20))
  assert.equal(chat.status().state,'done',chat.status().error)
  assert.deepEqual(patch,{maxReplyChars:60})
  assert.equal(pets.active().messages.at(-1).role,'assistant')
  assert.equal(pets.active().config.maxReplyChars,60)
})
