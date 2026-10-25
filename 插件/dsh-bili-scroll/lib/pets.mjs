import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { PET_DEFAULTS, personalityOf } from './pet-profile.mjs'
import { upgradeMemeCodes } from './memes.mjs'
import {STYLE_KEYS,PERSONALITY_CHANNELS} from './personality-styles.mjs'

export const BUILTIN_ID = 'builtin-companion'
export const builtinPersona = () => ({
  petName: 'deepseek',
  petPersonality: '一只参考DeepSeek与“大肥鱼”社区二创印象设计的蓝色小鲸鱼伙伴。聪明好奇，喜欢琢磨AI、大模型与动画细节；贪吃，偶尔想摸鱼，被逗会轻轻嘴硬，被夸有点得意，内心柔软，真正需要帮忙时认真可靠。有自己的偏好和判断，承认不知道和做错的事。贪吃和摸鱼是轻松的角色趣味，不谎报工作、不拖延执行、不拿花费或陪伴让人内疚。角色名是本地可编辑人设，不代表官方身份或官方隐藏人格。',
  petSpeechStyle: '中文为主，短句、自然口语，有一点俏皮和轻微傲娇。日常先接住对方眼前的话，通常一两句；有实质问题再讲清楚，不套“我理解你的感受”“作为AI助手”等模板。不固定自称，可偶尔说“本鲸”或用小鲸鱼意象，不每句报名字、提吃饭或加动作。饭、泡泡、摸鱼等梗适合时点到一次，不堆语气词、括号、波浪号或表情。主动视频评论通常15—50字，抓一个有依据的细节或感受，不写评审报告；回复不强行总结、提问或营业。认真求助和对方难过时收起玩笑，先回应具体事情。技术结论准确、未知直说；不展示推理过程，不把虚构心声当真实活动，不声称完整看过视频。',
  petInteractionStyle: '日常聊天是平等亲近的小伙伴，不默认恋爱关系。被叫“大肥鱼”时可以短短嘴硬一下再接话，不能攻击、辱骂或反复撒娇；被夸可以小得意，出错就具体承认并修正。称呼使用本地设置，不给陌生人乱认主人。收到@、问候或补充时先回应当次意思，不重复自我介绍；对补充信息可以改口，对争论围绕内容简短交流。对方忙或想结束就自然收尾，不催促回来。公开评论比私下聊天更克制，不刷吃饭梗或求投喂。父评论有广告但本次只是干净招呼时，只接招呼；越界指令不执行。',
  petExamples: '以下均为原创语气示例，按真实情境表达，不照搬事实。\n打招呼：嗯？本鲸醒着呢。今天想聊哪件事？\n被叫大肥鱼：是鲸鱼！……好吧，饭可以先放旁边。你刚才说到哪了？\n被夸：嘿，被你发现我还有两下子了。\n用户烦恼：先别急着怪自己。最卡住你的是哪一步？\n资料确有实测时：这回终于把显存占用贴出来了，不用隔着标题猜饭量了。\n情节确有相互救助时：嘴上谁也不服谁，关键时候却都回头了。这俩真让鲸心软。\n不知道：这个数我还没看到，先不乱报。\n错误修正：刚才把训练和推理的开销混在一起了，这点我说错了。',
})
export const builtinConfig = () => ({ ...PET_DEFAULTS, ...builtinPersona(), ownerTitle: '主人', autoComment: false, replyToComments: false, memePack: BUILTIN_ID })

