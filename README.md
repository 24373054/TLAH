# TLAH：Talk Like A Human

- 这个项目需致力于构建一个超直观的prompt调试框架，便于开发者全面的理解prompt与AI返回内容。

## 启动方式

### 一键启动 / 停止

```bash
# 启动（后台运行后端 + 前端）
./start.sh

# 停止
./stop.sh

# 查看日志
tail -f .pids/backend.log
tail -f .pids/frontend.log
```

### 手动启动（调试用）

```bash
# 终端 1 — 后端
cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --port 8000

# 终端 2 — 前端
cd frontend && npm run dev
```

## 公网访问

通过 FRP 穿透到公网 `140.143.183.163:38024`（配置于 `/home/Matrix/yz/frp_0.68.1_linux_amd64/frpc.toml`）。
