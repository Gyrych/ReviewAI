# circuit-agent-py

This service is a Python (FastAPI) reimplementation of the original `services/circuit-agent` Node.js microservice in the ReviewAI project. It aims to keep API compatibility while providing a modular, layered implementation.

## Quickstart

1. Create virtualenv and install dependencies:

```bash
python -m venv venv
# Windows: venv\Scripts\activate
# Unix: source venv/bin/activate
pip install -r requirements.txt
```

2. Run the service (development):

```bash
uvicorn app.main:app --reload --port 4001
```

3. Default base path: `/api/v1/circuit-agent` (configurable via env or `app/core/config.py`)

## Compatibility

- API endpoints and payload structures are implemented to match the original Node.js service. The service preserves artifacts, timeline events, and OpenRouter plugin shapes.

## Notes

- Attachments are handled by writing temporary files internally to reduce memory pressure; the external multipart behavior remains compatible.

## Docker

Build and run with docker-compose:

```bash
cd services/circuit-agent-py
docker-compose up --build
```

The service will be available on port 4001.

## Tests

Run tests with pytest (ensure dependencies installed):

```bash
$env:PYTHONPATH='.'; pytest -q
```
