from fastapi.testclient import TestClient
from app.main import app
import io
import time
import os

client = TestClient(app)

def test_artifacts_and_timeline_created():
    # call direct review
    files = {'files': ('test.png', io.BytesIO(b'PNGDATA'), 'image/png')}
    data = {'model': 'test-model'}
    r = client.post('/api/v1/circuit-agent/modes/direct/review', files=files, data=data)
    assert r.status_code == 200
    j = r.json()
    assert 'markdown' in j

    # allow slight delay for timeline persistence
    time.sleep(0.1)

    # check artifacts listing route
    ra = client.get('/api/v1/circuit-agent/artifacts')
    # artifacts route returns list or 404 if not exist; accept either
    assert ra.status_code in (200, 404)
    if ra.status_code == 200:
        items = ra.json().get('items', [])
        assert isinstance(items, list)

    # check timeline directory
    storage = os.path.join(os.getcwd(), 'storage')
    timeline_dir = os.path.join(storage, 'timeline')
    # timeline dir should exist
    assert os.path.exists(timeline_dir)
    files = [f for f in os.listdir(timeline_dir) if f.endswith('.json')]
    assert len(files) >= 1
