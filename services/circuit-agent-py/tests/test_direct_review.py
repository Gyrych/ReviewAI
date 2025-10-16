from fastapi.testclient import TestClient
from app.main import app
import io

client = TestClient(app)

def test_health():
    r = client.get('/api/v1/circuit-agent/health')
    assert r.status_code == 200
    assert r.json().get('status') == 'ok'

def test_direct_review_mock():
    files = {'files': ('test.png', io.BytesIO(b'PNGDATA'), 'image/png')}
    data = {
        'model': 'test-model'
    }
    r = client.post('/api/v1/circuit-agent/modes/direct/review', files=files, data=data)
    assert r.status_code == 200
    j = r.json()
    assert 'markdown' in j
