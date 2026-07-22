# TopFiles 在线文件创建器

一个基于 `Vue 3 + Vite + TypeScript + Node.js` 的轻量文本文件编辑、下载与云端保存工具。

## 核心能力

- 首次访问创建单账号；登录后可保存、管理并跨设备访问云端文件
- 未登录也可编辑、下载和恢复本地草稿
- 云端自动保存采用防抖串行队列，避免网络延迟导致旧内容覆盖新内容
- 公开链接格式为 `https://your-domain/u/<filename>`，可一键复制
- 为防止同源脚本执行，所有公开分享内容均以纯文本下载/查看，不提供 HTML、图片、PDF 或脚本预览
- 登录后的文件工作区支持新建、选择、分享、删除与账号设置；窄屏下以可收起抽屉显示

## 项目功能

- 支持在线创建与编辑常见文本文件
- 顶部输入文件名并选择后缀，编辑区实时编写内容
- 支持直接输入完整文件名（含后缀），并自动识别文件类型
- 一键下载当前文件（自动处理非法文件名字符与后缀）
- JSON、HTML、XML、CSS、PHP、Python、JavaScript、TypeScript、JSX、TSX、Vue 和 Shell 支持语法高亮与行号
- 支持 Markdown、CSV、TSV、SQL、TOML、YAML、M3U/M3U8、配置文件与 `.env` 等文本格式
- 支持暗黑/明亮主题切换（右上角图标按钮）
- 支持中英文切换（右上角图标按钮）
- 支持统一导入弹窗：可输入远程 URL 或选择本地文件
- 支持 `r.jina.ai` 导入模式，并自动清理头部元信息
- 自动保存草稿（文件名、后缀、内容）并在下次打开时自动恢复
- 提供“清空草稿”按钮，一键重置本地草稿
- 编辑器按需加载，降低首次打开的资源体积

## 技术栈

- `Vue 3`
- `Vite`
- `TypeScript`
- `CodeMirror 6`
- `vue-i18n`
- `Pinia`（状态管理）
- `axios`（HTTP 客户端）
- `Node.js` HTTP 服务、SQLite、JWT 与 bcryptjs（云端文件和登录）

## 本地开发

在两个终端分别启动后端和前端：

```bash
cd server
npm install
npm start
```

```bash
npm install
npm run dev
```

前端默认地址为 `http://localhost:5173`，开发服务器会将 `/api` 与 `/u` 代理到 `http://127.0.0.1:3000`。

## 构建与预览

```bash
npm run build
npm run preview
```

服务端测试：

```bash
cd server
npm test
```

## 使用说明

- 右上角“导入”图标：打开自建弹窗导入内容
  - 填写 URL：读取远程文本内容
  - 选择本地文件：直接读取本地文本内容
- 导入后会自动填充编辑区，并尽量识别文件名与后缀
- 远程读取受 CORS 影响，必要时可在导入弹窗启用 `r.jina.ai` 模式

## 部署方式

云端文件、登录与分享依赖 Node.js 服务和 SQLite，不能只部署到静态托管平台。生产部署请参阅 [部署文档](./docs/deploy.md)，其中包含环境变量、systemd、Nginx、HTTPS 与备份配置。

生产环境必须设置：

```env
JWT_SECRET=<至少 32 字节的随机密钥>
COOKIE_SECURE=true
```

## 授权说明

本项目采用 `GNU AGPL-3.0` 协议。

- 允许修改、分发与商用
- 分发时需保留版权与许可声明
- 对外提供网络服务的修改版本需公开对应源代码

详细条款见仓库根目录的 [LICENSE](./LICENSE)。

## 作者信息

程序设计：刘承  
邮箱：wusky1988@gmail.com
