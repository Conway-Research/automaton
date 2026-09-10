import * as ccxt from "ccxt";

export class ExchangeAdapter {
  private exchange: ccxt.Exchange;

  constructor() {
    const exchangeId = "binance"; // Or read from process.env.EXCHANGE_ID
    const exchangeClass = ccxt[exchangeId] as typeof ccxt.Exchange;

    if (!exchangeClass) {
      throw new Error(`Exchange ${exchangeId} is not supported by ccxt.`);
    }

    this.exchange = new exchangeClass({
      apiKey: process.env.EXCHANGE_API_KEY,
      secret: process.env.EXCHANGE_API_SECRET,
      enableRateLimit: true,
      httpProxy: process.env.HTTPS_PROXY || process.env.HTTP_PROXY || undefined,
      httpsProxy: process.env.HTTPS_PROXY || process.env.HTTP_PROXY || undefined,
    });
  }

  async getBalance() {
    return this.exchange.fetchBalance();
  }

  async getPnl(): Promise<number> {
    // Stub implementation. To calculate real PnL, we need historical deposits/withdrawals 
    // or calculate based on open positions and average entry price vs current market price.
    // For this demonstration, we'll return a stub value or calculate a simple one.
    // Since the prompt states: $50 allocated, max loss $5.
    
    // We assume the initial balance is $50.
    try {
      if (!process.env.EXCHANGE_API_KEY || process.env.EXCHANGE_API_KEY.includes('your_')) {
        return 0; // Bypass if dummy keys are used
      }

      
      
      const balance = (await this.getBalance()) as any;
      const totalUsdt = balance.total['USDT'] || 0;
      const totalUsd = balance.total['USD'] || 0; // Added USD
      const totalBtc = balance.total['BTC'] || 0;
      const totalEth = balance.total['ETH'] || 0;
      const totalMxn = balance.total['MXN'] || 0;
      
      let equityUsdt = totalUsdt + totalUsd; // USD is 1:1 with USDT for rough calc
      
      // Fetch prices for rough equity calc if we hold positions
      if (totalBtc > 0 || totalEth > 0 || totalMxn > 0) {

        const tickers = await this.exchange.fetchTickers(['BTC/USDT', 'ETH/USDT', 'USDT/MXN', 'BTC/MXN']);
        if (totalBtc > 0) equityUsdt += totalBtc * (tickers['BTC/USDT']?.last || 0);
        if (totalEth > 0) equityUsdt += totalEth * (tickers['ETH/USDT']?.last || 0);
        if (totalMxn > 0) {
            // Convert MXN to USDT. If USDT/MXN ticker is missing, try a rough 1 USDT = 20 MXN fallback, 
            // but ideally we just divide by USD/MXN rate. Let's fetch BTC/USDT and BTC/MXN to cross-calculate.
            const btcUsdt = tickers['BTC/USDT']?.last || 78000;
            const btcMxn = tickers['BTC/MXN']?.last || 1324578;
            const mxnToUsdtRate = btcUsdt / btcMxn;
            equityUsdt += totalMxn * mxnToUsdtRate;
        }
      }

      
      // If account has literally 0 equity, assume unfunded rather than total loss
      if (equityUsdt === 0) {
        return 0;
      }
      
      // Calculate PnL based on $50 allocated capital
      const initial = Number(process.env.INITIAL_ALLOCATION_USD) || 50; return equityUsdt - initial;
    } catch (e) {
      console.warn("Could not fetch balance for PnL calculation, returning 0", e instanceof Error ? e.message : String(e));
      return 0;
    }
  }

  async liquidateAll() {
    console.log("Liquidating all open positions at market price...");
    
    try {
      const balance = (await this.getBalance()) as any;
      const symbolsToSell = ['BTC', 'ETH']; // We only trade BTC/USDT and ETH/USDT
      
      
      for (const baseCurrency of symbolsToSell) {
        const amount = balance.total[baseCurrency];
        
        if (amount && amount > 0.00001) { // Check precision minimums
          try {
            await this.exchange.createMarketSellOrder(`${baseCurrency}/USDT`, amount);
            console.log(`Successfully liquidated ${amount} ${baseCurrency}`);
          } catch (error) {
            console.error(`Failed to liquidate ${baseCurrency}:`, (error as Error).message);
          }
        }
      }

    } catch (e) {
      console.error("Failed to liquidate:", e);
    }
  }

  async getMarketPrice(symbol: string): Promise<number> {
    try {
      const ticker = await this.exchange.fetchTicker(symbol);
      return ticker.last || 0;
    } catch (e) {
      console.error(`Failed to fetch price for ${symbol}:`, e);
      throw e;
    }
  }

  async placeOrder(symbol: string, side: 'buy' | 'sell', type: 'market' | 'limit', amount: number, price?: number) {
    try {
      if (process.env.EXCHANGE_API_KEY?.includes('your_') || !process.env.EXCHANGE_API_KEY) {
        console.warn(`[SIMULATION] Would have placed ${side} ${type} order for ${amount} ${symbol} at ${price || 'market'}`);
        return { status: 'simulated', id: `sim-${Date.now()}` };
      }
      if (type === 'market') {
        return await this.exchange.createMarketOrder(symbol, side, amount);
      } else {
        return await this.exchange.createLimitOrder(symbol, side, amount, price!);
      }
    } catch (e) {
      console.error(`Failed to place ${side} order for ${symbol}:`, e);
      throw e;
    }
  }
}
