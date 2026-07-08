# 部署 TopFiles

## 1. 构建前端

```bash
npm install
npm run build
```

产物在 `dist/`。

## 2. 上传到服务器

```bash
rsync -av --exclude node_modules --exclude .git ./ user@server:/opt/topfiles/
```

在服务器上：

```bash
cd /opt/topfiles/server
npm ci --production
```

## 3. 配置环境

`server/.env`：

```bash
PORT=3000
JWT_SECRET=<openssl rand -hex 32>
COOKIE_SECURE=true
STATIC_DIR=../dist
DB_PATH=/opt/topfiles/data/data.db
```

```bash
chmod 600 /opt/topfiles/server/.env
mkdir -p /opt/topfiles/data /opt/topfiles/backups
```

## 4. 启动服务

```bash
sudo cp deploy/topfiles.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now topfiles
sudo systemctl status topfiles
```

## 5. 配置 Nginx

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/topfiles
sudo ln -s /etc/nginx/sites-available/topfiles /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## 6. HTTPS 证书

```bash
sudo certbot --nginx -d app.example.com
```

## 7. 备份

```bash
sudo crontab -e
# 添加：
0 3 * * * /opt/topfiles/deploy/backup.sh
```
