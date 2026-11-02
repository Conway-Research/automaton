import datetime,sys,pathlib,unittest
sys.path.insert(0,str(pathlib.Path(__file__).parent/'lib'))
from r2_calendar import nyse_sessions
class Calendar(unittest.TestCase):
    def test_known_closures(self):
        s=nyse_sessions(datetime.date(2025,1,1),datetime.date(2026,1,1))
        for d in ['2025-01-01','2025-01-09','2025-04-18','2025-06-19','2025-12-25']:self.assertNotIn(d,s)
        self.assertIn('2025-01-08',s)
    def test_new_year_saturday_and_early_juneteenth(self):
        s=nyse_sessions(datetime.date(2021,1,1),datetime.date(2022,1,2))
        self.assertIn('2021-12-31',s);self.assertIn('2021-06-18',s)
    def test_special_halts(self):
        s=nyse_sessions(datetime.date(2001,9,10),datetime.date(2001,9,18))
        self.assertEqual(s,['2001-09-10','2001-09-17'])
if __name__=='__main__':unittest.main()
