import unittest,tempfile
from pathlib import Path
from test_ugig_office import fixture
from ugig_office import build
class ProfileReadmeTests(unittest.TestCase):
 def test_readmes_describe_only_delivered_profile(self):
  for kind in ('document-cleanup','support-templates','research-report','xlsx-automation'):
   with self.subTest(kind=kind), tempfile.TemporaryDirectory() as d:
    s,r=fixture(kind);build(s,r,d);text=(Path(d)/'README.md').read_text(encoding='utf8')
    self.assertIn(kind,text)
    for name in ('automation.py','run.bat','recipe.json','reference.json'):
     self.assertEqual(name in text,(Path(d)/name).exists(),name)
    self.assertIn('Kundenfreigabe',text)
    self.assertIn('Vertrauliche',text)
    self.assertIn('technical-report.json',text)
 def test_documented_xlsx_commands_execute_in_isolation(self):
  import subprocess,sys,base64,json,hashlib,os
  s,r=fixture('xlsx-automation')
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);build(s,r,root)
   def command(*args):
    p=subprocess.run([sys.executable,'-I','automation.py',*args],cwd=root,capture_output=True,timeout=30)
    self.assertEqual(p.returncode,0,p.stderr.decode('utf8',errors='replace'))
   command('--check-runtime')
   (root/'inputs').mkdir();(root/'result').mkdir()
   inputs=[]
   for w in s['workbooks']:
    data=base64.b64decode(w['data']);(root/'inputs'/w['name']).write_bytes(data);inputs.append({'name':w['name'],'sha256':hashlib.sha256(data).hexdigest()})
   command('--transform','recipe.json','reference.json','inputs','result')
   (root/'result-new').mkdir();(root/'consent.json').write_text(json.dumps({'privacy':'public','customerApproved':True,'inputs':inputs}))
   command('--process','recipe.json','reference.json','inputs','result-new','consent.json')
