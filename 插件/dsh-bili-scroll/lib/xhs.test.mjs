import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {XhsClient,xhsNotification} from './xhs-client.mjs'
import {normalizeXhs,xhsPatch} from './xhs-settings.mjs'
import {createXhsWorker} from './xhs-worker.mjs'
import {PET_DEFAULTS} from './pet-profile.mjs'
import {PetStore} from './pets.mjs'
import {createSocialJudge} from './social-judge.mjs'

const answer=(text='这个小动作好可爱。')=>({action:'reply',scope:'in_scope',boundary:'ok',interest:'match',interestEvidence:true,summary:'剧情中两位角色互相帮助，属于动画主题',text})
function fixture(t,extra={}) {
  const home=mkdtempSync(join(tmpdir(),'pet-xhs-'));t.after(()=>rmSync(home,{recursive:true,force:true}))
  const state={cfg:{...PET_DEFAULTS,...normalizeXhs({messagesEnabled:false,cooldownSec:1,...extra}),petId:'gpt6'},now:Date.now(),sent:[],notifications:[],inputs:[],decision:answer(),fetches:0}
  const feed={id:'note123',token:'HOST_ONLY_XSEC_SECRET',title:'GPT拟人小动画',description:'两个角色互相帮助。'.repeat(900)}
  const client={search:async()=>[feed],detail:async()=>{state.fetches++;return{info:feed,comments:[]}},notifications:async()=>state.notifications,
    comment:async(item,text)=>{state.sent.push({item,text});if(state.failSend)throw Error('timeout');return{success:true}},reply:async(item,text)=>{state.sent.push({item,text});return{success:true}}}
  const judge=async(group,input)=>{state.inputs.push(structuredClone(input));if(state.onJudge)await state.onJudge(group,input);return {raw:state.decision,usage:{inputTokens:50,outputTokens:10},estimate:100}}
  const worker=createXhsWorker({home,config:()=>state.cfg,client,judge,now:()=>state.now})
  const run=(group='video')=>worker.step(group,{signal:new AbortController().signal,round:1})
  return{state,worker,run,home,client,judge}
}
test('性格迁移为独立档案，平台设置及宠物切换互不覆盖',t=>{
  const f=fixture(t),pets=new PetStore(f.home,{petName:'原宠物',petSpeechStyle:'原语气',keywords:['B站原词'],autoComment:true})
  assert.equal(pets.personality().petSpeechStyle,'原语气');pets.updatePlatform('xiaohongshu',{keywords:['小红书词'],autoComment:false})
  const next=pets.create({...pets.active().config,petName:'新宠物'});pets.select(next.id)
  assert.deepEqual(pets.platform('xiaohongshu'),{})
  pets.select('gpt6');pets.update({...pets.active().config,petSpeechStyle:'新语气'})
  const restored=new PetStore(f.home,{})
  assert.equal(restored.personality().petSpeechStyle,'新语气');assert.deepEqual(restored.active().config.keywords,['B站原词'])
  assert.deepEqual(restored.platform('xiaohongshu').keywords,['小红书词']);assert.equal(restored.active().config.autoComment,true)
  assert.equal(Object.hasOwn(restored.personality(),'autoComment'),false)
})
test('小红书连接仅本机、不跟随重定向，正常解析响应及通知时间',async()=>{
  let request
  const c=new XhsClient({connection:()=>({url:'http://127.0.0.1:18860/',token:'LOCAL_SECRET'}),fetchImpl:async(url,options)=>{request={url:String(url),options};return new Response(JSON.stringify({success:true,data:{is_logged_in:true}}))}})
  assert.equal((await c.check()).loggedIn,true);assert.equal(request.options.redirect,'error');assert.equal(request.options.headers.Authorization,'Bearer LOCAL_SECRET')
  const bad=new XhsClient({connection:()=>({url:'https://example.com/'}),fetchImpl:async()=>{throw Error('Should not fetch')}})
  await assert.rejects(bad.check(),/回环/)
  assert.equal(xhsNotification({comment_id:'c1',time:123}).time,123000)
})
test('阅读严格限长、任务不携带xsec令牌，开关关闭只留草稿',async t=>{
  const f=fixture(t);await f.run()
  assert.equal(f.state.sent.length,0)
  assert.ok(f.state.inputs[0].context.overview.text.length<=600)
  assert.equal(JSON.stringify(f.state.inputs).includes('HOST_ONLY_XSEC_SECRET'),false)
  assert.match(f.worker.logs('video')[0].outcome,/自动发送关闭/)
})
test('发言边界、主题证据与字数在宿主端拦截',async t=>{
  for(const patch of [{boundary:'blocked'},{interestEvidence:false},{text:'太'.repeat(81)}]){
    const f=fixture(t,{autoComment:true});f.state.decision={...answer(),...patch};await f.run();assert.equal(f.state.sent.length,0)
  }
})
test('发送意图先落盘，超时与重启均不自动重发',async t=>{
  const f=fixture(t,{autoComment:true});f.state.failSend=true;await assert.rejects(f.run(),/timeout/)
  const saved=JSON.parse(readFileSync(join(f.home,'memory.json')));assert.equal(saved.sent['video:note123'].state,'pending')
  const next=createXhsWorker({home:f.home,config:()=>f.state.cfg,client:f.client,judge:f.judge,now:()=>f.state.now})
  await next.step('video',{signal:new AbortController().signal});assert.equal(f.state.sent.length,1)
})
test('只处理启用后新通知，问候不读原帖，新@回复目标准确且不重复',async t=>{
  const f=fixture(t,{messagesEnabled:true,replyToComments:true})
  f.state.notifications=[{id:'old',commentId:'old',time:f.state.now-1000,text:'旧消息'}]
  await f.worker.primeInbox(new AbortController().signal);await f.run('messages');assert.equal(f.state.inputs.length,0)
  f.state.now+=1000;f.state.notifications.unshift({id:'new',commentId:'new',feedId:'note123',authorId:'someone',token:'HOST_ONLY_XSEC_SECRET',time:f.state.now,text:'你好呀'})
  await f.run('messages');assert.equal(f.state.sent.length,1);assert.equal(f.state.sent[0].item.commentId,'new');assert.equal(f.state.fetches,0)
  await f.run('messages');assert.equal(f.state.sent.length,1)
})
test('被问内容时补读文字，同人补充合并；每项最多补读一次',async t=>{
  const f=fixture(t,{messagesEnabled:true,messagesNewOnly:false,replyToComments:false})
  f.state.notifications=[{id:'n',commentId:'n',feedId:'note123',authorId:'u',token:'HOST_ONLY_XSEC_SECRET',time:f.state.now,text:'视频讲了什么？'},{id:'n2',commentId:'n2',feedId:'note123',authorId:'u',time:f.state.now,text:'我问的是结尾'}]
  f.state.decision={action:'read_video',scope:'in_scope',boundary:'ok',summary:'需要补读',text:''}
  await f.run('messages');assert.equal(f.state.inputs.length,2);assert.equal(f.state.fetches,1)
  assert.ok(f.state.inputs[1].context.overview.text.length<=1200);assert.equal(f.state.inputs[1].context.overview.followup,true)
  assert.deepEqual(f.state.inputs[0].item.extraTexts,['我问的是结尾']);assert.equal(f.state.sent.length,0)
})
test('生成中换性格或关闭发送、停止，均不发布；预算无余额不调用模型',async t=>{
  for(const mutate of [s=>{s.cfg.petPersonality='另一个性格'},s=>{s.cfg.autoComment=false},s=>{s.cfg.petId='other'}]){
    const f=fixture(t,{autoComment:true});f.state.onJudge=()=>mutate(f.state);await f.run();assert.equal(f.state.sent.length,0)
  }
  const f=fixture(t,{autoComment:true,dailyTokenBudget:1});await f.run();f.state.now+=2000
  const count=f.state.inputs.length;assert.equal((await f.run()).budget,true);assert.equal(f.state.inputs.length,count)
})
test('小红书配置白名单与旧字段默认值，不从B站继承自动发送',()=>{
  assert.equal(normalizeXhs().autoComment,false);assert.equal(normalizeXhs().independentMessages,true)
  const c=xhsPatch({petPersonality:'不能修改',autoComment:true,restMinutes:0},normalizeXhs())
  assert.equal(c.petPersonality,undefined);assert.equal(c.restMinutes,0);assert.equal(c.autoComment,true)
  assert.throws(()=>xhsPatch({videoIntervalSec:0},normalizeXhs()),/整数/)
})
test('小红书模型任务使用真实受限子进程、独立输入文件与用量，不提供发布工具',async t=>{
  const f=fixture(t),script=join(f.home,'fake-model.cjs')
  writeFileSync(script,`const fs=require('fs');const p=JSON.parse(fs.readFileSync(process.argv[process.argv.indexOf('--patch')+1],'utf8'));if(!p.some(v=>v.insert?.[0]?.id==='bili-task-boundary'))process.exit(2);const input=JSON.parse(fs.readFileSync(process.env.BILI_TASK_INPUT,'utf8'));if(input.platform!=='xiaohongshu')process.exit(3);fs.writeFileSync(process.env.BILI_TASK_USAGE,JSON.stringify({inputTokens:10,outputTokens:5}));fs.writeFileSync(process.env.BILI_TASK_OUTPUT,JSON.stringify(${JSON.stringify(answer())}));`)
  const judge=createSocialJudge({home:f.home,dshHome:f.home,config:()=>f.state.cfg,resolveDsh:()=>({command:process.execPath,args:[script],shell:false}),env:()=>({})})
  const result=await judge('video',{platform:'xiaohongshu',context:{info:{title:'模型拟人'},overview:{text:'剧情片段'}}},new AbortController().signal)
  assert.equal(result.raw.action,'reply');assert.equal(result.usage.inputTokens,10);assert.match(result.taskId,/^[a-f0-9-]{36}$/)
})
test('停止时终止本项判断，未记录发送意图也不发布',async t=>{
  const f=fixture(t,{autoComment:true}),controller=new AbortController()
  f.state.onJudge=()=>controller.abort(Error('用户停止'))
  await assert.rejects(f.worker.step('video',{signal:controller.signal}),/用户停止/)
  assert.equal(f.state.sent.length,0)
})
