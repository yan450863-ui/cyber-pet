# 工具目录

- `slim-runtime.mjs`：在本项目安装目录中分析并清理已剔除功能的独立依赖及生成的 source map。默认只预览数量和体积，`--details` 列出包名，`--apply` 才删除；保留仍被代码引用的模块，不接触“数据”、Node/Python运行环境或账号配置。

- `build-portable.mjs`：制作Windows x64便携预览ZIP，仅从程序和插件白名单取文件，主B站依赖装入发布包的Python，不复制实际“数据”。需完整安装及本机可用的pip模块；运行 `node 工具/build-portable.mjs 构建标签`，结果在“发布”。`--resume`恢复已复制的失败构建；`--repack`仅重新压缩标记过的干净暂存目录，不重新同步源码。
