from fastapi.testclient import TestClient
from app.main import app
import io
import json

client = TestClient(app)

def test_orchestrate_direct():
    files = {'files': ('test.png', io.BytesIO(b'PNGDATA'), 'image/png')}
    data = {
        'model': 'test-model',
        'directReview': 'true'
    }
    r = client.post('/api/v1/circuit-agent/orchestrate/review', files=files, data=data)
    assert r.status_code == 200
    j = r.json()
    assert 'markdown' in j

def test_orchestrate_identify():
    # call without directReview to trigger identify
    files = {'files': ('test.png', io.BytesIO(b'PNGDATA'), 'image/png')}
    data = {
        'model': 'test-model'
    }
    r = client.post('/api/v1/circuit-agent/orchestrate/review', files=files, data=data)
    assert r.status_code == 200
    j = r.json()
    # identify returns dict with expected keys
    assert isinstance(j, dict)
    assert 'keyComponents' in j or 'markdown' in j

def test_sessions_crud():
    # save
    payload = {'foo': 'bar'}
    r = client.post('/api/v1/circuit-agent/sessions/save', json=payload)
    assert r.status_code == 200
    sid = r.json().get('id')
    assert sid
    # list
    r2 = client.get('/api/v1/circuit-agent/sessions/list')
    assert r2.status_code == 200
    assert sid in r2.json().get('items', [])
    # read
    r3 = client.get(f'/api/v1/circuit-agent/sessions/{sid}')
    assert r3.status_code == 200
    d = r3.json()
    assert d.get('foo') == 'bar'
    # delete
    r4 = client.delete(f'/api/v1/circuit-agent/sessions/{sid}')
    assert r4.status_code == 200
    r5 = client.get(f'/api/v1/circuit-agent/sessions/{sid}')
    assert r5.status_code == 200 or r5.status_code == 404
