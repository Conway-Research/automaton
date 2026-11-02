"""Fixed container protocol: no customer code, commands, URLs or host paths."""
import base64,hashlib,json,os,re,socket,sys
from pathlib import Path
LIMIT=20*1024*1024
NAME=re.compile(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,119}\.(?:png|jpe?g|json)')

def decode_files(rows,root):
    if not isinstance(rows,list) or not 1<=len(rows)<=40:raise ValueError('Bounded files required')
    decoded=[];seen=set();total=0
    for row in rows:
        name=row.get('name')
        if not isinstance(name,str) or not NAME.fullmatch(name) or re.match(r'(?i)^(con|prn|aux|nul|com[1-9]|lpt[1-9])\.',name) or name.lower() in seen:raise ValueError('Safe unique files required')
        seen.add(name.lower());data=base64.b64decode(row['data'],validate=True);total+=len(data)
        if not 0<len(data)<=10*1024*1024 or total>LIMIT or hashlib.sha256(data).hexdigest()!=row.get('sha256'):raise ValueError('Asset size or hash differs')
        decoded.append((name,data))
    root.mkdir(parents=True,exist_ok=True)
    for name,data in decoded:
        with (root/name).open('xb') as stream:stream.write(data)
    return [{'name':n,'sha256':hashlib.sha256(b).hexdigest()} for n,b in decoded]

def protection():
    import PIL,numpy,cv2
    if os.getuid()!=65534:raise ValueError('Unprivileged UID required')
    if not re.search(r'CapEff:\s+0+\s',Path('/proc/self/status').read_text()):raise ValueError('Capabilities present')
    if set(os.listdir('/sys/class/net'))-{'lo'}:raise ValueError('Network interface present')
    for path in ('/numaron-root-write-probe','/opt/numaron-images/write-probe'):
        try:
            with open(path,'x') as stream:stream.write('probe')
        except OSError:continue
        raise ValueError('Read-only root/source required')
    if any(Path(p).exists() for p in ('/mnt/c','/run/host')):raise ValueError('Host exposure detected')
    def cg(name):return Path('/sys/fs/cgroup',name).read_text().strip()
    memory=cg('memory.max');swap=cg('memory.swap.max');pids=cg('pids.max');cpu=cg('cpu.max').split()
    if memory=='max' or int(memory)>536870912 or swap!='0' or pids=='max' or int(pids)>64 or cpu[0]=='max' or int(cpu[0])>int(cpu[1]):raise ValueError('Resource limits not enforced')
    with socket.socket() as s:
        s.settimeout(.5)
        try:s.connect(('1.1.1.1',443))
        except OSError:pass
        else:raise ValueError('External network reachable')
    return {'uid':os.getuid(),'capabilitiesZero':True,'network':'none','hostMounts':False,'readOnlyRoot':True,'memoryMax':int(memory),'swapMax':int(swap),'pidsMax':int(pids),'cpuMax':cpu,'packages':{'Pillow':PIL.__version__,'numpy':numpy.__version__,'opencv':cv2.__version__}}

def dispatch(payload,work):
    operation=payload.get('operation')
    if operation not in ('probe','run','verify'):raise ValueError('Fixed operation required')
    guards=protection()
    if operation=='probe':return {'passed':True,'protection':guards}
    sys.path.insert(0,str(Path(__file__).resolve().parent))
    from capability_entry import execute,verify
    if operation=='verify':
        output=work/'verify';decode_files(payload['files'],output)
        return {**verify(output,payload['receipt']),'protection':guards}
    inputs=work/'inputs';assets=decode_files(payload['files'],inputs)
    output=work/'output';receipt=execute(payload['request'],inputs,output,assets=assets)
    if not verify(output,receipt)['passed']:raise ValueError('Independent image structure check failed')
    rows=[];total=0
    for p in sorted(output.iterdir()):
        if not p.is_file() or p.is_symlink() or not NAME.fullmatch(p.name):raise ValueError('Unexpected export')
        data=p.read_bytes();total+=len(data)
        if len(data)>10*1024*1024 or total>LIMIT:raise ValueError('Bounded export required')
        rows.append({'name':p.name,'sha256':hashlib.sha256(data).hexdigest(),'data':base64.b64encode(data).decode('ascii')})
    return {'passed':True,'receipt':receipt,'files':rows,'protection':guards}

if __name__=='__main__':
    raw=sys.stdin.buffer.read(40*1024*1024+1)
    if len(raw)>40*1024*1024:raise ValueError('Bounded protocol required')
    print(json.dumps(dispatch(json.loads(raw),Path('/work'))))
