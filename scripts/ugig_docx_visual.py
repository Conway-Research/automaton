"""Opt-in local DOCX visual evidence. Never grants work, review or delivery rights.

Only bounded public paragraph documents are supported. Renderer is a separate
process with its own temporary profile; this is not an OS security sandbox.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import unicodedata
import xml.etree.ElementTree as ET
from docx import Document
from ugig_office import check_office


def require(ok, message):
    if not ok: raise ValueError(message)


def sha(data): return hashlib.sha256(data).hexdigest()


def normalized(text):
    return re.sub(r'\s+', '', unicodedata.normalize('NFKC', text).replace('\u00ad', ''))


def check_layout(pages, paragraphs, headings, expected_pages):
    issues=[]
    if normalized(''.join(paragraphs)) != normalized(''.join(p['text'] for p in pages)):
        issues.append('text-mismatch')
    if any(p['outside'] for p in pages): issues.append('text-outside-margins')
    if any(not p['text'].strip() for p in pages): issues.append('blank-page')
    def locations(text):
        return [i+1 for i,p in enumerate(pages) if normalized(text) in normalized(p['text'])]
    for heading, following in headings:
        # Check a bounded beginning of the next paragraph; long paragraphs may
        # legitimately span pages. Ambiguity is not treated as success.
        a,b=locations(heading),locations(' '.join(following.split()[:8]))
        if len(a)!=1 or len(b)!=1: issues.append('heading-location-ambiguous')
        elif a[0]!=b[0]: issues.append('heading-separated')
    for text,page in expected_pages.items():
        if locations(text)!=[page]: issues.append('page-break-mismatch')
    return sorted(set(issues))


def regular(path, limit):
    p=Path(path).absolute()
    for item in [p,*p.parents]:
        require(not item.is_symlink() and not item.is_junction(), 'linked path blocked')
    stat=p.stat()
    require(p.is_file() and stat.st_nlink==1 and 0<stat.st_size<=limit, 'file bounds')
    with p.open('rb') as handle:
        before=os.fstat(handle.fileno())
        data=handle.read(limit+1)
        after=os.fstat(handle.fileno())
    require(before.st_ino==stat.st_ino and before.st_size==after.st_size==len(data)
            and before.st_mtime_ns==after.st_mtime_ns and len(data)<=limit,'file changed')
    return data


def run(args, cwd, env, timeout=60):
    flags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0
    with tempfile.TemporaryFile() as log:
        p=subprocess.Popen([str(a) for a in args],cwd=cwd,env=env,stdin=subprocess.DEVNULL,
                           stdout=log,stderr=log,creationflags=flags)
        try: code=p.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            if os.name=='nt':
                subprocess.run([str(Path(os.environ['SYSTEMROOT'])/'System32/taskkill.exe'),'/PID',str(p.pid),'/T','/F'],
                               stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=flags,timeout=10)
            p.kill();p.wait();raise ValueError('renderer timeout')
        require(code==0,'renderer failed')
        log.seek(0);return log.read(8192).decode('utf-8',errors='replace').strip()


def inspect_docx(source, output, permission, soffice, renderer_sha256, *, poppler=None, expected_pages=None):
    require(permission.get('privacy')=='public' and permission.get('customerApproved') is True,
            'public customer permission required')
    require(permission.get('workKind') in ('document-cleanup','support-templates'),'work kind')
    data=regular(source,10*1024*1024)
    require(permission.get('inputSha256')==sha(data),'exact input permission required')
    check_office(data)
    import io, zipfile
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        # XML prefixes are arbitrary aliases, not element identities. Inspect
        # every Word XML part, including headers, before invoking a renderer.
        blocked={'fldSimple','instrText','object','drawing','altChunk','fldChar'}
        for name in z.namelist():
            if name.startswith('word/') and name.endswith('.xml'):
                try: tree=ET.fromstring(z.read(name))
                except ET.ParseError as exc: raise ValueError('invalid Word XML') from exc
                require(not any(e.tag.rsplit('}',1)[-1] in blocked for e in tree.iter()),
                        'active or unsupported document content')
    doc=Document(io.BytesIO(data))
    require(len(doc.sections)==1 and not doc.tables and not doc.inline_shapes,'paragraph-only document required')
    require(not any(p.text for p in doc.sections[0].header.paragraphs+doc.sections[0].footer.paragraphs),'headers/footers unsupported')
    paragraphs=[p.text for p in doc.paragraphs if p.text.strip()]
    require(0<len(paragraphs)<=300 and sum(map(len,paragraphs))<=50000,'document bounds')
    headings=[]
    for i,p in enumerate(doc.paragraphs):
        if p.style.name.startswith('Heading'):
            following=next((q.text for q in doc.paragraphs[i+1:] if q.text.strip()),None)
            require(following,'heading without body');headings.append((p.text,following))
    expected_pages=expected_pages or {}
    require(isinstance(expected_pages,dict) and len(expected_pages)<=30 and
            all(isinstance(k,str) and k.strip() and type(v)==int and 1<=v<=30 for k,v in expected_pages.items()),'page expectations')
    exe=Path(soffice).absolute()
    require(sha(regular(exe,20*1024*1024))==renderer_sha256,'renderer version hash mismatch')
    poppler=Path(poppler).absolute() if poppler else None
    require(poppler and (poppler/'pdftoppm.exe').is_file(),'explicit Poppler required')
    output=Path(output).absolute()
    require(not output.exists() and output.parent.is_dir(),'new output directory required')
    for p in [output.parent,*output.parent.parents]:
        require(not p.is_symlink() and not p.is_junction(),'linked output blocked')
    with tempfile.TemporaryDirectory(prefix='docx-visual-') as temp:
        job=Path(temp);profile=job/'profile';profile.mkdir();export=job/'export';export.mkdir()
        (job/'input.docx').write_bytes(data)
        # Disable macros; external relationships were rejected before rendering.
        (profile/'registrymodifications.xcu').write_text('''<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry"><item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item></oor:items>''')
        env={k:os.environ[k] for k in ('SYSTEMROOT','WINDIR') if k in os.environ}
        env.update(TEMP=temp,TMP=temp,USERPROFILE=temp,APPDATA=str(profile),LOCALAPPDATA=temp,
                   PATH=str(exe.parent)+os.pathsep+str(poppler))
        # A fresh profile initializes bundled extensions on Windows. The
        # ordinary 15-second metadata timeout was too short for that first run.
        version=run([exe,'-env:UserInstallation='+profile.as_uri(),'--headless','--version'],job,env,60)
        run([exe,'-env:UserInstallation='+profile.as_uri(),'--headless','--nologo','--nodefault',
             '--norestore','--convert-to','pdf:writer_pdf_Export','--outdir',export,job/'input.docx'],job,env)
        pdf=export/'input.pdf';pdf_data=regular(pdf,25*1024*1024)
        bbox=job/'layout.json'
        extract = "import pdfplumber,pypdfium2,json,sys; p=pdfplumber.open(sys.argv[1]); d=pypdfium2.PdfDocument(sys.argv[1]); json.dump([{'width':s.width,'height':s.height,'words':s.extract_words(),'text':d[i].get_textpage().get_text_range()} for i,s in enumerate(p.pages)],open(sys.argv[2],'w',encoding='utf-8')); p.close()"
        run([sys.executable,'-c',extract,pdf,bbox],job,env,20)
        require(bbox.stat().st_size<=10*1024*1024,'layout bounds')
        elements=json.loads(bbox.read_text(encoding='utf-8'))
        require(1<=len(elements)<=30,'page count')
        section=doc.sections[0];left=section.left_margin.pt;right=section.right_margin.pt
        top=section.top_margin.pt;bottom=section.bottom_margin.pt
        pages=[]
        for number,page in enumerate(elements,1):
            width,height=float(page['width']),float(page['height'])
            require(100<=width<=1500 and 100<=height<=1500,'page dimensions')
            words=page['words']
            outside=any(float(w['x0'])<left-3 or float(w['x1'])>width-right+3 or
                        float(w['top'])<top-3 or float(w['bottom'])>height-bottom+3 for w in words)
            image=export/f'page-{number}'
            run([poppler/'pdftoppm.exe','-f',number,'-l',number,'-r','96','-singlefile','-png',pdf,image],job,env,20)
            png=regular(image.with_suffix('.png'),12*1024*1024)
            pages.append({'page':number,'width':width,'height':height,'text':page['text'],
                          'outside':outside,'image':image.name+'.png','imageSha256':sha(png)})
        issues=check_layout(pages,paragraphs,headings,expected_pages)
        report={'schema':'numaron-docx-visual-v1','inputSha256':sha(data),'workKind':permission['workKind'],
                'rendererVersion':version,'rendererSha256':renderer_sha256,'pdfSha256':sha(pdf_data),
                'expectedPages':expected_pages,'pages':pages,'issues':issues,'geometryPassed':not issues,'visualReviewRequired':True,
                'independentlyVerified':False,'deliveryReady':False,
                'isolation':'temporary profile and scrubbed environment; not an OS sandbox'}
        (export/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
        # Input and renderer must still match before evidence publication.
        require(sha(regular(source,10*1024*1024))==report['inputSha256'],'input changed')
        require(sha(regular(exe,20*1024*1024))==renderer_sha256,'renderer changed')
        shutil.copytree(export,output)
        return report


if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser(description='Lokale DOCX-Seitenprüfung; keine Lieferfreigabe.')
    parser.add_argument('--config',required=True,help='Lokale JSON-Konfiguration mit source, output, permission, soffice, rendererSha256, poppler und optional expectedPages.')
    args=parser.parse_args()
    try:
        config=json.loads(regular(args.config,65536))
        report=inspect_docx(config['source'],config['output'],config['permission'],config['soffice'],config['rendererSha256'],poppler=config['poppler'],expected_pages=config.get('expectedPages'))
        print(json.dumps({'pages':len(report['pages']),'issues':report['issues'],'deliveryReady':False}))
        sys.exit(0 if report['geometryPassed'] else 2)
    except (ValueError, OSError, KeyError, TypeError) as error:
        print('DOCX-Prüfung abgebrochen: '+str(error),file=sys.stderr)
        if error.__context__ is not None:
            print('Ursache: '+str(error.__context__),file=sys.stderr)
        sys.exit(1)
