import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {preparePetPortable} from '../resources/app/lib/pet-portable.js';
import {candidateRoots} from '../插件/dsh-bili-scroll/lib/hostdeps.mjs';
import {stateDirOf} from '../插件/dsh-bili-scroll/lib/state.mjs';
test('pet paths, package resolution and state ignore a foreign DSH installation',()=>{
 const root=mkdtempSync(join(tmpdir(),'cyber-pet-isolation-')),original={...process.env};
 try {
  mkdirSync(join(root,'插件/dsh-bili-scroll'),{recursive:true});
  writeFileSync(join(root,'插件/dsh-bili-scroll/index.js'),'export const local=true');
  writeFileSync(join(root,'pet-portable.json'),'{}');
  process.env.DSH_HOME=join(root,'foreign-dsh');process.env.DSH_HOST_MODULES='foreign';process.env.NODE_PATH='foreign';
  const paths={},app={setName(n){paths.name=n},setPath(n,p){paths[n]=p},setAppLogsPath(p){paths.logs=p}};
  assert.equal(preparePetPortable(app,root),true);
  assert.equal(paths.name,'赛博小宠物');
  assert.equal(paths.userData,join(root,'数据/desktop-shell'));
  assert.equal(paths.appData,join(root,'数据/appdata'));
  assert.equal(paths.crashDumps,join(root,'数据/crashes'));
  assert.equal(process.env.DSH_HOME,join(root,'数据'));
  assert.equal(process.env.NODE_PATH,undefined);
  assert.deepEqual(candidateRoots(),[join(root,'resources/app/node_modules/@deepseek-ai')]);
  assert.equal(stateDirOf({get:()=>()=>join(root,'foreign-data')}),join(root,'数据/bili-duty'));
  assert.equal(readFileSync(join(root,'resources/app/node_modules/dsh-bili-scroll/index.js'),'utf8'),'export const local=true');
  const profile=join(root,'数据/profiles/desktop/cordis.patch.yml');writeFileSync(profile,'user-api-config');
  preparePetPortable(app,root);assert.equal(readFileSync(profile,'utf8'),'user-api-config');
 } finally {for(const key of Object.keys(process.env))if(!(key in original))delete process.env[key];Object.assign(process.env,original);rmSync(root,{recursive:true,force:true})}
});
