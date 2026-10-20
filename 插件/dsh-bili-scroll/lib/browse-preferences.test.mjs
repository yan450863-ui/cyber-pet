import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeBrowse, browseGate, typePreference, VIDEO_TYPES, exploration, presetPatch, recentCandidate, comparePopularity, heat, browsePrompt } from './browse-preferences.mjs'

test('UID硬边界和类型屏蔽不被探索100%绕过',()=>{
  const cfg={browseExplorationPercent:100,browsePreferredUids:['42'],browseBlockedUids:['7'],browseAuthorMode:'only',browseTypes:['教程']}
  assert.match(browseGate({author_uid:'7',title:'AI教程'},cfg),/屏蔽/)
  assert.match(browseGate({author_uid:'8',title:'AI教程'},cfg),/指定UP/)
  assert.match(browseGate({title:'AI教程'},cfg),/核验/)
  assert.match(browseGate({author_uid:'42',title:'动画混剪'},cfg),/视频类型/)
  assert.equal(browseGate({author_uid:'42',title:'AI教程'},cfg),'')
})
test('严格度、相关性与探索只影响不确定内容，缺类型不放行',()=>{
  const item={bvid:'BV1111111111',videoType:'教程',interest:'match',interestEvidence:false}
  assert.match(browseGate(item,{browseStrictness:'strict'},{semantic:true}),/证据/)
  assert.equal(browseGate({...item,interestEvidence:true},{browseStrictness:'strict'},{semantic:true}),'')
  assert.match(browseGate({...item,interest:'mismatch'},{browseExplorationPercent:100},{semantic:true}),/偏离/)
  assert.match(browseGate({...item,interest:'uncertain'},{browseExplorationPercent:0},{semantic:true}),/不明确/)
  assert.equal(browseGate({...item,interest:'uncertain'},{browseExplorationPercent:100},{semantic:true}),'')
  assert.match(browseGate({interest:'match'},{browseTypes:['教程']},{semantic:true}),/确认视频类型/)
  assert.equal(exploration(item,{browseExplorationPercent:0}),false)
  assert.equal(exploration(item,{browseExplorationPercent:100}),true)
})
test('反馈可移除、硬屏蔽优先；配置限定范围并清除无效UID和反馈',()=>{
  const block=JSON.stringify({key:'a',type:'剪辑',mode:'block'}),more=JSON.stringify({key:'b',type:'剪辑',mode:'more'})
  assert.equal(typePreference({browseFeedback:[block,more]},'剪辑'),'block')
  assert.equal(typePreference({browseFeedback:[more]},'剪辑'),'more')
  const c=normalizeBrowse({browsePreferredUids:['7','x','7'],browseTypes:['教程','x'],browseFeedback:['oops'],browseExplorationPercent:200})
  assert.deepEqual(c.browsePreferredUids,['7']);assert.deepEqual(c.browseTypes,['教程']);assert.deepEqual(c.browseFeedback,[]);assert.equal(c.browseExplorationPercent,100)
  assert.equal(browseGate({}, {browseTypes:[]}), '未选择任何视频类型')
  assert.equal(VIDEO_TYPES.length,9)
})

test('模型拟人预设组合模型名，近期限制拒绝未知及过旧日期',()=>{
 const c=presetPatch('modelPersona'),now=Date.now(),fresh={pubdate:Math.floor(now/1000)-86400},old={pubdate:Math.floor(now/1000)-31*86400}
 assert.equal(c.browseDays,30);assert.equal(c.browseExplorationPercent,0);assert.equal(c.browseStrictness,'strict')
 assert(c.keywords.includes('Claude 拟人'));assert(c.keywords.includes('Gemini 同人'));assert(!c.keywords.includes('DeepSeek'))
 assert(!c.browseTypes.includes('教程'));assert.match(browsePrompt(c),/技术教程/)
 assert.equal(recentCandidate(fresh,c,now),true);assert.equal(recentCandidate(old,c,now),false);assert.equal(recentCandidate({},c,now),false)
 assert.match(browseGate(old,c),/近期/);assert.match(browseGate({},c),/发布时间/)
 assert.equal(normalizeBrowse({browseDays:999,browseFreshDays:-1,browseOrder:'oops'}).browseDays,365)
})
test('近期热门优先新鲜候选，同组按互动热度，兼容万单位',()=>{
 const now=Date.now(),cfg=presetPatch('modelPersona'),fresh={pubdate:Math.floor(now/1000)-86400,play:100},older={pubdate:Math.floor(now/1000)-10*86400,play:'5万'}
 assert.equal(heat(older),50000);assert(comparePopularity(fresh,older,cfg,now)<0)
 assert(comparePopularity({...fresh,play:1000},fresh,cfg,now)<0)
 assert.equal(recentCandidate({}, {browseDays:0}),true)
})
