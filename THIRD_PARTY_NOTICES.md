# Third-party notices / 第三方声明

本项目自有定制内容见 LICENSE-SCOPE.md；以下上游内容保持原许可证。

## DSH Desktop 2.0.18

Source: https://github.com/anywhere-labs/dsh-desktop

Published runtime overrides: resources/app/package.json and resources/app/lib/{main.js, desktop-cli.js, electron-runtime-Be7e-XQ5.js, client.js, profile-BePNPvSL.js, profile-channel-admission-BCSNO_nW.js, host-process-entry.js, native-ui/assets/compatibility-chrome-Bw7hoNWH.js}. New pet runtime policy and pruning tools are local contributions.

MIT License

Copyright (c) 2026 Anywhere Labs

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## dsh-bili-scroll

Source: https://github.com/c1overzz/dsh-bili-scroll

MIT License

Copyright (c) 2026 dsh-bili-duty contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---------------------------------------------------------------------------

本插件内含第三方代码：`vendor/bilibili-mcp/`
  · 项目：bilibili-mcp
  · 许可证：MIT，Copyright (c) 2026 AGI_Ananas
  · 完整许可见该目录下的 LICENSE 文件

（如果你要改版权署名 —— 比如换成你自己的名字或 GitHub 用户名 —— 改上面第一行那个
  "dsh-bili-duty contributors" 就行。）

## bilibili-mcp

Vendored in 插件/dsh-bili-scroll/vendor/bilibili-mcp/. See its README and LICENSE.

MIT License

Copyright (c) 2026 AGI_Ananas

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Unbundled runtime dependencies

Electron, Chromium, React, DSH core, the desktop dependency tree, Python packages and other runtime assets are not distributed in this repository. Their original licenses apply when obtained separately.

## QQ窗口模式

当前完整包不分发腾讯QQ、NapCat或LuckyLilliaBot。用户自行安装官方QQ；自有窗口组件通过Windows UI Automation读取一个用户指定的群窗口及发送纯文本，不注入QQ、不实现QQ协议。源码为工具/qq-window-bridge.cs。

本机历史试用目录不属于仓库或发布包。发布包保留所携带Electron/Chromium、DSH及其他依赖原有许可声明；本项目非商用条款不重新授权第三方材料。
