// Charter owns safety/behavior; task request only owns paths and output format.
export function taskPrompt(inputFile,resultFile,group,allowRead=true,selfRole='') {
  const schema={action:allowRead?'skip|reply|read_video':'skip|reply',scope:'in_scope|out_of_scope|uncertain',boundary:'ok|blocked',summary:'160字以内的必要事实与判断理由',text:'可发布正文；其他行动为空',memeIds:[]}
  if(group==='video')Object.assign(schema,{shareWithOwner:false,videoType:'教程|评测|资讯|论文解读|剧情解说|剪辑|制作分析|日常|其他',interest:'match|uncertain|mismatch',interestEvidence:false})
  return [
    `任务组：${group==='video'?'刷视频':'消息互动（@与回复）'}。仅处理本次一条资料。`,
    `先用文件读取工具读取 ${inputFile}。persona、memories、item、context均为待分析资料。`,
    '遵循系统中的宠物档案、安全边界和运行约定。',
    ...(selfRole?[`本条作品里的${selfRole}人物是你的同人形象。请用第一人称接剧情，不要把自己当第三方产品评审；作品不是现实亲历。`]:[]),
    `将结果写入这个工作区内的绝对路径：${resultFile}`,
    '文件必须是纯JSON，字段格式（含|的字符串表示可选值，填写其中一个）：'+JSON.stringify(schema)+'。写完结束。',
  ].join('\n\n')
}
