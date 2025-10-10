import requests, os, glob
url='http://localhost:4001/api/v1/circuit-agent/orchestrate/review'
headers={'Authorization':'Bearer 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'}
files_list = glob.glob('test/*.png')
if not files_list:
    print('NO_FILE')
    raise SystemExit(2)
file_path = files_list[0]
print('FOUND', file_path)
for enable in ['true','false']:
    try:
        with open(file_path,'rb') as f:
            files={'files': (os.path.basename(file_path), f, 'image/png')}
            data={'apiUrl':'https://openrouter.ai','model':'openai/gpt-5-mini','dialog':'甯垜鍒嗘瀽杩欎釜鐢佃矾','enableSearch':enable,'language':'zh'}
            print('POST enableSearch=', enable)
            r = requests.post(url, headers=headers, data=data, files=files, timeout=600)
            print('STATUS', r.status_code)
            out = f'test/test_enableSearch_{enable}.json'
            with open(out, 'wb') as o:
                o.write(r.content)
            print('WROTE', out)
    except Exception as e:
        print('ERR', e)
