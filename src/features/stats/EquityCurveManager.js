/**
 * EquityCurveManager - Manages equity curve calculation and caching
 * Single source of truth for end-of-day account balances
 */

import { state } from '../../core/state.js';
import { historicalPricesBatcher } from './HistoricalPricesBatcher.js';
import { priceTracker } from '../../core/priceTracker.js';
import { getCurrentWeekday, getPreviousBusinessDay } from '../../core/utils.js';

class EquityCurveManager {
  constructor() {
    this.cache = null;
    this.CACHE_KEY = 'equityCurveCache';
    this.CACHE_VERSION = 1;
    this.loadCache();
  }

  /**
   * Calculate hash of trades and cash flow to detect changes
   */
  _calculateDataHash() {
    const trades = state.journal.entries.map(e => ({
      id: e.id,
      timestamp: e.timestamp,
      closeDate: e.closeDate,
      status: e.status,
      pnl: e.totalRealizedPnL ?? e.pnl,
      ticker: e.ticker,
      entry: e.entry,
      shares: e.shares,
      trimHistory: e.trimHistory
    }));

    const cashFlow = (state.cashFlow?.transactions || []).map(t => ({
      id: t.id,
      type: t.type,
      amount: t.amount,
      timestamp: t.timestamp
    }));

    const startingBalance = state.settings.startingAccountSize;

    // Simple hash: stringify and use length + checksum
    const str = JSON.stringify({ trades, cashFlow, startingBalance });
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
  }

  /**
   * Load cache from localStorage
   */
  loadCache() {
    try {
      const saved = localStorage.getItem(this.CACHE_KEY);
      if (saved) {
        this.cache = JSON.parse(saved);

        // Invalidate if version mismatch
        if (this.cache.version !== this.CACHE_VERSION) {
          this.cache = null;
        }
      }
    } catch (error) {
      console.error('Failed to load equity curve cache:', error);
      this.cache = null;
    }
  }

  /**
   * Save cache to localStorage
   */
  saveCache() {
    try {
      localStorage.setItem(this.CACHE_KEY, JSON.stringify(this.cache));
    } catch (error) {
      console.error('Failed to save equity curve cache:', error);
    }
  }

  /**
   * Invalidate cache (called when trades or cash flow change)
   */
  invalidateCache() {
    this.cache = null;
    try {
      localStorage.removeItem(this.CACHE_KEY);
    } catch (error) {
      console.error('Failed to remove equity curve cache:', error);
    }
  }

  /**
   * Check if cache is valid for current data
   */
  _isCacheValid() {
    if (!this.cache) return false;

    const currentHash = this._calculateDataHash();
    return this.cache.dataHash === currentHash;
  }

  /**
   * Get EOD balance for a specific date
   * Returns null if date is not in cache
   * @param {string|Date} date - Date as YYYY-MM-DD string or Date object
   */
  getEODBalance(date) {
    if (!this.cache || !this.cache.curve) return null;

    // If already a string, use it directly; otherwise format it
    const dateStr = typeof date === 'string' ? date : this._formatDate(date);
    return this.cache.curve[dateStr]?.balance || null;
  }

  /**
   * Get EOD realized balance (without unrealized P&L) for a specific date
   * @param {string|Date} date - Date as YYYY-MM-DD string or Date object
   */
  getEODRealizedBalance(date) {
    if (!this.cache || !this.cache.curve) return null;

    // If already a string, use it directly; otherwise format it
    const dateStr = typeof date === 'string' ? date : this._formatDate(date);
    return this.cache.curve[dateStr]?.realizedBalance || null;
  }

