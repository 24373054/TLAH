# TLAH：Talk Like A Human

- 这个项目需致力于构建一个超直观的prompt调试框架，便于开发者全面的理解prompt与AI返回内容。

## 启动方式

### 生产部署

```bash
# 一键部署（编译前端 + 启动 uvicorn 多 worker）
./start.sh

# 停止
./stop.sh

# 查看日志
tail -f .pids/server.log
tail -f .pids/build.log
```

部署后访问 `http://localhost:8000`，API 和前端均由同一端口提供服务。

环境变量（可选）：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | 8000 | 监听端口 |
| `WORKERS` | 4 | uvicorn worker 数量 |

### 开发调试

```bash
# 终端 1 — 后端（带热重载）
cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --port 8000

# 终端 2 — 前端（Vite dev server + HMR）
cd frontend && npm run dev
```

## 公网访问

通过 FRP 穿透到公网 `140.143.183.163:38024`（配置于 `/home/Matrix/yz/frp_0.68.1_linux_amd64/frpc.toml`）。

## 配置

- `.env` — 内测码等环境变量（`TLAH_BETA_ACCESS_CODE`）
- 前端首次访问需输入内测码
