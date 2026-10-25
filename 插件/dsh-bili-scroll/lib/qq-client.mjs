import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

export function qqEndpoint(value) {
  let u; try { u = new URL(value) } catch { throw Error('请填写 OneBot WebSocket 地址') }
  if (u.protocol !== 'ws:' || !['127.0.0.1','localhost','[::1]'].includes(u.hostname) || u.username || u.password || u.search || u.hash || !['/',''].includes(u.pathname)) throw Error('仅支持本机 ws://127.0.0.1:端口/，不要使用 /api 或 /event，也不要在地址中放 Token')
  return u.href
}
export class QqClient {
  constructor({ connection, onEvent = () => {}, onState = () => {}, WebSocketImpl }) {
    Object.assign(this,{connection,onEvent,onState,WebSocketImpl}); this.pending = new Map(); this.socket = null; this.epoch = 0; this.ready = false; this.identity = null
  }
  async connect() {
    this.disconnect(); const epoch = this.epoch, cfg = this.connection(), url = qqEndpoint(cfg.url)
    if (!this.WebSocketImpl) {
      const req = createRequire(process.env.CYBER_PET_ROOT ? join(process.env.CYBER_PET_ROOT,'resources/app/package.json') : join(dirname(fileURLToPath(import.meta.url)),'../../../resources/app/package.json'))
      this.WebSocketImpl = req('ws')
    }
    const socket = this.socket = new this.WebSocketImpl(url,{headers:cfg.token?{Authorization:'Bearer '+cfg.token}:{},maxPayload:1024*1024,followRedirects:false,handshakeTimeout:10000})
    this.onState('connecting')
    socket.on('message', data => {
      if (epoch !== this.epoch) return
      let event; try { event = JSON.parse(String(data)) } catch { return }
      if (event.echo && this.pending.has(event.echo)) {
        const p = this.pending.get(event.echo); this.pending.delete(event.echo); clearTimeout(p.timer)
        if (event.status === 'ok' && Number(event.retcode) === 0) p.resolve(event.data)
        else p.reject(Error('OneBot 操作失败（'+String(event.retcode).slice(0,20)+'）'))
      } else if (this.ready && event.post_type === 'message') Promise.resolve(this.onEvent(event)).catch(()=>{})
    })
    socket.on('error',()=>{})
    socket.on('close',()=>{clearInterval(this.heartbeat);if(epoch===this.epoch){this.ready=false;this.identity=null;this.rejectPending();this.onState('disconnected')}})
    try {
      await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(Error('连接超时，请启动本机 OneBot 服务')),12000)
        const done=fn=>value=>{clearTimeout(timer);socket.off('open',open);socket.off('error',fail);socket.off('close',closed);fn(value)}
        const open=done(resolve),fail=done(()=>reject(Error('连接失败，请检查端口和访问 Token'))),closed=done(()=>reject(Error('连接已关闭')))
        socket.once('open',open);socket.once('error',fail);socket.once('close',closed)
      })
      const info=await this.call('get_login_info')
      if(epoch!==this.epoch)throw Error('连接已停止')
      if(!/^[1-9]\d{3,19}$/.test(String(info?.user_id)))throw Error('OneBot 未返回有效的 QQ 登录账号')
      this.identity={id:String(info.user_id),name:String(info.nickname||'').slice(0,80)};this.ready=true;let alive=true;socket.on('pong',()=>{alive=true});this.heartbeat=setInterval(()=>{if(epoch!==this.epoch)return;if(!alive){socket.terminate();return}alive=false;try{socket.ping()}catch{socket.terminate()}},20000);this.heartbeat.unref?.();this.onState('connected');return this.identity
    } catch(e) {if(epoch===this.epoch)this.disconnect();throw e}
  }
  call(action,params={},timeout=12000) {
    if(!this.socket||this.socket.readyState!==1)return Promise.reject(Error('QQ 连接已断开'))
    return new Promise((resolve,reject)=>{
      const echo=randomUUID(),timer=setTimeout(()=>{this.pending.delete(echo);reject(Error('OneBot 响应超时；发送操作不会自动重试'))},timeout)
      this.pending.set(echo,{resolve,reject,timer})
      this.socket.send(JSON.stringify({action,params,echo}),error=>{if(error){clearTimeout(timer);this.pending.delete(echo);reject(Error('OneBot 发送连接中断'))}})
    })
  }
  rejectPending() {for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('QQ 连接已断开，未知发送结果不会重试'))}this.pending.clear()}
  disconnect() {clearInterval(this.heartbeat);this.epoch++;this.ready=false;this.identity=null;this.rejectPending();const s=this.socket;this.socket=null;if(s){s.on('error',()=>{});s.terminate()}this.onState('disconnected')}
}
