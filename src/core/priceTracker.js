/**
 * Price Tracker - Fetches real-time stock prices from Finnhub API
 */

import { state } from './state.js';

const CACHE_KEY = 'riskCalcPriceCache';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

export const priceTracker = {
  apiKey: null,
  cache: new Map(),
  lastFetchDate: null,

  init() {
    // Load API key from settings
    this.apiKey = localStorage.getItem('finnhubApiKey') || '';

    // Load price cache from localStorage
    this.loadCache();
  },

  loadCache() {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const { prices, date } = JSON.parse(cached);
        this.lastFetchDate = new Date(date);

        // Check if cache is still valid (same day)
        if (this.isSameDay(this.lastFetchDate, new Date())) {
          this.cache = new Map(Object.entries(prices));
        }
      }
    } catch (e) {
      console.error('Failed to load price cache:', e);
    }
  },

  saveCache() {
    try {
      const prices = Object.fromEntries(this.cache);
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        prices,
        date: new Date().toISOString()
      }));
    } catch (e) {
      console.error('Failed to save price cache:', e);
    }
  },

  isSameDay(date1, date2) {
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate();
  },

  needsRefresh() {
    if (!this.lastFetchDate) return true;
    return !this.isSameDay(this.lastFetchDate, new Date());
  },

  async fetchPrice(ticker) {
    if (!this.apiKey) {
      throw new Error('Finnhub API key not configured');
    }

    try {
      const response = await fetch(
        `https://finnhub.io/api/v1/quote?symbol=${ticker.toUpperCase()}&token=${this.apiKey}`
      );

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      // Finnhub returns: c (current), h (high), l (low), o (open), pc (previous close)
      return {
        ticker: ticker.toUpperCase(),
        price: data.c,
        change: data.d,
        changePercent: data.dp,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error(`Failed to fetch price for ${ticker}:`, error);
      throw error;
    }
  },

  async fetchPrices(tickers) {
    if (!this.apiKey) {
      throw new Error('Finnhub API key not configured. Add it in Settings.');
    }

    const results = {
      success: [],
      failed: []
    };

    // Fetch prices sequentially to respect rate limits (60/min is generous)
    for (const ticker of tickers) {
      try {
        const priceData = await this.fetchPrice(ticker);
        this.cache.set(ticker.toUpperCase(), priceData);
        results.success.push(priceData);

        // Small delay to be respectful of API (not strictly necessary with 60/min limit)
        await this.sleep(100);
      } catch (error) {
        results.failed.push({ ticker, error: error.message });
      }
    }

    // Save cache after fetching all prices
    this.lastFetchDate = new Date();
    this.saveCache();

    return results;
  },

  async refreshAllActivePrices() {
    const trades = state.journal.entries;
    const activeTrades = trades.filter(t => t.status === 'open' || t.status === 'trimmed');
    const tickers = [...new Set(activeTrades.map(t => t.ticker).filter(Boolean))];

    if (tickers.length === 0) {
      return { success: [], failed: [] };
    }

    return await this.fetchPrices(tickers);
  },

  getPrice(ticker) {
    if (!ticker) return null;
    return this.cache.get(ticker.toUpperCase());
  },

  getCachedPrice(ticker) {
    return this.getPrice(ticker);
  },

  calculateUnrealizedPnL(trade) {
    const priceData = this.getPrice(trade.ticker);
    if (!priceData) return null;

    const currentPrice = priceData.price;
    const shares = trade.remainingShares || trade.shares;
    const entry = trade.entry;

    const unrealizedPnL = (currentPrice - entry) * shares;
    const unrealizedPercent = ((currentPrice - entry) / entry) * 100;

    return {
      currentPrice,
      unrealizedPnL,
      unrealizedPercent,
      shares,
      entry,
      priceData
    };
  },

  calculateTotalUnrealizedPnL() {
    const trades = state.journal.entries;
    const activeTrades = trades.filter(t => t.status === 'open' || t.status === 'trimmed');

    let totalPnL = 0;
    let tradeCount = 0;

    for (const trade of activeTrades) {
      const pnl = this.calculateUnrealizedPnL(trade);
      if (pnl) {
        totalPnL += pnl.unrealizedPnL;
        tradeCount++;
      }
    }

    return {
      totalPnL,
      tradeCount,
      percentOfAccount: (totalPnL / state.account.currentSize) * 100
    };
  },

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  setApiKey(key) {
    this.apiKey = key;
    localStorage.setItem('finnhubApiKey', key);
  },

  getLastFetchTime() {
    return this.lastFetchDate;
  }
};
