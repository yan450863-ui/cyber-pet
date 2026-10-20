// 宠物界面以 pet-shell.fragment.js 为源，合入宿主识别的单文件客户端。
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const file = name => fileURLToPath(new URL(name, import.meta.url))
const source = readFileSync(file('pet-shell.fragment.js'), 'utf8')
const client = readFileSync(file('client.js'), 'utf8')
const start = client.indexOf('    /* PET SHELL START */')
const end = client.indexOf('    /* PET SHELL END */')
if (start < 0 || end < start) throw Error('客户端宠物界面标记缺失')
writeFileSync(file('client.js'), client.slice(0, start) + '    /* PET SHELL START */\n' + source + '\n' + client.slice(end), 'utf8')
