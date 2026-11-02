import unittest, tempfile, sys, hashlib
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from docx import Document
try:
    from ugig_docx_visual import inspect_docx, check_layout
except ImportError:
    inspect_docx = check_layout = None

class VisualTests(unittest.TestCase):
    def test_active_content_namespace_alias_blocked_before_renderer(self):
        import io, zipfile
        for prefix,part in [('w','document'),('alternate','document'),('alternate','header1')]:
            with self.subTest(prefix=prefix,part=part), tempfile.TemporaryDirectory() as d:
                p=Path(d)/'input.docx';doc=Document();doc.add_paragraph('Test')
                doc.sections[0].header.add_paragraph('')
                doc.save(p)
                original=p.read_bytes();out=io.BytesIO()
                with zipfile.ZipFile(io.BytesIO(original)) as source, zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as target:
                    for item in source.infolist():
                        content=source.read(item.filename)
                        if item.filename==f'word/{part}.xml':
                            field=f'<{prefix}:fldSimple xmlns:{prefix}="http://schemas.openxmlformats.org/wordprocessingml/2006/main" w:instr="DATE"/>'.encode()
                            content=content.replace(b'</w:p>',field+b'</w:p>',1)
                        target.writestr(item,content)
                p.write_bytes(out.getvalue())
                permission={'privacy':'public','customerApproved':True,'workKind':'document-cleanup','inputSha256':hashlib.sha256(p.read_bytes()).hexdigest()}
                with self.assertRaisesRegex(ValueError,'active or unsupported document content'):
                    inspect_docx(p,Path(d)/'out',permission,Path(d)/'missing-renderer','0'*64)
                self.assertFalse((Path(d)/'out').exists())

    def test_exact_hash_required_before_renderer(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'input.docx';doc=Document();doc.add_paragraph('Test');doc.save(p)
            with self.assertRaisesRegex(ValueError,'exact input'):
                inspect_docx(p,Path(d)/'out',{'privacy':'public','customerApproved':True,'workKind':'document-cleanup','inputSha256':'0'*64},Path(d)/'missing','0'*64)
            self.assertFalse((Path(d)/'out').exists())

    def test_external_link_blocked_before_renderer(self):
        from docx.opc.constants import RELATIONSHIP_TYPE
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'input.docx';doc=Document();doc.add_paragraph('Test')
            doc.part.relate_to('https://example.invalid',RELATIONSHIP_TYPE.HYPERLINK,is_external=True);doc.save(p)
            with self.assertRaisesRegex(ValueError,'external Office'):
                inspect_docx(p,Path(d)/'out',{'privacy':'public','customerApproved':True,'workKind':'document-cleanup','inputSha256':hashlib.sha256(p.read_bytes()).hexdigest()},Path(d)/'missing','0'*64)

    def test_renderer_timeout(self):
        from ugig_docx_visual import run
        import os
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaisesRegex(ValueError,'timeout'):
                run([sys.executable,'-c','import time;time.sleep(15)'],d,dict(os.environ),timeout=0.1)

    def test_feature_exists(self):
        self.assertTrue(callable(inspect_docx), 'isolated visual inspection missing')

    def test_private_or_unapproved_fails_before_renderer(self):
        if not inspect_docx: self.skipTest('feature missing')
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'input.docx';doc=Document();doc.add_paragraph('Test');doc.save(p)
            for privacy,approved in [('confidential',True),('public',False),('unknown',True)]:
                with self.assertRaises(ValueError):inspect_docx(p,Path(d)/'out',{'privacy':privacy,'customerApproved':approved},Path(d)/'missing', '0'*64)
                self.assertFalse((Path(d)/'out').exists())

    def test_layout_detects_orphan_and_wrong_break(self):
        if not check_layout:self.skipTest('feature missing')
        pages=[{'text':'Titel','outside':False},{'text':'Absatz','outside':False}]
        r=check_layout(pages,['Titel','Absatz'],[('Titel','Absatz')],{'Absatz':1})
        self.assertIn('heading-separated',r);self.assertIn('page-break-mismatch',r)

    def test_layout_detects_missing_and_overflow(self):
        if not check_layout:self.skipTest('feature missing')
        self.assertIn('text-mismatch',check_layout([{'text':'X','outside':True}],['Original'],[],{}))
        self.assertIn('text-outside-margins',check_layout([{'text':'X','outside':True}],['X'],[],{}))

if __name__=='__main__':unittest.main()
