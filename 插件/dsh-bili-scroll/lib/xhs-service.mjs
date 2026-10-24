import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash, randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'

// Pin the release and GitHub asset digest, rather than executing an unverified latest download.
export const XHS_RELEASE = { version:'v2.5.5', asset:582035748, bytes:15612416, sha256:'cb55674f90c1649c875be9c4cde3af193b02fc34ffc860c40c8d711e6ca53e27' }
async function downloadComponent(signal, progress) {
  const response=await fetch(`https://api.github.com/repos/xpzouying/xiaohongshu-mcp/releases/assets/${XHS_RELEASE.asset}?download=${Date.now()}`,{
    headers:{Accept:'application/octet-stream','User-Agent':'CyberPet'},redirect:'manual',signal:AbortSignal.any([signal,AbortSignal.timeout(30000)])})
  if(response.status!==302)throw Error('组件分发接口暂不可用：HTTP '+response.status)
  const location=response.headers.get('location'),url=new URL(location)
  if(url.protocol!=='https:'||url.hostname!=='release-assets.githubusercontent.com')throw Error('组件下载地址不匹配')
  // Small verified ranges avoid restarting the whole component on a slow connection.
  const size=256*1024,count=Math.ceil(XHS_RELEASE.bytes/size),chunks=new Array(count)
  let cursor=0,loaded=0
  const abort=new AbortController(),combined=AbortSignal.any([signal,abort.signal])
  try {
    await Promise.all(Array.from({length:4},async()=>{
      while(cursor<count){
        const i=cursor++,start=i*size,end=Math.min(XHS_RELEASE.bytes-1,start+size-1)
        let bytes,error
        for(let attempt=0;attempt<2;attempt++)try {
          const part=await fetch(location,{headers:{Range:`bytes=${start}-${end}`},redirect:'error',signal:AbortSignal.any([combined,AbortSignal.timeout(45000)])})
          if(part.status!==206||part.headers.get('content-range')!==`bytes ${start}-${end}/${XHS_RELEASE.bytes}`)throw Error('下载分段响应不完整')
          bytes=Buffer.from(await part.arrayBuffer());if(bytes.length!==end-start+1)throw Error('下载分段大小不符')
          error=null;break
        }catch(e){error=e;if(combined.aborted)throw e}
        if(error)throw error
        chunks[i]=bytes;loaded+=bytes.length;progress(Math.floor(loaded/XHS_RELEASE.bytes*100))
      }
    }))
  } catch(e){abort.abort();throw e}
  return Buffer.concat(chunks)
}
export function createXhsService(home) {
  const dir = join(home,'xhs-service'); mkdirSync(dir,{recursive:true})
  const temp = join(dir,'tmp'); mkdirSync(temp,{recursive:true})
  const exe = join(dir,'xiaohongshu-mcp-windows-amd64.exe'), stateFile = join(dir,'connection.json')
  let state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile,'utf8')) : { token:randomBytes(32).toString('hex') }
  if (!/^[a-f0-9]{64}$/.test(state.token)) throw Error('小红书连接配置损坏，未覆盖原文件')
  if (!existsSync(stateFile)) writeFileSync(stateFile,JSON.stringify(state))
  let child = null, task = null, generation = 0, downloadAbort = null, status = { state:'stopped',message:'尚未启动小红书服务' }
  const connection = () => ({ url:'http://127.0.0.1:18860/', token:state.token })
  const valid = () => existsSync(exe) && createHash('sha256').update(readFileSync(exe)).digest('hex') === XHS_RELEASE.sha256
  const install = async signal => {
    if (valid()) return
    status = {state:'installing',message:'正在下载小红书连接组件（约16 MB）'}
    let bytes, failure
    for(let attempt=1;attempt<=3;attempt++)try {
      signal.throwIfAborted()
      bytes=await downloadComponent(signal,percent=>{status={state:'installing',message:`下载小红书连接组件：${percent}%（第${attempt}次）`}})
      if(bytes.length!==XHS_RELEASE.bytes||createHash('sha256').update(bytes).digest('hex')!==XHS_RELEASE.sha256)throw Error('文件校验失败')
      failure=null;break
    }catch(e){failure=e;if(signal.aborted)throw e;status={state:'installing',message:'下载暂时失败，正在重试（'+attempt+'/3）'}}
    if(failure)throw Error('小红书组件下载失败，可检查网络后重试：'+failure.message)
    writeFileSync(exe+'.tmp',bytes); renameSync(exe+'.tmp',exe)
    writeFileSync(join(dir,'SOURCE.txt'),'Source: https://github.com/xpzouying/xiaohongshu-mcp\nRelease: '+XHS_RELEASE.version+'\nLicense: Apache-2.0\nDownloaded component is separate from Cyber Pet; not included in its update ZIP.\n')
  }
  return {
    connection,
    status:()=>({ ...status, installed:existsSync(exe), running:!!child, version:XHS_RELEASE.version }),
    start() {
      if (task) return {ok:true,...status}
      if (child) return {ok:true,...status}
      status = {state:'installing',message:'正在准备小红书服务'}
      const run = ++generation
      downloadAbort = new AbortController()
      task = (async()=>{
        await install(downloadAbort.signal)
        if (run !== generation) return
        status = {state:'starting',message:'正在启动；首次会下载浏览器，可能需要几分钟'}
        child = spawn(exe,['-headless=true','-port','127.0.0.1:18860'],{cwd:dir,windowsHide:true,env:{...process.env,AUTH_TOKEN:state.token,COOKIES_PATH:join(dir,'cookies.json'),LOCALAPPDATA:dir,XDG_CACHE_HOME:dir,TEMP:temp,TMP:temp},stdio:['ignore','pipe','pipe']})
        const proc = child
        const trace = bytes => appendFileSync(join(dir,'service.log'),bytes)
        proc.stdout.on('data',trace); proc.stderr.on('data',trace)
        proc.on('error',e=>{if(child===proc){child=null;status={state:'error',message:'小红书服务启动失败：'+e.message}}})
        proc.on('close',code=>{if(child===proc){child=null;status={state:'stopped',message:'小红书服务已退出（'+code+'），可重试启动。详情见本地service.log'}}})
        for(let i=0;i<180 && child===proc;i++) {
          try { const r=await fetch(connection().url+'health',{signal:AbortSignal.timeout(1500)}); if(r.ok){status={state:'ready',message:'小红书服务已就绪，请扫码登录'};return} } catch {}
          await new Promise(r=>setTimeout(r,1000))
        }
        if(child===proc) status={state:'starting',message:'浏览器仍在准备，可稍后点击检查登录；网络失败请查看service.log'}
      })().catch(e=>{if(run===generation)status={state:'error',message:e.message}}).finally(()=>{task=null;downloadAbort=null})
      return {ok:true,...status}
    },
    stop() {
      generation++
      downloadAbort?.abort(Error('已停止准备'))
      const proc=child;child=null
      if(proc?.pid && process.platform==='win32') { const killer=spawn('taskkill.exe',['/PID',String(proc.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});killer.on('error',()=>proc.kill()) }
      else proc?.kill()
      status={state:'stopped',message:'小红书服务已停止'}
    },
  }
}
