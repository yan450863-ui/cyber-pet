import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { REMOVED_CORE_IDS, petDesktopEntries } from '../../../resources/app/lib/pet-runtime-policy.js'

test('精简策略保留执行/凭证/界面底层，移除原侧栏、市场和通用代理功能',()=>{
  const ids=['agent-loop','tools','tool-fs','sandbox-policy','credentials','llm-pi-ai','settings','ui-renderer','ui-theme','ui-settings','connection','bili-scroll','ui-sidebar','ui-conversation','ui-sidebar-browser','community-market','desktop-updates','goal','subagent','preset-standard','office-to-pdf']
  const result=petDesktopEntries(ids.map(id=>({id}))).map(r=>r.id)
  assert.deepEqual(result,ids.slice(0,12))
  const shell=petDesktopEntries([{id:'desktop-shell',config:{mode:'extended',networkExposure:'lan',openBrowser:true}}])[0]
  assert.equal(shell.config.networkExposure,'loopback');assert.equal(shell.config.openBrowser,false)
})
test('headless精简策略一致且没有禁用任务读写、模型或凭证基础',()=>{
  const patches=JSON.parse(readFileSync(new URL('../../../resources/app/lib/pet-headless.patch.json',import.meta.url)))
  assert.deepEqual(patches.map(r=>r.id).sort(),[...REMOVED_CORE_IDS].sort())
  for(const id of ['tool-fs','tools','agent-loop','credentials','llm-pi-ai','fs-sandbox'])assert.equal(patches.some(r=>r.id===id),false)
})
test('轻量桌面桥只上报真实Loader状态，不依赖被删除的原UI服务',async()=>{
  let mod, effect
  vm.runInNewContext(readFileSync(new URL('../../../resources/app/lib/client.js',import.meta.url),'utf8'),{window:{__ModuleLoader__:{load:m=>{mod=m}}},setTimeout,clearTimeout,console})
  const client=mod.factory();assert.equal(client.inject,undefined)
  client.apply({loader:{},effect:fn=>{effect=fn}})
  assert.equal(typeof effect,'function')
})
