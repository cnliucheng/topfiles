# TopFiles 在线文件创建器

一个基于 `Vite + Vue 3 + TypeScript` 的在线文件编辑与下载工具。

## 项目功能

- 支持在线创建与编辑常见文件：`txt`、`json`、`html`、`css`、`php`、`py`、`js`、`ts`
- 顶部输入文件名并选择后缀，编辑区实时编写内容
- 一键下载当前文件（自动拼接后缀并处理非法文件名字符）
- 代码文件支持语法高亮与行号
- 支持暗黑/明亮主题切换（右上角图标按钮）
- 支持中英文切换（右上角图标按钮）
- 页面采用居中布局（约屏幕 80% 区域），兼容桌面与移动端

## 技术栈

- `Vue 3`
- `Vite`
- `TypeScript`
- `CodeMirror 6`
- `vue-i18n`

## 本地开发

```bash
npm install
npm run dev
```

默认开发地址：`http://localhost:5173`

## 构建与预览

```bash
npm run build
npm run preview
```

## 部署方式

### 1. 部署到静态托管平台（推荐）

适用于 Vercel、Netlify、Cloudflare Pages、GitHub Pages 等。

- 构建命令：`npm run build`
- 产物目录：`dist`

### 2. 部署到 Nginx

1. 执行 `npm run build`
2. 将 `dist` 目录内容上传到服务器站点目录
3. 配置 Nginx 指向该目录并开启静态资源访问

示例：

```nginx
server {
  listen 80;
  server_name your-domain.com;

  root /var/www/topfiles;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

## 授权说明

本项目采用 `GNU AGPL-3.0` 协议。

- 允许修改、分发与商用
- 分发时需保留版权与许可声明
- 对外提供网络服务的修改版本需公开对应源代码

详细条款见仓库根目录的 [LICENSE](./LICENSE)。

## 作者信息

程序设计：刘承  
邮箱：chrislc@gmail.com
