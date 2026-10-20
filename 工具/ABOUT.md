# 工具目录

- `slim-runtime.mjs`：在本项目安装目录中分析并清理已剔除功能的独立依赖及生成的 source map。默认只预览数量和体积，`--details` 列出包名，`--apply` 才删除；保留仍被代码引用的模块，不接触“数据”、Node/Python运行环境或账号配置。
