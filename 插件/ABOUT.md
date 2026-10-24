# 插件目录导航

- `dsh-bili-scroll/`：DSH 当前通过本地链接加载的宠物平台互动插件源码（B站与小红书），基于 npm 0.1.7。
- `dsh-bili-scroll/index.js`：后端工具、HTTP 接口、定时运行和依赖安装。
- `dsh-bili-scroll/client.js`：客户端入口及设置面板，宠物界面生成区。
- dsh-bili-scroll/pet-shell.fragment.js：宠物专用界面、选择/新建抽屉及两类操作日志；运行build-client.mjs合入客户端。
- `dsh-bili-scroll/lib/`：双任务组调度（`cycle.mjs`）、执行与持久去重（`cycle-worker.mjs`）、测试（`cycle.test.mjs`）、登录和 MCP 支持。
- dsh-bili-scroll/lib/xhs-*.mjs、social-judge.mjs：小红书连接组件、平台设置、笔记/通知执行与受限模型任务；性格权威对象在pets.mjs管理。
- `dsh-bili-scroll/prompts/`：任务提示词。
- `dsh-bili-scroll/vendor/`：内置 bilibili-mcp 与依赖声明。
- 定制说明及许可证见插件内 `README.md`、`LICENSE`；其内部目录保留原生结构。

此处为实际生效源码，不是备份；运行数据保存在 DSH 默认数据目录，具体位置见上级 `ABOUT.md`。
