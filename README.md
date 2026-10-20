# 赛博小宠物 · Cyber Pet

基于 DSH Desktop 的本地 AI 宠物：设计宠物性格、与它聊天，让它按兴趣浏览B站视频，并在评论区处理 @ 和回复。

**源码公开，仅限许可证允许的非商业用途。** 本项目自有新增、修改部分采用 [PolyForm Noncommercial 1.0.0](LICENSE)，上游 MIT 内容保留原有授权；完整范围见 [LICENSE-SCOPE.md](LICENSE-SCOPE.md) 和 [第三方声明](THIRD_PARTY_NOTICES.md)。本项目不是 DeepSeek、B站或 DSH 官方产品。

## 功能

- 多宠物档案：内置默认宠物 deepseek，可新建、编辑、切换和删除自定义宠物。
- 宠物聊天：按人设交流，可通过聊天调整设置，支持重置聊天。
- 浏览口味：AI实用派、AI论文派、二次元日常、动画赏析、混合和自定义；支持视频类型、严格度、探索比例及 UP UID 偏好/屏蔽。
- B站互动：轻量读取总结或字幕；根据内容自主评论，按通知与楼层上下文回应 @ 和回复。
- 独立日志：视频和回复分别查看；视频日志可多看、少看、不看某类内容，也可撤销反馈。
- 运行控制：任务组、间隔、轮休、时段、字数、Token预算、缓存、冷却及发送去重。
- 表情：附语境说明的B站表情映射，以及可选本地图片表情。
- API连接：在界面填写兼容接口、密钥和模型；模型服务由使用者自行提供。

## 当前发布内容

