# 赛博小宠物目录导航

本目录存放 DSH Desktop 程序和面向 B站自主互动的插件开发内容。

- `README.md`：公开仓库介绍、源码部署与验证方法。
- `PROJECT.md`：项目当前状态、有效需求和接手说明。
- `LICENSE`、`LICENSE-SCOPE.md`、`THIRD_PARTY_NOTICES.md`：非商用许可、适用范围及保留的上游声明。
- `.gitignore`：发布白名单；程序、依赖和个人数据保留本地。
- `工具/`：安装目录的精简工具、便携完整包/累计更新包构建与发布工具。
- `发布/`：本地便携预览ZIP、校验值和生成目录；不进入Git仓库。
- `赛博小宠物.exe`：桌面程序入口。
- `插件/`：本地插件源码；修改 B站插件从这里进入。
- `数据/`：本应用独立数据目录，包含配置、凭证、会话、插件数据和 Python 环境；QQ群独立数据在数据/qq。
- `resources/app/`：DSH Desktop 的程序包、内置模块及依赖。
- `resources/runtime/`：DSH 自带的 Node、Python 等运行环境。
- `locales/` 和根目录其余 DLL、PAK 等文件：Electron 运行资源，保留原生布局。

应用标识为 io.github.yan450863.cyberpet；账号、API配置、聊天、日志、桌面缓存、崩溃记录和临时文件均在本目录的“数据/”内。后台命令与依赖只使用随包 resources/，不读取其他 DSH 安装或全局 npm。

停用的旧QQ组件（不加载、不打包）：`resources/qq-runtime-slim/`；登录、缓存和连接密钥：`数据/qq/napcat/`。用户提供的原始NapCat安装文件夹保留。

停用的LLBot组件（不加载、不打包）：`resources/qq-llbot/`；上游包、完整性元数据与来源：`资料/qq-llbot/`；试用账号和运行数据：`数据/qq/llbot/`。

单群窗口自动化：源码`工具/qq-window-bridge.cs`，本地组件`resources/qq-window/bridge.exe`，绑定数据`数据/qq/window/`。

QQ单群窗口组件：`resources/qq-window/bridge.exe`；源码：`工具/qq-window-bridge.cs`；绑定设置：`数据/qq/window/`。
