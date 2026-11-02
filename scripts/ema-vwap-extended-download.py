"""Explicitly authorized one-time public archive acquisition. No Numaron imports."""
import concurrent.futures, datetime, hashlib, io, json, pathlib, urllib.request, zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'outputs/ema-vwap-extended-20261019'
DATA = OUT / 'data'
POWER = ROOT / 'artifacts/founder-integration-20261012/power-state.jsonl'

def off():
    p = json.loads(POWER.read_text(encoding='utf-8').strip().splitlines()[-1])
    if p.get('enabled') is not False:
        raise RuntimeError('OFF required; no power changes attempted')
    return {'enabled': p['enabled'], 'revision': p['revision']}

def read(url, limit):
    with urllib.request.urlopen(url, timeout=45) as response:
        if response.url != url:
            raise RuntimeError('Unexpected redirect')
        data = response.read(limit + 1)
        if len(data) > limit:
            raise RuntimeError('Download bound exceeded')
        return data

def acquire(task):
    symbol, year, month = task
    off()
    name = f'{symbol}-5m-{year}-{month:02d}'
    target = DATA / name
    evidence = target.with_suffix('.json')
    if evidence.exists():
        saved = json.loads(evidence.read_text())
        if hashlib.sha256(target.with_suffix('.zip').read_bytes()).hexdigest() != saved['archiveSha256']:
            raise RuntimeError('Cached archive changed')
        if hashlib.sha256(target.with_suffix('.csv').read_bytes()).hexdigest() != saved['csvSha256']:
            raise RuntimeError('Cached CSV changed')
        return saved
    url = f'https://data.binance.vision/data/spot/monthly/klines/{symbol}/5m/{name}.zip'
    archive = read(url, 8_000_000)
    check = read(url + '.CHECKSUM', 4096).decode().strip().split()[0]
    digest = hashlib.sha256(archive).hexdigest()
    if digest != check:
        raise RuntimeError('Provider checksum mismatch')
    with zipfile.ZipFile(io.BytesIO(archive)) as z:
        entries = z.infolist()
        if len(entries) != 1 or entries[0].filename != name + '.csv' or entries[0].file_size > 15_000_000:
            raise RuntimeError('Archive bounds/structure invalid')
        csv = z.read(entries[0])
    saved = {'symbol': symbol, 'year': year, 'month': month, 'url': url,
             'archiveSha256': digest, 'csvSha256': hashlib.sha256(csv).hexdigest(),
             'providerChecksumMatched': True, 'bytes': len(archive),
             'retrievedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()}
    target.with_suffix('.zip').write_bytes(archive)
    target.with_suffix('.csv').write_bytes(csv)
    evidence.write_text(json.dumps(saved, indent=2))
    print(f'Verified {name}', flush=True)
    return saved

if __name__ == '__main__':
    before = off()
    DATA.mkdir(parents=True, exist_ok=True)
    tasks = [(s, y, m) for s in ['ETHUSDT', 'BTCUSDT'] for y in range(2022, 2026) for m in range(1, 13)]
    rows, errors = [], []
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(acquire, t): t for t in tasks}
        for f in concurrent.futures.as_completed(futures):
            try:
                rows.append(f.result())
            except Exception as e:
                errors.append({'task': futures[f], 'error': str(e)})
    result = {'archives': sorted(rows, key=lambda r: (r['symbol'], r['year'], r['month'])),
              'errors': errors, 'powerBefore': before, 'powerAfter': off(),
              'authorizedScope': 'One-time 2022-2025 public ETHUSDT/BTCUSDT 5m archives only'}
    (OUT / 'download-manifest.json').write_text(json.dumps(result, indent=2))
    print(f'Archives verified: {len(rows)}/96. Errors: {len(errors)}', flush=True)
    if errors:
        raise SystemExit(1)
