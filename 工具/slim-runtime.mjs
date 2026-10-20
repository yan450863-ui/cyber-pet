import { existsSync, readdirSync, readFileSync, realpathSync, lstatSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { isRemovedPetEntry } from '../resources/app/lib/pet-runtime-policy.js'

const root=realpathSync(fileURLToPath(new URL('../',import.meta.url)))
const app=join(root,'resources','app'), modules=join(app,'node_modules')
const pkg=JSON.parse(readFileSync(join(app,'package.json'),'utf8'))
if(pkg.name!=='dsh-plugin-desktop'||pkg.version!=='2.0.18')throw Error('仅支持当前 DSH Desktop 2.0.18 安装布局')
const require=createRequire(join(app,'package.json')), YAML=require('yaml')
const packageName=s=>s.startsWith('@')?s.split('/').slice(0,2).join('/'):s.split('/')[0]
function* files(dir){
  for(const entry of readdirSync(dir,{withFileTypes:true})){
    const p=join(dir,entry.name)
    if(entry.isSymbolicLink()||entry.name==='.git')continue
    if(entry.isDirectory())yield* files(p)
    else if(entry.isFile())yield p
  }
}
const candidates=new Set(['@deepseek-ai/libreoffice-kit','@deepseek-ai/libreoffice-kit-win32-x64','@deepseek-ai/libreoffice-kit-win32-arm64','@deepseek-ai/dsh-skill-office','@deepseek-ai/dsh-tool-workspace-dependencies','@deepseek-ai/dsh-experimental-inspector','dsh-community-market','dshmarket'])
function walk(rows){for(const r of rows||[]){if(r.name&&isRemovedPetEntry(r))candidates.add(packageName(r.name));if(r.insert)walk(r.insert)}}
for(const bundle of ['dsh-base','dsh-web-app'])walk(YAML.parse(readFileSync(join(modules,'@deepseek-ai',bundle,'cordis.patch.yml'),'utf8'),{logLevel:'silent'}))
for(const n of [...candidates])if(!existsSync(join(modules,n))||lstatSync(join(modules,n)).isSymbolicLink())candidates.delete(n)
// Conservative code-reference closure: a removed UI may still export a utility used by core.
const edges=[]
for(const file of files(app)){
  if(!/\.(?:js|mjs|cjs)$/.test(file))continue
  const rel=relative(modules,file).replaceAll('\\','/')
  const owner=rel.startsWith('../')?'desktop':packageName(rel)
  const code=readFileSync(file,'utf8')
  for(const m of code.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*|\.resolve\s*\(\s*)["']([^"'\s]+)["']/g)){
    if(m[1].startsWith('.')||m[1].startsWith('node:'))continue
    edges.push([owner,packageName(m[1])])
  }
}
let changed=true
while(changed){changed=false;for(const [owner,target] of edges)if(!candidates.has(owner)&&candidates.has(target)){candidates.delete(target);changed=true}}
const directories=[...candidates].map(n=>join(modules,n))
for(const target of directories){
  const actual=realpathSync(target), rel=relative(realpathSync(modules),actual)
  if(!rel||rel.startsWith('..')||resolve(actual)!==resolve(target))throw Error('拒绝清理安装依赖目录之外的路径：'+target)
}
const excluded=directories.map(p=>p+sep)
const maps=[...files(app)].filter(p=>p.endsWith('.map')&&!excluded.some(d=>p.startsWith(d)))
const packages=[...candidates].map((name,i)=>({name,bytes:[...files(directories[i])].reduce((n,f)=>n+statSync(f).size,0)}))
const summary={packages,packageBytes:packages.reduce((n,p)=>n+p.bytes,0),maps:maps.length,mapBytes:maps.reduce((n,p)=>n+statSync(p).size,0),apply:process.argv.includes('--apply')}
console.log(JSON.stringify(process.argv.includes("--details")?summary:{...summary,packages:packages.length},null,2))
if(summary.apply){
  for(const target of directories)rmSync(target,{recursive:true,force:false})
  for(const file of maps)unlinkSync(file)
  for(const p of packages)delete pkg.dependencies?.[p.name]
  writeFileSync(join(app,'package.json'),JSON.stringify(pkg,null,2)+'\n')
  console.log('仅清理以上依赖和生成映射；未访问或修改个人数据。')
}
