"""Explicit local integration tests; synthetic data only, no service imports."""
import hashlib, json, os, tempfile, unittest
from pathlib import Path
from docx import Document
from docx.shared import Inches
from ugig_docx_visual import inspect_docx

@unittest.skipUnless(all(os.environ.get(k) for k in ['DOCX_VISUAL_TEST_OUTPUT','DOCX_VISUAL_SOFFICE','DOCX_VISUAL_POPPLER']), 'explicit isolated rendering runtime required')
class RenderTests(unittest.TestCase):
    def test_existing_generators(self):
        from test_ugig_office import fixture
        from ugig_office import build
        root=Path(os.environ['DOCX_VISUAL_TEST_OUTPUT']).absolute();root.mkdir(parents=True,exist_ok=True)
        exe=Path(os.environ['DOCX_VISUAL_SOFFICE'])
        for kind in ['document-cleanup','support-templates']:
            folder=root/('generated-'+kind);folder.mkdir()
            spec,reference=fixture(kind)
            result=build(spec,reference,folder)
            self.assertTrue(result['technicalPassed'])
            source=folder/'delivery.docx'
            permission=dict(spec,inputSha256=hashlib.sha256(source.read_bytes()).hexdigest())
            r=inspect_docx(source,folder/'visual',permission,exe,hashlib.sha256(exe.read_bytes()).hexdigest(),poppler=os.environ['DOCX_VISUAL_POPPLER'])
            self.assertEqual([],r['issues']);self.assertEqual(1,len(r['pages']))
            self.assertFalse(r['deliveryReady'])

    def test_real_pages_and_defects(self):
        root=Path(os.environ['DOCX_VISUAL_TEST_OUTPUT']).absolute()
        root.mkdir(parents=True,exist_ok=True)
        exe=Path(os.environ['DOCX_VISUAL_SOFFICE'])
        results={}
        for kind in ['document-cleanup','support-templates','orphan','overflow']:
            doc=Document()
            for n in range(1,4):
                h=doc.add_heading(f'Abschnitt {n} – {kind}',1)
                if n>1:h.paragraph_format.page_break_before=True
                for j in range(3):
                    p=doc.add_paragraph(f'Testabsatz {n}.{j}: '+('Dies sind ausschließlich erfundene Testdaten für die lokale Prüfung von Layout, Umlauten und Zeilenumbrüchen. '*8))
                    if kind=='orphan' and n==1 and j==0:
                        h.paragraph_format.keep_with_next=False
                        p.paragraph_format.page_break_before=True
                    if kind=='overflow' and n==1 and j==0:
                        p.paragraph_format.left_indent=Inches(-1)
            source=root/(kind+'.docx');doc.save(source)
            permission={'privacy':'public','customerApproved':True,'workKind':kind if kind in ['document-cleanup','support-templates'] else 'document-cleanup','inputSha256':hashlib.sha256(source.read_bytes()).hexdigest()}
            r=inspect_docx(source,root/kind,permission,exe,hashlib.sha256(exe.read_bytes()).hexdigest(),poppler=os.environ['DOCX_VISUAL_POPPLER'],expected_pages={f'Abschnitt {n}':n for n in range(1,4)})
            results[kind]={'pages':len(r['pages']),'issues':r['issues']}
            self.assertFalse(r['deliveryReady']);self.assertFalse(r['independentlyVerified'])
            if kind=='orphan':self.assertIn('heading-separated',r['issues'])
            elif kind=='overflow':self.assertIn('text-outside-margins',r['issues'])
            else:self.assertEqual([],r['issues']);self.assertEqual(3,len(r['pages']))
        (root/'results.json').write_text(json.dumps(results,indent=2),encoding='utf-8')

if __name__=='__main__':unittest.main()
