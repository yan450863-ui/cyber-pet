# 工具目录

- `slim-runtime.mjs`：在本项目安装目录中分析并清理已剔除功能的独立依赖及生成的 source map。默认只预览数量和体积，`--details` 列出包名，`--apply` 才删除；保留仍被代码引用的模块，不接触“数据”、Node/Python运行环境或账号配置。

- `build-portable.mjs`：制作Windows x64便携预览ZIP，仅从程序和插件白名单取文件，主B站依赖装入发布包的Python，不复制实际“数据”。需完整安装及本机可用的pip模块；运行 `node 工具/build-portable.mjs 构建标签`，结果在“发布”。`--resume`恢复已复制的失败构建；`--repack`仅重新压缩标记过的干净暂存目录，不重新同步源码。

- `upload-release.mjs`：在用户明确要求发布后，将指定构建上传为GitHub预览Release；先核对本地SHA256，以草稿上传ZIP、校验文件和说明，核验服务器体积/摘要后公开。完整包运行 `node 工具/upload-release.mjs 构建标签`，更新包运行 `node 工具/upload-release.mjs 更新标签 --update`；复用系统Git凭证但不记录凭证。

- `build-update.mjs`：从已发布完整ZIP计算累计文件差异，校验运行环境/依赖未变，写入版本、摘要、允许的旧文件状态及payload。运行 `node 工具/build-update.mjs 更新标签 [完整基包ZIP路径]`。版本说明默认读取`工具/更新标签.notes.md`，可用`--notes 文件路径`指定，并随更新包附带。默认基包为2026-10-20-preview；输出在发布目录。保留本系列历史`.manifest.json`支持后续跨更新；若遗失，从已发布更新ZIP恢复manifest后构建。
- `apply-update.mjs`、`update-launcher.ps1`：分发包内更新器及Windows启动器的权威源码；只能更新标记过的兼容便携目录，保留数据，检查进程/摘要/路径/版本，支持中断后重跑与更新互斥。更新包通过更新.cmd选择原安装目录，不需要另装Node。无回滚备份。
- `apply-update.test.mjs`：更新/重复执行、数据保留、版本/底层/自改文件拒绝、损坏包、越界、目录链接、运行中、互斥和中断恢复测试；运行 `node --test 工具/apply-update.test.mjs`。

- `2026-10-24-update2.notes.md`：独立性格、小红书接入和目录隔离修复的中文发布说明。

- `portable-isolation.test.mjs`：验证应用标识、自有数据/缓存/临时目录、外部DSH环境覆盖、依赖范围及配置保留。

- `verify-qq-live.mjs`：显式传入 --use-model 后用本机模拟QQ接口及真实已配置模型验证群回复，不向真实QQ群发送；会消耗少量Token。
- 完整包构建可用 `--reuse-python` 复用已验证的随包Python依赖，仍执行核心依赖导入检查；不会读取个人账号数据。


- `qq-window-bridge.cs`：单群QQ的Windows UI Automation本地辅助程序源码，编译输出为resources/qq-window/bridge.exe；不含QQ协议组件。

- `2026-10-25.notes.md`：独立完整包及QQ单群窗口模式的使用、限制和安全边界说明。
