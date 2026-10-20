import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { excerpt, normalizeReading, modelInput } from './reading.mjs'
import { taskPrompt } from './task-prompt.mjs'
import { CYCLE_DEFAULTS } from './cycle.mjs'
import { ACTIVITY_DEFAULTS } from './activity.mjs'
import { PET_DEFAULTS, petPrompt, selfNames, recognizeSelf } from './pet-profile.mjs'
import { MEME_DEFAULTS, memePrompt, DEFAULT_EMOTES } from './memes.mjs'
import { BROWSE_DEFAULTS } from './browse-preferences.mjs'

test('本地字幕去重、时间点与问题相关摘录严格限长，不截取整份长字幕',()=>{
  const cues=Array.from({length:200},(_,i)=>({from:i*10,text:`第${i}段：${i===26?'角色突然回头是因为听到了同伴的呼喊。':'正在讨论完全不同的内容。'}`}))
  const text=cues.map(c=>c.text).join('\n')
  const selected=excerpt(text,600,{cues,query:'4:20 角色为什么突然回头'})
  assert(selected.text.length<=600);assert.match(selected.text,/\[4:20\]/);assert.match(selected.text,/同伴的呼喊/);assert.equal(selected.partial,true)
  const repeated=excerpt('重复台词\n'.repeat(1000),600)
  assert.equal(repeated.text,'重复台词');assert.equal(repeated.partial,true)
  assert(excerpt('长字幕。'.repeat(50000),600).text.length<=600)
  assert.deepEqual(normalizeReading({videoReadChars:0,videoFollowupChars:99999,allowVideoFollowup:false}),{videoReadChars:100,videoFollowupChars:6000,allowVideoFollowup:false})
})

test('通知正文与目标楼层去重，已提供的回复不在记忆中再次携带',()=>{
  const input=modelInput({group:'messages',persona:'',lightweight:false,item:{rpid:7,notification:{item:{source_content:'你好'}}},context:{thread:{comments:[{rpid:'7',text:'你好'}]},previousReplies:['之前说过']},memories:[{text:'之前说过',summary:'之前的回答'},{summary:'新事实'}]})
  assert.equal(input.item.notificationText,undefined)
  assert.deepEqual(input.memories,[{summary:'新事实'}])
})

test('任务提示不重复安全正文，消息不带浏览字段；关闭表情不带目录且全部语境可保留',()=>{
  const prompt=taskPrompt('input.json','output.json','messages',false)
  assert(!prompt.includes('videoType'));assert(!prompt.includes('read_video'));assert(!prompt.includes('用户已授权'))
  const pet=petPrompt({...PET_DEFAULTS,ownerBiliUid:'123456789',mentionOwnerOnLikedVideo:false},'messages')
  assert(!pet.includes('123456789'));assert(!pet.includes('maxCommentChars'))
  assert.equal(memePrompt('.', {...MEME_DEFAULTS,memeEnabled:false}),'')
  const emojis=memePrompt('.', {...MEME_DEFAULTS,memeEnabled:true,memeImagesEnabled:false,memeChance:100})
  for(const [,code,usage]of DEFAULT_EMOTES){assert(emojis.includes(code));assert(emojis.includes(usage))}
  assert(!emojis.includes('"kind"'))
})

test('旧设置缺阅读字段可保存并补600/1200，休息0有效；无效整数定位字段',async()=>{
  const source=readFileSync(new URL('../client.js',import.meta.url),'utf8')
  const start=source.indexOf('const save = async () => '),end=source.indexOf('      const login =',start)
  assert(start>=0&&end>start)
  const draft={...CYCLE_DEFAULTS,...ACTIVITY_DEFAULTS,...PET_DEFAULTS,...MEME_DEFAULTS,...BROWSE_DEFAULTS,keywords:'',restMinutes:0}
  let saved
  const context=vm.createContext({draft,readingDefaults:{videoReadChars:600,videoFollowupChars:1200,allowVideoFollowup:true},fieldLabels:{videoIntervalSec:'浏览间隔'},alive:{current:false},request:async(path,cfg)=>{assert.equal(path,'/config');saved=cfg;return {host:{ok:true},config:cfg}}})
  const save=vm.runInContext('('+source.slice(start,end).replace('const save = ','').trim()+')',context)
  await save();assert.equal(saved.videoReadChars,600);assert.equal(saved.videoFollowupChars,1200);assert.equal(saved.restMinutes,0)
  draft.videoIntervalSec='';await assert.rejects(save(),/浏览间隔/)
})

test('GPT别名只按宠物档案识别拟人角色，不把技术评测当亲历，新宠物不继承GPT别名',()=>{
 assert.deepEqual(selfNames({...PET_DEFAULTS,petAliases:'GPT6\n小龙娘'}),['GPT6','GPT','ChatGPT','小龙娘'])
 assert.deepEqual(selfNames({...PET_DEFAULTS,petName:'猫猫',petAliases:''}),['猫猫'])
 assert.equal(recognizeSelf(PET_DEFAULTS,{info:{title:'GPT人物与大肥鱼的拟人动画'}}),'GPT')
 assert.equal(recognizeSelf(PET_DEFAULTS,{info:{title:'GPT部署教程'}}),'')
 assert.equal(recognizeSelf({...PET_DEFAULTS,petName:'猫猫'},{info:{title:'GPT人物的拟人动画'}}),'')
 assert.equal(recognizeSelf({...PET_DEFAULTS,petAliases:'GPT+角色'},{info:{title:'GPT+角色的同人动画'}}),'GPT+角色')
 const p=petPrompt({...PET_DEFAULTS,petAliases:'小龙娘'},'video')
 assert.match(p,/小龙娘/);assert.match(p,/拟人、同人或角色剧情/);assert.match(p,/不是现实亲历/)
 assert(!petPrompt({...PET_DEFAULTS,petSelfRecognition:false},'video').includes('自我角色识别'))
})
