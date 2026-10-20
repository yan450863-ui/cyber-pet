# 赛博小宠物目录导航

本目录存放 DSH Desktop 程序和面向 B站自主互动的插件开发内容。

- `README.md`：公开仓库介绍、源码部署与验证方法。
- `PROJECT.md`：项目当前状态、有效需求和接手说明。
- `LICENSE`、`LICENSE-SCOPE.md`、`THIRD_PARTY_NOTICES.md`：非商用许可、适用范围及保留的上游声明。
- `.gitignore`：发布白名单；程序、依赖和个人数据保留本地。
- `工具/`：安装目录的可重复运行精简工具，默认只预览待清理内容。
- `DSH Desktop.exe`：桌面程序入口。
- `插件/`：本地插件源码；修改 B站插件从这里进入。
- `数据/`：DSH 默认数据目录，包含配置、凭证、会话、插件数据和 Python 环境。
- `resources/app/`：DSH Desktop 的程序包、内置模块及依赖。
- `resources/runtime/`：DSH 自带的 Node、Python 等运行环境。
- `locales/` 和根目录其余 DLL、PAK 等文件：Electron 运行资源，保留原生布局。

DSH 桌面壳自身的缓存与日志仍按 Electron 原生结构保存在 `%APPDATA%/DSH Desktop/`；其数据目录选择记录指向本项目的 `数据/`。
