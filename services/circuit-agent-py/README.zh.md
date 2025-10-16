# circuit-agent-py

这是 `services/circuit-agent` 的 Python (FastAPI) 重构实现，目标是保持对外 API 完全兼容并提供分层、模块化设计。

## 快速开始

1. 创建虚拟环境并安装依赖：

```bash
python -m venv venv
# Windows: venv\\Scripts\\activate
# Unix: source venv/bin/activate
pip install -r requirements.txt
```

2. 启动服务（开发模式）：

```bash
uvicorn app.main:app --reload --port 4001
```

3. 默认基路径：`/api/v1/circuit-agent`（可通过环境变量或 `app/core/config.py` 修改）

## 兼容性说明

- API 接口与原 Node.js 服务保持一致，保留 artifacts、timeline 及 OpenRouter 插件形状。

## 注意

- 为降低内存占用，附件在内部会临时写入文件，外部 multipart 行为保持兼容。