  /**
   * Format date to YYYY-MM-DD string
   */
  _formatDate(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Parse YYYY-MM-DD string to Date object (avoids UTC issues)
   */
  _parseDate(dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  /**
   * Calculate unrealized P&L for open positions on a specific date
   */
  async _calculateUnrealizedPnLAtDate(dateStr, allEntries) {
    const targetDate = this._parseDate(dateStr);
    targetDate.setHours(23, 59, 59, 999); // End of day

    // Check if this is today (or current weekday if today is weekend)
    const currentWeekday = getCurrentWeekday();
    currentWeekday.setHours(0, 0, 0, 0);
    const targetDateOnly = new Date(targetDate);
    targetDateOnly.setHours(0, 0, 0, 0);
    const isToday = targetDateOnly.getTime() === currentWeekday.getTime();

    // For today, use simple filtering (same as calculateCurrentAccount)
    if (isToday) {
      const allOpenTrades = allEntries.filter(e => e.status === 'open' || e.status === 'trimmed');
      const result = priceTracker.calculateTotalUnrealizedPnL(allOpenTrades);
      return result?.totalPnL || 0;
    }

    // For historical dates, use complex date-based filtering
    const openOnDate = allEntries.filter(trade => {
      const entryDate = new Date(trade.timestamp);
      entryDate.setHours(0, 0, 0, 0);

      // Trade must have been entered before or on this date
      if (entryDate > targetDateOnly) return false;

      // If trade is closed/trimmed, check if it closed after this date
      if (trade.status === 'closed' || trade.status === 'trimmed') {
        if (!trade.closeDate) return false;
        const closeDate = new Date(trade.closeDate);
        closeDate.setHours(0, 0, 0, 0);

        // For closed trades, must have closed after this date
        if (trade.status === 'closed' && closeDate <= targetDateOnly) return false;

        // For trimmed trades, include if they have remaining shares on this date
        if (trade.status === 'trimmed') {
          let sharesOnDate = trade.shares;
          if (trade.trimHistory && Array.isArray(trade.trimHistory)) {
            trade.trimHistory.forEach(trim => {
              const trimDate = new Date(trim.date);
              trimDate.setHours(0, 0, 0, 0);
              if (trimDate <= targetDateOnly) {
                sharesOnDate -= trim.shares;
              }
            });
          }
          if (sharesOnDate <= 0) return false;
        }
      }

      return true;
    });

    // If no open positions, return 0
    if (openOnDate.length === 0) return 0;

    // For historical dates, use historical prices
    let totalUnrealizedPnL = 0;
    const hasApiKey = historicalPricesBatcher.apiKey !== null;

    if (!hasApiKey) {
      // Fallback: use current prices (not ideal but better than nothing)
      const result = priceTracker.calculateTotalUnrealizedPnL(openOnDate);
      return result?.totalPnL || 0;
    }

    for (const trade of openOnDate) {
      // Calculate shares held on this date (accounting for trimming)
      let sharesOnDate = trade.shares;
      if (trade.trimHistory && Array.isArray(trade.trimHistory)) {
        trade.trimHistory.forEach(trim => {
          const trimDate = new Date(trim.date);
          trimDate.setHours(0, 0, 0, 0);
          if (trimDate <= targetDateOnly) {
            sharesOnDate -= trim.shares;
          }
        });
      }

      // Get historical price
      const price = historicalPricesBatcher.getPriceOnDate(trade.ticker, dateStr);

      if (price && trade.entry) {
        totalUnrealizedPnL += (price - trade.entry) * sharesOnDate;
      }
    }

    return totalUnrealizedPnL;
  }

  /**
   * Build equity curve from earliest trade to today
   * Uses cache if valid, otherwise recalculates
   */
  async buildEquityCurve(filterStartDate = null, filterEndDate = null) {
    // Check if cache is valid
    if (this._isCacheValid() && this.cache && this.cache.curve) {
      // If we have a valid cache, check if we need to append new days
      const cacheEndDate = new Date(this.cache.lastCalculatedDate);
      const today = getCurrentWeekday();
      today.setHours(0, 0, 0, 0);

      if (cacheEndDate < today) {
        // Append new days from cache end to today
        await this._appendNewDays();
      } else if (cacheEndDate.getTime() === today.getTime()) {
        // Today is already in cache, but prices may have changed
        // Recalculate today's unrealized P&L with current prices
        await this._recalculateTodayUnrealizedPnL();
      }

      // Return filtered curve data
      return this._getFilteredCurve(filterStartDate, filterEndDate);
    }

    // Cache invalid or doesn't exist - rebuild from scratch
    await this._rebuildFullCurve();

    // Return filtered curve data
    return this._getFilteredCurve(filterStartDate, filterEndDate);
  }

  /**
   * Recalculate today's unrealized P&L with current prices
   * Only updates today's data point in the cache
   */
  async _recalculateTodayUnrealizedPnL() {
    if (!this.cache || !this.cache.curve) return;

    const today = getCurrentWeekday();
    today.setHours(0, 0, 0, 0);
    const todayStr = this._formatDate(today);

    // Check if today exists in cache
    if (!this.cache.curve[todayStr]) return;

    const allEntries = state.journal.entries;
    const existingData = this.cache.curve[todayStr];

    // Recalculate unrealized P&L for today with current prices
    const unrealizedPnL = await this._calculateUnrealizedPnLAtDate(todayStr, allEntries);

    // Get the existing realized balance (doesn't change with prices)
    const realizedBalance = existingData.realizedBalance;

    // Update today's data with new unrealized P&L
    this.cache.curve[todayStr] = {
      balance: realizedBalance + unrealizedPnL,
      realizedBalance: realizedBalance,
      unrealizedPnL: unrealizedPnL,
      dayPnL: existingData.dayPnL,
      cashFlow: existingData.cashFlow
    };

    // Save updated cache
    this.saveCache();
  }

  /**
   * Rebuild the entire equity curve from scratch
   */
  async _rebuildFullCurve() {
    const allEntries = state.journal.entries;
    const startingBalance = state.settings.startingAccountSize;
    const cashFlowTransactions = (state.cashFlow && state.cashFlow.transactions) || [];

    // Get closed trades sorted by close date
    const closedTrades = allEntries
      .filter(e => e.status === 'closed' || e.status === 'trimmed')
      .map(t => ({
        date: t.closeDate || t.timestamp,
        pnl: t.totalRealizedPnL ?? t.pnl ?? 0,
        ticker: t.ticker,
        entry: t
      }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    // Get all entry dates to determine the start date
    const allEntryDates = allEntries
      .filter(e => e.timestamp)
      .map(e => new Date(e.timestamp));

    if (closedTrades.length === 0 && allEntryDates.length === 0) {
      // No data yet
      this.cache = {
        version: this.CACHE_VERSION,
        dataHash: this._calculateDataHash(),
        lastCalculatedDate: this._formatDate(new Date()),
        lastUpdated: Date.now(),
        curve: {}
      };
      this.saveCache();
      return;
    }

    // Determine start date: earliest trade entry
    const firstDate = allEntryDates.length > 0
      ? new Date(Math.min(...allEntryDates.map(d => d.getTime())))
      : new Date(closedTrades[0].date);
    firstDate.setHours(0, 0, 0, 0);

    // End date: today (or current weekday)
    const endDate = getCurrentWeekday();
    endDate.setHours(0, 0, 0, 0);

    // Fetch all historical prices first (BATCHED!)
    const hasApiKey = historicalPricesBatcher.apiKey !== null;
    if (hasApiKey) {
      const allTickers = [...new Set(allEntries.map(e => e.ticker).filter(t => t))];
      if (allTickers.length > 0) {
        await historicalPricesBatcher.batchFetchPrices(allTickers);
      }
    }

    // Group closed trades by day
    const tradesByDay = new Map();
    closedTrades.forEach(trade => {
      const dateStr = this._formatDate(trade.date);
      if (!tradesByDay.has(dateStr)) {
        tradesByDay.set(dateStr, []);
      }
      tradesByDay.get(dateStr).push(trade);
    });

    // Group cash flow by day
    const cashFlowByDay = new Map();
    cashFlowTransactions.forEach(transaction => {
      const dateStr = this._formatDate(transaction.timestamp);
      if (!cashFlowByDay.has(dateStr)) {
        cashFlowByDay.set(dateStr, 0);
      }
      const amount = transaction.type === 'deposit' ? transaction.amount : -transaction.amount;
      cashFlowByDay.set(dateStr, cashFlowByDay.get(dateStr) + amount);
    });

    // Build equity curve day by day
    const curve = {};
    const currentDate = new Date(firstDate);
    let cumulativeRealizedPnL = 0;
    let cumulativeCashFlow = 0;

    while (currentDate.getTime() <= endDate.getTime()) {
      const dateStr = this._formatDate(currentDate);
      const dayOfWeek = currentDate.getDay();

      // Skip weekends
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        currentDate.setDate(currentDate.getDate() + 1);
        currentDate.setHours(0, 0, 0, 0);
        continue;
      }

      // Add realized P&L from trades closed on this day
      let dayPnL = 0;
      if (tradesByDay.has(dateStr)) {
        const dayTrades = tradesByDay.get(dateStr);
        dayPnL = dayTrades.reduce((sum, t) => sum + t.pnl, 0);
        cumulativeRealizedPnL += dayPnL;
      }

      // Add cash flow from this day
      if (cashFlowByDay.has(dateStr)) {
        cumulativeCashFlow += cashFlowByDay.get(dateStr);
      }

      // Calculate realized balance (without unrealized P&L)
      const realizedBalance = startingBalance + cumulativeRealizedPnL + cumulativeCashFlow;

      // Calculate unrealized P&L for this date
      const unrealizedPnL = await this._calculateUnrealizedPnLAtDate(dateStr, allEntries);

      // Store in curve
      curve[dateStr] = {
        balance: realizedBalance + unrealizedPnL,
        realizedBalance: realizedBalance,
        unrealizedPnL: unrealizedPnL,
        dayPnL: dayPnL,
        cashFlow: cashFlowByDay.get(dateStr) || 0
      };

      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
      currentDate.setHours(0, 0, 0, 0);
    }

    // Save cache
    this.cache = {
      version: this.CACHE_VERSION,
      dataHash: this._calculateDataHash(),
      lastCalculatedDate: this._formatDate(endDate),
      lastUpdated: Date.now(),
      curve: curve
    };
    this.saveCache();
  }

  /**
   * Append new days to existing cache (from last calculated date to today)
   */
  async _appendNewDays() {
    if (!this.cache || !this.cache.curve) {
      // No cache to append to - rebuild from scratch
      await this._rebuildFullCurve();
      return;
    }

    const allEntries = state.journal.entries;
    const startingBalance = state.settings.startingAccountSize;
    const cashFlowTransactions = (state.cashFlow && state.cashFlow.transactions) || [];

    // Start from day after last calculated date
    const startDate = new Date(this.cache.lastCalculatedDate);
    startDate.setDate(startDate.getDate() + 1);
    startDate.setHours(0, 0, 0, 0);

    // End at today
    const endDate = getCurrentWeekday();
    endDate.setHours(0, 0, 0, 0);

    // If no new days, nothing to append
    if (startDate > endDate) {
      return;
    }

    // Get closed trades
    const closedTrades = allEntries
      .filter(e => e.status === 'closed' || e.status === 'trimmed')
      .map(t => ({
        date: t.closeDate || t.timestamp,
        pnl: t.totalRealizedPnL ?? t.pnl ?? 0,
        ticker: t.ticker,
        entry: t
      }));

    // Group by day
    const tradesByDay = new Map();
    closedTrades.forEach(trade => {
      const dateStr = this._formatDate(trade.date);
      if (!tradesByDay.has(dateStr)) {
        tradesByDay.set(dateStr, []);
      }
      tradesByDay.get(dateStr).push(trade);
    });

    const cashFlowByDay = new Map();
    cashFlowTransactions.forEach(transaction => {
      const dateStr = this._formatDate(transaction.timestamp);
      if (!cashFlowByDay.has(dateStr)) {
        cashFlowByDay.set(dateStr, 0);
      }
      const amount = transaction.type === 'deposit' ? transaction.amount : -transaction.amount;
      cashFlowByDay.set(dateStr, cashFlowByDay.get(dateStr) + amount);
    });

    // Fetch historical prices for new days if needed (BATCHED!)
    const hasApiKey = historicalPricesBatcher.apiKey !== null;
    if (hasApiKey) {
      const allTickers = [...new Set(allEntries.map(e => e.ticker).filter(t => t))];
      if (allTickers.length > 0) {
        await historicalPricesBatcher.batchFetchPrices(allTickers);
      }
    }

    // Get last calculated values to continue from
    const lastDateStr = this.cache.lastCalculatedDate;
    const lastData = this.cache.curve[lastDateStr];

    // Calculate cumulative values from all time
    const allClosedTradesUpToLastDate = closedTrades.filter(t => {
      const tradeDate = new Date(t.date);
      tradeDate.setHours(0, 0, 0, 0);
      const lastDate = new Date(lastDateStr);
      lastDate.setHours(0, 0, 0, 0);
      return tradeDate <= lastDate;
    });
    let cumulativeRealizedPnL = allClosedTradesUpToLastDate.reduce((sum, t) => sum + t.pnl, 0);

    const allCashFlowUpToLastDate = cashFlowTransactions.filter(t => {
      const txDate = new Date(t.timestamp);
      txDate.setHours(0, 0, 0, 0);
      const lastDate = new Date(lastDateStr);
      lastDate.setHours(0, 0, 0, 0);
      return txDate <= lastDate;
    });
    let cumulativeCashFlow = allCashFlowUpToLastDate.reduce((sum, tx) => {
      const amount = tx.type === 'deposit' ? tx.amount : -tx.amount;
      return sum + amount;
    }, 0);

    // Append new days
    const currentDate = new Date(startDate);
    while (currentDate.getTime() <= endDate.getTime()) {
      const dateStr = this._formatDate(currentDate);
      const dayOfWeek = currentDate.getDay();

      // Skip weekends
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        currentDate.setDate(currentDate.getDate() + 1);
        currentDate.setHours(0, 0, 0, 0);
        continue;
      }

      // Add realized P&L from trades closed on this day
      let dayPnL = 0;
      if (tradesByDay.has(dateStr)) {
        const dayTrades = tradesByDay.get(dateStr);
        dayPnL = dayTrades.reduce((sum, t) => sum + t.pnl, 0);
        cumulativeRealizedPnL += dayPnL;
      }

      // Add cash flow from this day
      if (cashFlowByDay.has(dateStr)) {
        cumulativeCashFlow += cashFlowByDay.get(dateStr);
      }

      // Calculate realized balance
      const realizedBalance = startingBalance + cumulativeRealizedPnL + cumulativeCashFlow;

      // Calculate unrealized P&L
      const unrealizedPnL = await this._calculateUnrealizedPnLAtDate(dateStr, allEntries);

      // Store in curve
      this.cache.curve[dateStr] = {
        balance: realizedBalance + unrealizedPnL,
        realizedBalance: realizedBalance,
        unrealizedPnL: unrealizedPnL,
        dayPnL: dayPnL,
        cashFlow: cashFlowByDay.get(dateStr) || 0
      };

      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
      currentDate.setHours(0, 0, 0, 0);
    }

    // Update cache metadata
    this.cache.lastCalculatedDate = this._formatDate(endDate);
    this.cache.lastUpdated = Date.now();
    this.cache.dataHash = this._calculateDataHash();
    this.saveCache();
  }

  /**
   * Get filtered curve data for display (based on date range filter)
   * Returns array of {date, balance, pnl, ticker, unrealizedPnL}
   */
  _getFilteredCurve(filterStartDate = null, filterEndDate = null) {
    if (!this.cache || !this.cache.curve) return [];

    const allDates = Object.keys(this.cache.curve).sort();

    // Determine date range
    let startDateStr = filterStartDate || allDates[0];
    let endDateStr = filterEndDate || allDates[allDates.length - 1];

    // Filter dates within range
    const filteredDates = allDates.filter(dateStr => {
      return dateStr >= startDateStr && dateStr <= endDateStr;
    });

    // Convert to array format for chart
    return filteredDates.map(dateStr => {
      const data = this.cache.curve[dateStr];
      const date = this._parseDate(dateStr);
      return {
        date: date.getTime(),
        balance: data.balance,
        pnl: data.dayPnL,
        ticker: '', // Could add ticker info if needed
        unrealizedPnL: data.unrealizedPnL
      };
    });
  }
}

export const equityCurveManager = new EquityCurveManager();
export { EquityCurveManager };
