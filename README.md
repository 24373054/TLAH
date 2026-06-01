# TLAH：Talk Like A Human

- 这个项目需致力于构建一个超直观的prompt调试框架，便于开发者全面的理解prompt与AI返回内容。

  启动方式

  # 终端 1 — 后端
  cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --port 8000

  # 终端 2 — 前端
  cd frontend && npm run dev