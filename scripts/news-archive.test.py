import unittest,importlib.util,io,zipfile
from pathlib import Path
spec=importlib.util.spec_from_file_location('archive',Path(__file__).with_name('news-archive.py'));a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a)
class Tests(unittest.TestCase):
 def zip(self,rows,name='sample.csv'):
  b=io.BytesIO()
  with zipfile.ZipFile(b,'w') as z:z.writestr(name,rows)
  return b.getvalue()
 def row(self,url='https://news.example/story'):
  fields=['']*27;fields[0]='20260831000000-T1';fields[1]='20260831000000';fields[2]='1';fields[3]='news.example';fields[4]=url;fields[7]='ECON_INFLATION;';return '\t'.join(fields)+'\n'
 def test_archive_time_is_not_claimed_as_verified_availability(self):
  r=a.parse(self.zip(self.row()),'20260831000000')
  self.assertEqual(r['records'],1);self.assertEqual(r['translatedRecords'],1);self.assertFalse(r['pointInTimeVerified']);self.assertFalse(r['profitabilityTestEligible'])
 def test_unsafe_links_and_wrong_batches_are_not_imported(self):
  self.assertEqual(a.parse(self.zip(self.row('javascript:alert(1)')),'20260831000000')['records'],0)
  self.assertEqual(a.parse(self.zip(self.row().replace('20260831','20260901')),'20260831000000')['records'],0)
 def test_zip_paths_are_never_extracted(self):
  with self.assertRaises(ValueError):a.parse(self.zip(self.row(),'../../outside.csv'),'20260831000000')
 def test_limit_and_timestamp_validation(self):
  with self.assertRaises(ValueError):a.archive_url('20260831000700')
  with self.assertRaises(ValueError):a.archive_url('../secret')
if __name__=='__main__':unittest.main()