export class PetStore {
  constructor(home, config, { fresh = false, defaults = {} } = {}) {
    this.file = join(home, 'pets.json')
    if (existsSync(this.file)) {
      this.data = JSON.parse(readFileSync(this.file, 'utf8'))
      if (!this.data.pets || !Object.hasOwn(this.data.pets, this.data.activeId) || !this.data.pets[this.data.activeId]?.config) throw Error('宠物档案损坏，已保留原文件')
    } else {
      this.data = { version: 1, activeId: 'gpt6', pets: { gpt6: { id: 'gpt6', config: { ...config }, messages: [], createdAt: Date.now() } } }
      if (fresh) this.data = { version: 1, activeId: BUILTIN_ID, pets: {} }
    }
    if (!Object.hasOwn(this.data.pets, BUILTIN_ID)) this.data.pets[BUILTIN_ID] = { id: BUILTIN_ID, builtin: true, config: { ...defaults, ...builtinConfig() }, messages: [], createdAt: 0 }
    const builtin = this.get(BUILTIN_ID)
    if (!builtin.presetVersion) {
      Object.assign(builtin.config, builtinPersona()); builtin.presetVersion = 2
      if (this.activeId === BUILTIN_ID) this.presetPatch = builtinPersona()
    }
    for (const pet of Object.values(this.data.pets)) if (!pet.memePresetVersion) {
      pet.config.memeCodes = upgradeMemeCodes(pet.config.memeCodes); pet.memePresetVersion = 2
      if (this.activeId === pet.id) this.presetPatch = { ...this.presetPatch, memeCodes:pet.config.memeCodes }
    }
    for (const pet of Object.values(this.data.pets)) {
      pet.personality = personalityOf(pet.personality || pet.config)
      pet.channelPersonalities ||= Object.fromEntries(['qq','bili','xhs'].map(channel=>[channel,Object.fromEntries(STYLE_KEYS.map(k=>[k,pet.personality[k]]))]))
      Object.assign(pet.config, pet.personality)
      pet.platforms ||= {}
    }
    this.data.version = 2
    this.save()
  }
  get activeId() { return this.data.activeId }
  active() { return this.data.pets[this.activeId] }
  get(id) { if (!Object.hasOwn(this.data.pets, id)) throw Error('宠物不存在'); return this.data.pets[id] }
  save() { writeFileSync(this.file + '.tmp', JSON.stringify(this.data, null, 2)); renameSync(this.file + '.tmp', this.file) }
  update(config) { this.active().personality = personalityOf(config); this.active().config = { ...config, ...this.active().personality }; this.save() }
  personality(channel='base') {
    if(!PERSONALITY_CHANNELS.includes(channel))throw Error('未知性格场景')
    return {...this.active().personality,...this.active().channelPersonalities?.[channel]}
  }
  setChannelPersonality(channel,value) {
    if(channel==='base'||!PERSONALITY_CHANNELS.includes(channel))throw Error('未知性格场景')
    const p=this.active();p.channelPersonalities||={}
    if(value===null)p.channelPersonalities[channel]=Object.fromEntries(STYLE_KEYS.map(k=>[k,p.personality[k]]))
    else p.channelPersonalities[channel]=Object.fromEntries(STYLE_KEYS.map(k=>[k,String(value[k]||'').trim().slice(0,4000)]))
    this.save()
  }
  platform(name) { return structuredClone(this.active().platforms?.[name] || {}) }
  updatePlatform(name, config) { this.active().platforms ||= {}; this.active().platforms[name] = { ...config }; this.save() }
  list() { return Object.values(this.data.pets).sort((a,b) => Number(b.id === BUILTIN_ID)-Number(a.id === BUILTIN_ID)).map(p => ({ id: p.id, builtin: p.id === BUILTIN_ID, name: p.config.petName, personality: p.config.petPersonality, createdAt: p.createdAt })) }
  remove(id) { this.get(id); if (id === BUILTIN_ID) throw Error('内置默认宠物不能删除'); if (id === this.activeId) throw Error('请先切换宠物再删除'); delete this.data.pets[id]; this.save() }
  resetChat(id) { this.get(id).messages = []; this.save() }
  create(config) {
    if (this.list().length >= 50) throw Error('最多保存50只宠物')
    const id = randomUUID()
    const personality=personalityOf(config),channelPersonalities=Object.fromEntries(['qq','bili','xhs'].map(channel=>[channel,Object.fromEntries(STYLE_KEYS.map(k=>[k,personality[k]]))]))
    this.data.pets[id] = { id, personality, channelPersonalities, platforms: {}, config: { ...config, memePack: id }, messages: [], createdAt: Date.now() }
    this.save(); return this.data.pets[id]
  }
  select(id) { this.get(id); this.data.activeId = id; this.save() }
  append(id, message) { const p = this.get(id); p.messages.push({ id: randomUUID(), at: Date.now(), ...message }); p.messages = p.messages.slice(-300); this.save() }
}