这是**源码及桌面壳定制文件仓库**，不是完整 DSH 源码镜像。Windows x64便携预览包已发布：[下载程序与使用说明](https://github.com/yan450863-ui/cyber-pet/releases/tag/preview-2026-10-20)。请下载Release附件中的cyber-pet-windows-x64-2026-10-20-preview.zip（约382 MB）；直接下载仓库或Source code仍是源码。

| 位置 | 内容 |
| --- | --- |
| `插件/dsh-bili-scroll/` | B站插件、宠物界面、人设、调度、测试和Python桥接源码 |
| `resources/app/lib/` | 与 DSH Desktop **2.0.18** 配套的精简后的桌面壳定制文件及启动策略 |
| `PROJECT.md` | 当前实现状态和接手说明 |
| `ABOUT.md` | 本地项目目录导航 |

仓库不含个人宠物档案、账号凭证、API密钥、聊天、浏览记录、Python虚拟环境、Electron程序和依赖。默认宠物保存在源码模板中，全新数据目录会初始化默认 deepseek；公开评论和回复默认关闭。

## 在本地使用

目前面向有开发经验的用户，基于 Windows、DSH Desktop 2.0.18、Node.js 22+。原项目：[DSH Desktop](https://github.com/anywhere-labs/dsh-desktop)。请自行从上游获取对应版本的完整桌面程序。

1. 克隆本仓库。在一个独立的 DSH Desktop 2.0.18 安装目录中操作，并先关闭该程序。当前版本的定制文件不能直接用于其他版本。
2. 将本仓库 `resources/app/` 下的已跟踪文件（含package.json）按相同相对路径覆盖到安装目录。其余桌面壳文件和依赖使用完整上游安装提供的版本；本仓库不包含它们。
3. 插件目录保留在本地；在 DSH CLI 中将该目录作为本地 bundle 加到 desktop profile，例如：

   ```powershell
   dsh plugin --profile desktop add 'link:D:\path\to\cyber-pet\插件\dsh-bili-scroll'
   ```

   `dsh` 需来自同版本的 DSH 环境。详细插件说明见 [插件 README](插件/dsh-bili-scroll/README.md)。
4. 启动桌面程序，阅读操作说明，在左下 API连接填写自己的接口和模型。按界面提示保存并重启；不要使用他人的凭证或复制他人的数据目录。
5. 在宠物设置中安装B站所需Python依赖、扫码登录并检查连接，设置宠物人设和浏览口味。确认工作范围、自动发言开关及运行间隔后再开始。

定制桌面壳默认使用**安装目录下独立的“数据”文件夹**。`数据/` 应仅存在于自己的电脑，不能提交到仓库或随安装包分享。初次使用所需主依赖由设置面板安装，可选转写依赖不强制安装。

这份源码版安装说明没有经过另一台全新电脑的端到端安装验收，便携预览包也尚未在另一台全新电脑验收。

## 便携预览包

从[GitHub Release](https://github.com/yan450863-ui/cyber-pet/releases/tag/preview-2026-10-20)下载ZIP，完整解压后，双击DSH Desktop.exe；Node、Python及主B站依赖随包携带。首次打开只创建默认deepseek，阅读说明后自行配置API、扫码登录并开启需要的功能。自动评论与回复默认关闭。

便携模式由包根pet-portable.json标记启用；全部运行数据和桌面缓存留在包内“数据”，移动文件夹前退出程序，分享时不要带上自己的数据。API未配置前不启用默认模型，保存后重启生效。

开发者需先准备完整的当前版本安装和可用pip，再运行 `node 工具/build-portable.mjs 构建标签`。构建从程序白名单取文件，不复制本机数据，结果位于“发布”，附体积JSON与SHA256。发布目录不进入源码仓库。

## 已实施的精简

桌面启动只挂载64个活动组件。插件市场、通用对话界面、文件/浏览器/终端侧栏、Office预览与创作、多代理、目标/计划/工作流工具、原计划任务和自动更新入口已移除；保留模型、凭证、设置、插件装载、会话执行、受限文件读写、窗口、渲染、主题与认证传输底层。宠物聊天使用自己的状态，原DSH前端会话控制器不再挂载。

已清除100个独立依赖及6583个source map，共约490 MB。共享底层代码仍引用的模块保留，Node/Python运行环境与个人数据不清理。移除DSH原自动更新后，升级应按本项目发布说明进行，避免覆盖定制文件。

策略见 `resources/app/lib/pet-runtime-policy.js`；后台任务由desktop-cli加载 `pet-headless.patch.json`。装好定制文件后，把“工具”目录放到安装根目录，执行 `node 工具/slim-runtime.mjs` 预览，确认目标为该安装后加 `--apply` 清理；`--details` 可查看包名。工具仅适用于当前版本布局，不清理个人数据。不要在只有源码而没有完整DSH依赖的克隆目录中执行清理。

## 开发与验证

在 `插件/dsh-bili-scroll/` 下运行：

```powershell
node build-client.mjs
node --check client.js
node selfcheck.mjs
node --test lib/runtime-policy.test.mjs lib/browse-preferences.test.mjs lib/pets.test.mjs lib/pets-api.test.mjs lib/api-connection.test.mjs lib/cycle.test.mjs lib/operations.test.mjs lib/memes-python.test.mjs
```

本地定制环境已有49项测试通过；精简后真实模型的受限文件读写及B站登录/搜索均已验证。Python桥接测试需要可用的Python及对应依赖；插件README说明运行环境。测试使用临时数据，不会公开发评论。

## 使用说明与限制

视频资料可能仅有标题、简介、AI总结或字幕摘录；不表示模型完整看过视频。是否能够发表评论、通知对方及公开展示，由B站权限和接口实际结果决定。没有合适内容会跳过；不保证每轮都有评论。先以关闭公开发言的配置熟悉软件，再按自己的需要开启。

API连接页包含一个可选的第三方中转推广入口（带推荐参数），不影响普通API配置；本项目不要求使用该服务，也不提供可用性承诺。使用模型和B站服务时，应遵守相应服务规则。

## 致谢

- [anywhere-labs/dsh-desktop](https://github.com/anywhere-labs/dsh-desktop)：DSH Desktop，MIT。
- [c1overzz/dsh-bili-scroll](https://github.com/c1overzz/dsh-bili-scroll)：B站插件基础，MIT。
- bilibili-mcp（AGI_Ananas）：B站工具桥接基础，MIT；来源与声明见插件 vendor 目录。
