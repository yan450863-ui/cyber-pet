import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { petPrompt, recognizeSelf } from './pet-profile.mjs'
import { taskPrompt } from './task-prompt.mjs'

export function createSocialJudge({home,dshHome,config,resolveDsh,env}) {
  const dir=join(home,'decisions');mkdirSync(dir,{recursive:true})
  return async (group,input,signal)=>{
    signal.throwIfAborted()
    const id=randomUUID(),inputFile=join(dir,id+'-input.json'),outputFile=join(dir,id+'.json'),usageFile=join(dir,id+'-usage.json'),patchFile=join(dir,id+'-patch.json')
    const cfg=config()
    const rules=readFileSync(new URL('../prompts/duty.md',import.meta.url),'utf8')+petPrompt({...cfg,petWorkScope:cfg.workScope,mentionOwnerOnLikedVideo:false},group)+
      '\n当前平台：小红书。视频组包含图文笔记；只根据已提供文字判断，不假装看过图片或视频。主题要求：'+cfg.topic+'。主动评论必须interest=match且interestEvidence=true，主体不符就skip。'+
      '\n不发送B站专用方括号表情码，不选择图片表情，不自动@主人。消息只回应指定commentId对应的人；必要时read_video只表示让宿主补读当前笔记文字一次。'
    writeFileSync(inputFile,JSON.stringify(input))
    writeFileSync(patchFile,JSON.stringify([
      {id:'system-prompt',config:{personaPrefix:rules,personaSuffix:'',includeHarnessIdentity:false}},
      {id:'agent-instructions',disabled:true},{id:'tools',config:{mode:'native'}},
      {insert:[{id:'bili-task-boundary',name:pathToFileURL(fileURLToPath(new URL('./task-boundary.mjs',import.meta.url))).href}]},
    ]))
    const overview=input.context.overview
    const allowRead=cfg.allowVideoFollowup&&(group!=='messages'||cfg.messageVideoContext)&&!overview?.followup&&!overview?.unavailable&&(!overview&&group==='messages'||overview?.partial&&cfg.videoFollowupChars>cfg.videoReadChars)
    const dsh=resolveDsh(),prompt=taskPrompt(inputFile,outputFile,group,allowRead,recognizeSelf(cfg,input.context))
    return new Promise((resolve,reject)=>{
      const child=spawn(dsh.command,[...dsh.args,'--profile',cfg.headlessProfile||'headless','--patch',patchFile,prompt],{cwd:home,shell:dsh.shell,windowsHide:true,env:{...env(),DSH_HOME:dshHome,BILI_TASK_INPUT:inputFile,BILI_TASK_OUTPUT:outputFile,BILI_TASK_USAGE:usageFile},stdio:['ignore','pipe','pipe']})
      let settled=false
      const finish=(error)=>{
        if(settled)return;settled=true;clearTimeout(timer);signal.removeEventListener('abort',abort)
        let usage=null;try{usage=JSON.parse(readFileSync(usageFile,'utf8'))}catch{}
        if(error)return reject(Object.assign(error,{taskId:id,usage}))
        try{resolve({raw:JSON.parse(readFileSync(outputFile,'utf8')),taskId:id,usage,estimate:(JSON.stringify(input).length+rules.length+prompt.length)/2})}catch{reject(Error('模型未返回有效判断，请检查模型连接'))}
      }
      const kill=()=>{if(process.platform==='win32'&&child.pid){const p=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});p.on('error',()=>child.kill())}else child.kill()}
      const abort=()=>{kill();finish(signal.reason||Error('已停止'))}
      const timer=setTimeout(()=>{kill();finish(Error('模型调用超过5分钟，已停止'))},300000);timer.unref?.()
      signal.addEventListener('abort',abort,{once:true})
      const trace=data=>{try{appendFileSync(join(dir,id+'-trace.log'),data)}catch{}}
      child.stdout.on('data',trace);child.stderr.on('data',trace)
      child.on('error',finish);child.on('close',code=>finish(code===0?null:Error('模型调用失败，请检查API连接与额度')))
      if(signal.aborted)abort()
    })
  }
}
