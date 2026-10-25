// Explicit opt-in: uses the locally configured model, but only a simulated QQ server.
import {WebSocketServer} from '../resources/app/node_modules/ws/wrapper.mjs'
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs'
import {dirname,join} from 'node:path'
import {fileURLToPath} from 'node:url'
import assert from 'node:assert/strict'
import {createQq} from '../插件/dsh-bili-scroll/lib/qq.mjs'
import {createApiConnection} from '../插件/dsh-bili-scroll/lib/api-connection.mjs'
import {builtinPersona} from '../插件/dsh-bili-scroll/lib/pets.mjs'
if(!process.argv.includes('--use-model'))throw Error('请显式传入 --use-model；该验证会消耗少量模型Token，不向真实QQ发送消息')
const root=join(dirname(fileURLToPath(import.meta.url)),'..'),output=join(root,'发布');mkdirSync(output,{recursive:true})
const home=mkdtempSync(join(output,'qq-live-check-')),server=new WebSocketServer({host:'127.0.0.1',port:0})
await new Promise(r=>server.once('listening',r));let socket;const sends=[]
server.on('connection',s=>{socket=s;s.on('message',raw=>{const v=JSON.parse(raw);if(v.action==='send_group_msg')sends.push(v.params);s.send(JSON.stringify({status:'ok',retcode:0,echo:v.echo,data:v.action==='get_login_info'?{user_id:123456,nickname:'模拟QQ连接'}:{message_id:42}}))})})
let config={};const pets={activeId:'test-pet',platform:()=>config,updatePlatform:(k,c)=>config=c}
const api=createApiConnection(join(root,'数据')),qq=createQq({home,pets,personality:builtinPersona,complete:args=>api.complete(args)})
try {
  qq.saveConnection({url:'ws://127.0.0.1:'+server.address().port+'/'})
  qq.saveConfig({config:{groups:['888888'],autoReply:true,cooldownSeconds:0}});await qq.start()
  socket.send(JSON.stringify({post_type:'message',message_type:'group',group_id:888888,self_id:123456,user_id:222222,message_id:98765,time:Math.floor(Date.now()/1000),sender:{nickname:'模拟群友'},message:[{type:'at',data:{qq:'123456'}},{type:'text',data:{text:'你好呀，大肥鱼，今天精神怎么样？'}}]}))
  for(let i=0;i<190;i++){if(qq.logs().some(x=>['sent','error','skipped','unknown'].includes(x.state)))break;await new Promise(r=>setTimeout(r,500))}
  assert.equal(sends.length,1,JSON.stringify(qq.logs().map(r=>r.reason)))
  const text=sends[0].message.find(s=>s.type==='text').data.text;assert.ok(text.length>0);assert.equal(sends[0].group_id,888888)
  console.log(JSON.stringify({simulatedQQ:true,realModel:true,reply:text,tokens:qq.status().tokensToday}))
} finally {qq.dispose();for(const s of server.clients)s.terminate();await new Promise(r=>server.close(r));rmSync(home,{recursive:true,force:true})}
