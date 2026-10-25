import test from 'node:test'
import assert from 'node:assert/strict'
import {WindowQqClient} from './qq-window.mjs'
test('单群窗口客户端只处理锚点后的新消息；不读旧消息、不回复自己、不允许跨群或其他消息段',async()=>{
 let rows=[{key:'1',sender:'甲',text:'旧消息'}],foreground=true,draft='';const events=[];const service={binding:{selfName:'我',groupId:'123456',group:'测试群'},snapshot:async()=>({messages:rows,foreground,draft,muted:false}),send:async text=>({text})};const client=new WindowQqClient({onState:()=>{},onEvent:e=>events.push(e)},service)
 try{await client.connect();assert.equal(events.length,0);rows.push({key:'2',sender:'乙',text:'新消息'});await client.poll();assert.equal(events.length,1);await client.poll();assert.equal(events.length,1)
 rows.push({key:'3',sender:'我',text:'自己的消息',own:true});await client.poll();assert.equal(events.length,1)
 foreground=false;rows.push({key:'4',sender:'丙',text:'后台新消息'});await client.poll();assert.equal(client.canRespond,true);assert.equal(events.length,2);draft='手动草稿';rows.push({key:'draft',sender:'丙',text:'草稿时暂停'});await client.poll();assert.equal(client.canRespond,false);draft=''
 foreground=true;await client.poll();assert.equal(events.length,2);rows.push({key:'5',sender:'丙',text:'恢复后的新话'});await client.poll();assert.equal(events.length,3)
 rows=[{key:'old',sender:'甲',text:'滚到旧记录'}];await client.poll();assert.equal(events.length,3)
 await assert.rejects(()=>client.call('send_group_msg',{group_id:222222,message:[]}),/绑定群/);await assert.rejects(()=>client.call('send_group_msg',{group_id:123456,message:[{type:'at',data:{qq:1}}]}),/文字/)
 }finally{client.disconnect()}
})

test('空群第一条新消息可读取，最小化读取失败后恢复不补发旧消息',async()=>{let rows=[],paused=false;const events=[];const service={binding:{selfName:'我',groupId:'123456'},snapshot:async()=>{if(paused)throw Error('已最小化');return {messages:rows,foreground:false,draft:'',muted:false}}};const c=new WindowQqClient({onState:()=>{},onEvent:e=>events.push(e)},service);try{await c.connect();rows=[{key:'1',sender:'甲',text:'新消息'}];await c.poll();assert.equal(events.length,1);paused=true;await c.poll();assert.match(c.capture.reason,/最小化/);rows.push({key:'2',sender:'甲',text:'暂停期间'});paused=false;await c.poll();assert.equal(events.length,1);rows.push({key:'3',sender:'甲',text:'恢复后'});await c.poll();assert.equal(events.length,2)}finally{c.disconnect()}})
