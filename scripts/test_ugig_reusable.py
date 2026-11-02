import unittest, tempfile, sys, io, base64, json, subprocess
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).parent))
import ugig_office as office
from test_ugig_office import fixture
from openpyxl import Workbook

class ReusableTests(unittest.TestCase):
    def test_new_rows_schema_and_permission(self):
        s,r=fixture('xlsx-automation')
        w=Workbook();w.active.append(['name','amount']);w.active.append([' B ',14]);b=io.BytesIO();w.save(b)
        s['workbooks'][0]['data']=base64.b64encode(b.getvalue()).decode()
        with self.assertRaises(ValueError): office.planned(s,r)
        consent={'privacy':'public','customerApproved':True,'inputs':office.transform(s['workbooks'],s['rules'])[2]}
        current=office.reusable_reference(s,r,consent)
        self.assertEqual(current['rows'],[['B',14]])
        for invalid in [{},{'privacy':'confidential','customerApproved':True},{'privacy':'public','customerApproved':False},{'privacy':'public','customerApproved':True,'inputs':[]}]:
            with self.assertRaises(ValueError):office.reusable_reference(s,r,invalid)
        r['headers']=['wrong','amount']
        with self.assertRaises(ValueError):office.reusable_reference(s,r,consent)

    def test_delivered_process_cli_and_unchanged_original(self):
        s,r=fixture('xlsx-automation')
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);office.build(s,r,root)
            inputs=root/'inputs';inputs.mkdir();out=root/'result';out.mkdir()
            w=Workbook();w.active.append(['name','amount']);w.active.append([' NEW ',42]);b=io.BytesIO();w.save(b)
            original=b.getvalue();(inputs/'input.xlsx').write_bytes(original)
            consent={'privacy':'public','customerApproved':True,'inputs':[{'name':'input.xlsx','sha256':office.sha(original)}]}
            (root/'consent.json').write_text(json.dumps(consent))
            cmd=[sys.executable,'-I',str(root/'automation.py'),'--process',str(root/'recipe.json'),str(root/'reference.json'),str(inputs),str(out),str(root/'consent.json')]
            run=subprocess.run(cmd,capture_output=True,timeout=30)
            self.assertEqual(run.returncode,0,run.stderr.decode())
            self.assertIn('NEW,42',(out/'delivery.csv').read_text())
            self.assertEqual((inputs/'input.xlsx').read_bytes(),original)
            self.assertFalse(json.loads((out/'technical-report.json').read_text())['independentlyVerified'])
            self.assertEqual(json.loads((out/'technical-report.json').read_text())['validationMode'],'schema-and-rules')
            run=subprocess.run(cmd,capture_output=True,timeout=30)
            self.assertNotEqual(run.returncode,0)

    def test_preflight_boundary_and_escaping(self):
        overhead=office.mixed_text_bytes({'sample.md':'x'})-1
        self.assertEqual(office.mixed_text_bytes({'sample.md':'x'*(96000-overhead)}),96000)
        self.assertEqual(office.mixed_text_bytes({'sample.md':'x'*(96001-overhead)}),96001)
        self.assertGreater(office.mixed_text_bytes({'sample.md':'😀\n"'}),overhead+3)

    def test_preflight_covers_actual_manifest_for_all_profiles(self):
        for kind in office.KINDS:
            s,r=fixture(kind)
            with tempfile.TemporaryDirectory() as d:
                office.build(s,r,d)
                files={p.name:p.read_text(encoding='utf-8') for p in Path(d).iterdir() if p.suffix not in ('.docx','.xlsx')}
                self.assertLessEqual(office.mixed_text_bytes(files),96000)

    def test_reusable_rejects_type_change_and_private_reference(self):
        s,r=fixture('xlsx-automation')
        consent={'privacy':'public','customerApproved':True,'inputs':office.transform(s['workbooks'],s['rules'])[2]}
        r['rows'][0][1]='12'
        with self.assertRaisesRegex(ValueError,'cell type'):office.reusable_reference(s,r,consent)
        r['privacy']='confidential'
        with self.assertRaises(ValueError):office.reusable_reference(s,r,consent)

    def test_cli_rejects_excess_or_duplicate_inputs_before_reading_files(self):
        for names in [['missing.xlsx']*4, ['same.xlsx','same.xlsx'], ['same.xlsx','SAME.xlsx'], 'input.xlsx', []]:
            with tempfile.TemporaryDirectory() as d:
                root=Path(d);recipe=root/'recipe.json';recipe.write_text(json.dumps({'inputNames':names}))
                run=subprocess.run([sys.executable,'-I',str(Path(office.__file__)),'--transform',str(recipe),str(root/'reference.json'),str(root/'missing'),str(root/'result')],capture_output=True,timeout=30)
                self.assertNotEqual(run.returncode,0)
                self.assertIn('input names',run.stderr.decode())

    def test_runtime(self):
        self.assertTrue(office.runtime_check()['ok'])
        with patch.object(office,'installed_version',return_value='0.0'):
            with self.assertRaises(ValueError):office.runtime_check()

    def test_large_text_rejected_before_binary_creation(self):
        s,r=fixture('document-cleanup');s['sourceBlocks'][0]['text']='Ä'*19000;s['sourceBlocks'][1]['text']='😀'*19000
        r['paragraphs']=['Übersicht',s['sourceBlocks'][1]['text'],s['sourceBlocks'][0]['text']]
        with tempfile.TemporaryDirectory() as d,patch.object(office,'Document',side_effect=AssertionError('binary started')):
            with self.assertRaisesRegex(ValueError,'text package'):office.build(s,r,d)
            self.assertEqual(list(Path(d).iterdir()),[])

if __name__=='__main__':unittest.main()
