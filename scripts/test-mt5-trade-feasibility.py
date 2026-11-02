import importlib.util
import unittest
from pathlib import Path
from types import SimpleNamespace as NS
from unittest.mock import Mock
import time

spec = importlib.util.spec_from_file_location('feasibility', Path(__file__).with_name('mt5-trade-feasibility.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class FeasibilityTests(unittest.TestCase):
    def api(self, offset=0):
        a = NS(login=1, server='test', currency='EUR', equity=50, margin_free=50)
        s = NS(name='EURUSD', currency_base='EUR', currency_profit='USD', visible=True,
               volume_min=.01, volume_step=.01, trade_mode=4)
        return Mock(initialize=Mock(return_value=True), terminal_info=Mock(return_value=NS(connected=True)),
                    account_info=Mock(return_value=a), positions_get=Mock(return_value=()),
                    orders_get=Mock(return_value=()), symbols_get=Mock(return_value=[s]),
                    symbol_info_tick=Mock(return_value=NS(bid=1.1, ask=1.1002, time_msc=(time.time()+offset)*1000)),
                    order_calc_profit=Mock(return_value=-.2), order_calc_margin=Mock(return_value=33),
                    SYMBOL_TRADE_MODE_FULL=4, ORDER_TYPE_BUY=0, ORDER_TYPE_SELL=1)

    def test_read_only_estimates_never_become_signal(self):
        api = self.api()
        report = module.inspect(api, 'test', 1, 'test')
        self.assertEqual(report['instruments'][0]['spreadCostAtMinimumLots'], .2)
        self.assertEqual(report['decision'], 'NO_TRADE')
        api.order_send.assert_not_called()
        api.symbol_select.assert_not_called()
        api.shutdown.assert_called_once()

    def test_bad_timestamps_block_calculation(self):
        for offset, status in [(10800, 'future_timestamp'), (-30, 'stale_quote')]:
            api = self.api(offset)
            self.assertEqual(module.inspect(api, 'test', 1, 'test')['instruments'][0]['status'], status)
            api.order_calc_profit.assert_not_called()

    def test_identity_mismatch(self):
        api = self.api()
        with self.assertRaises(RuntimeError):
            module.inspect(api, 'test', 2, 'test')
        api.symbols_get.assert_not_called()
        api.shutdown.assert_called_once()

    def test_explicit_server_offset_keeps_stale_quote_blocked(self):
        api = self.api(10800)
        self.assertEqual(module.inspect(api, 'test', 1, 'test', 10800)['instruments'][0]['status'], 'observed')
        api = self.api(10700)
        self.assertEqual(module.inspect(api, 'test', 1, 'test', 10800)['instruments'][0]['status'], 'stale_quote')


if __name__ == '__main__':
    unittest.main()
