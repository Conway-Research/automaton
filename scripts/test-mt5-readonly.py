import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest

spec = importlib.util.spec_from_file_location('reader', Path(__file__).with_name('mt5-readonly.py'))
reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader)


class Fake:
    def __init__(self, login=123, positions=()):
        self.login = login
        self.positions = positions
        self.closed = False

    def initialize(self, *args, **kwargs): return True
    def terminal_info(self): return SimpleNamespace(connected=True)
    def account_info(self):
        return SimpleNamespace(login=self.login, server='test', currency='EUR',
            balance=50, equity=49, profit=-1, margin=20, margin_free=29,
            leverage=30, trade_mode=0)
    def positions_get(self): return self.positions
    def orders_get(self): return ()
    def shutdown(self): self.closed = True


class Tests(unittest.TestCase):
    def test_wrong_account(self):
        client = Fake(login=999)
        with self.assertRaisesRegex(RuntimeError, 'Unexpected account'):
            reader.snapshot(client, 'terminal', 123)
        self.assertTrue(client.closed)

    def test_missing_positions_are_not_empty(self):
        client = Fake(positions=None)
        with self.assertRaisesRegex(RuntimeError, 'Incomplete'):
            reader.snapshot(client, 'terminal', 123)
        self.assertTrue(client.closed)

    def test_success_without_trade_api(self):
        client = Fake()
        result = reader.snapshot(client, 'terminal', 123)
        self.assertEqual(result['account']['equity'], 49)
        self.assertFalse(result['executionEnabled'])
        self.assertTrue(client.closed)


if __name__ == '__main__': unittest.main()
