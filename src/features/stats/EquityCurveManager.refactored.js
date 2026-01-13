/**
 * EquityCurveManager - REFACTORED to use EOD Cache
 *
 * Key Changes:
 * - Uses EOD cache as primary data source
 * - Only fetches from Twelve Data to fill gaps
 * - Supports waterfall updates for past trade changes
 * - Supports incremental loading with progress reporting
 */

import { state } from '../../core/state.js';
import { historicalPricesBatcher } from './HistoricalPricesBatcher.js';
import priceTracker from '../../core/priceTracker.js';
import eodCacheManager from '../../core/eodCacheManager.js';
import accountBalanceCalculator from '../../shared/AccountBalanceCalculator.js';
import * as marketHours from '../../utils/marketHours.js';

class EquityCurveManager {
  constructor() {
    this.equityCurve = null;
    this.isBuilding = false;
  }

  /**
   * Main entry point: Build equity curve for date range
   * Uses EOD cache where available, fills gaps from Twelve Data
   */
  async buildEquityCurve(filterStartDate = null, filterEndDate = null) {
    if (this.isBuilding) {
      console.warn('[EquityCurve] Already building, skipping duplicate request');
      return this.equityCurve;
    }

    console.time('[EquityCurve] buildEquityCurve');
    this.isBuilding = true;

    try {
      // Determine date range
      const startDate = filterStartDate || this._getEarliestTradeDate();
      const endDate = filterEndDate || marketHours.formatDate(new Date());

      if (!startDate) {
        // No trades yet
        this.equityCurve = {};
        return this.equityCurve;
      }

      // Check for incomplete days and backfill
      await this._backfillIncompleteDays();

      // Find missing days in EOD cache
      const missingDays = eodCacheManager.findMissingDays(startDate, endDate);

      if (missingDays.length > 0) {
        console.log(`[EquityCurve] Found ${missingDays.length} days without EOD data`);
        await this._fillMissingEODData(missingDays);
      }

      // Build equity curve from EOD cache
      this.equityCurve = this._buildCurveFromEODCache(startDate, endDate);

      console.timeEnd('[EquityCurve] buildEquityCurve');
      return this.equityCurve;

    } catch (error) {
      console.error('[EquityCurve] Error building curve:', error);
      this.equityCurve = {};
      return this.equityCurve;
    } finally {
      this.isBuilding = false;
    }
  }

  /**
   * Build equity curve incrementally (for initial load with many trades)
   * Loads from most recent to oldest, respects rate limits
   */
  async buildEquityCurveIncremental(onProgress) {
    console.time('[EquityCurve] buildEquityCurveIncremental');

    const endDate = marketHours.formatDate(new Date());
    const startDate = this._getEarliestTradeDate();

    if (!startDate) {
      if (onProgress) onProgress({ progress: 100, complete: true });
      return {};
    }

    // Get all missing days
    const missingDays = eodCacheManager.findMissingDays(startDate, endDate);

    if (missingDays.length === 0) {
      console.log('[EquityCurve] No missing days, using cached data');
      if (onProgress) onProgress({ progress: 100, complete: true });
      return this._buildCurveFromEODCache(startDate, endDate);
    }

    // Split missing days into chunks (5 days at a time)
    const chunkSize = 5;
    const chunks = this._splitIntoChunks(missingDays.reverse(), chunkSize); // Reverse to load recent first

    console.log(`[EquityCurve] Incrementally loading ${missingDays.length} days in ${chunks.length} chunks`);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      // Fill this chunk
      await this._fillMissingEODData(chunk);

      // Report progress
      const progress = ((i + 1) / chunks.length) * 100;
      console.log(`[EquityCurve] Progress: ${progress.toFixed(0)}% (${i + 1}/${chunks.length} chunks)`);

      if (onProgress) {
        onProgress({
          progress,
          daysLoaded: (i + 1) * chunkSize,
          totalDays: missingDays.length,
          currentChunk: chunk,
          complete: false
        });
      }

      // Throttle to respect rate limits (2 seconds between chunks)
      if (i < chunks.length - 1) {
        await this._sleep(2000);
      }
    }

    if (onProgress) {
      onProgress({ progress: 100, complete: true });
    }

    // Build final curve
    this.equityCurve = this._buildCurveFromEODCache(startDate, endDate);

    console.timeEnd('[EquityCurve] buildEquityCurveIncremental');
    return this.equityCurve;
  }

  /**
   * Waterfall update: Recalculate EOD data from a specific date forward
   * Used when past trades are added/edited/deleted
   */
  async waterfallUpdate(startDate) {
    console.time('[EquityCurve] waterfallUpdate');
    console.log(`[EquityCurve] Waterfall updating from ${startDate}`);

    const endDate = marketHours.formatDate(new Date());

    // Get all days that need recalculation
    const daysToUpdate = marketHours.getBusinessDaysBetween(startDate, endDate);

    console.log(`[EquityCurve] Updating ${daysToUpdate.length} days`);

    // Check if we have historical prices for all needed tickers
    const tickersByDay = this._getOpenPositionsByDay(daysToUpdate);
    const allTickers = new Set();

    for (const day of daysToUpdate) {
      for (const ticker of tickersByDay[day] || []) {
        allTickers.add(ticker);
      }
    }

    // Check which tickers need fetching
    const tickersToFetch = [];
    for (const ticker of allTickers) {
      const hasAllDates = this._hasHistoricalPricesForRange(ticker, startDate, endDate);
      if (!hasAllDates) {
        tickersToFetch.push(ticker);
      }
    }

    // Fetch missing prices
    if (tickersToFetch.length > 0) {
      console.log(`[EquityCurve] Fetching ${tickersToFetch.length} tickers from Twelve Data`);
      await historicalPricesBatcher.batchFetchPrices(tickersToFetch);
    }

    // Recalculate EOD for each affected day
    for (const day of daysToUpdate) {
      const openTickers = tickersByDay[day] || [];
      const eodData = await this._calculateEODForDay(day, openTickers);

      eodCacheManager.saveEODSnapshot(day, {
        ...eodData,
        source: eodCacheManager.hasEODData(day) ? 'recalculated' : 'twelve_data'
      });
    }

    // Rebuild equity curve from updated cache
    await this.buildEquityCurve();

    console.timeEnd('[EquityCurve] waterfallUpdate');
  }

  /**
   * Invalidate cache for a specific trade (triggers waterfall on next build)
   * This is called when a trade is added/edited/deleted
   */
  invalidateForTrade(trade) {
    const affectedStartDate = this._getTradeAffectedStartDate(trade);

    if (affectedStartDate) {
      console.log(`[EquityCurve] Trade changed, will waterfall update from ${affectedStartDate}`);
      // Mark days as needing recalculation
      eodCacheManager.invalidateDaysFromDate(affectedStartDate);
    }
  }

  /**
   * Legacy method for compatibility
   */
  invalidateCache() {
    console.log('[EquityCurve] Full cache invalidation requested');
    eodCacheManager.clearAllData();
    this.equityCurve = null;
  }

  /**
   * Get the equity curve data
   */
  getCurve() {
    return this.equityCurve || {};
  }

  /**
   * Get balance for a specific date from curve
   */
  getBalanceOnDate(dateStr) {
    const curve = this.getCurve();
    return curve[dateStr]?.balance || null;
  }

  // =============================================================================
  // PRIVATE METHODS
  // =============================================================================

  /**
   * Build equity curve from EOD cache
   */
  _buildCurveFromEODCache(startDate, endDate) {
    const curve = {};
    const businessDays = marketHours.getBusinessDaysBetween(startDate, endDate);

    for (const dateStr of businessDays) {
      const eodData = eodCacheManager.getEODData(dateStr);

      if (eodData && !eodData.incomplete) {
        curve[dateStr] = {
          balance: eodData.balance,
          realizedBalance: eodData.realizedBalance,
          unrealizedPnL: eodData.unrealizedPnL,
          dayPnL: accountBalanceCalculator.calculateDayPnL(state.journal.entries, dateStr),
          cashFlow: eodData.cashFlow
        };
      } else {
        // Missing or incomplete data - skip this point
        // (This shouldn't happen if _fillMissingEODData worked correctly)
        console.warn(`[EquityCurve] Missing or incomplete EOD data for ${dateStr}`);
      }
    }

    return curve;
  }

  /**
   * Fill missing EOD data by fetching historical prices from Twelve Data
   */
  async _fillMissingEODData(missingDays) {
    if (missingDays.length === 0) return;

    console.log(`[EquityCurve] Filling ${missingDays.length} missing days`);

    // For each missing day, determine which stocks were open
    const tickersByDay = this._getOpenPositionsByDay(missingDays);

    // Collect unique tickers needed
    const allTickers = new Set();
    for (const day of missingDays) {
      for (const ticker of tickersByDay[day]) {
        allTickers.add(ticker);
      }
    }

    if (allTickers.size === 0) {
      console.log('[EquityCurve] No positions open on missing days');
      return;
    }

    // Check which tickers already have cached prices
    const tickersToFetch = [];
    const startDate = missingDays[0];
    const endDate = missingDays[missingDays.length - 1];

    for (const ticker of allTickers) {
      const hasAllDates = this._hasHistoricalPricesForRange(ticker, startDate, endDate);
      if (!hasAllDates) {
        tickersToFetch.push(ticker);
      }
    }

    // Fetch missing prices from Twelve Data
    if (tickersToFetch.length > 0) {
      console.log(`[EquityCurve] Fetching ${tickersToFetch.length} tickers from Twelve Data`);
      await historicalPricesBatcher.batchFetchPrices(tickersToFetch);
    }

    // Calculate and save EOD data for each missing day
    for (const day of missingDays) {
      const openTickers = tickersByDay[day];
      const eodData = await this._calculateEODForDay(day, openTickers);

      eodCacheManager.saveEODSnapshot(day, {
        ...eodData,
        source: 'twelve_data'
      });
    }
  }

  /**
   * Calculate EOD data for a specific day
   */
  async _calculateEODForDay(dateStr, openTickers) {
    // Get trades open on this day
    const openTrades = this._getTradesOpenOnDate(dateStr);

    // Get EOD prices for each ticker
    const stockPrices = {};
    for (const ticker of openTickers) {
      const price = await historicalPricesBatcher.getPriceOnDate(ticker, dateStr);
      if (price) {
        stockPrices[ticker] = price.close;
      }
    }

    // Use shared calculator to get balance at this date
    const balanceData = accountBalanceCalculator.calculateBalanceAtDate(dateStr, {
      startingBalance: state.settings.startingAccountSize,
      allTrades: state.journal.entries,
      cashFlowTransactions: state.cashFlow.transactions,
      eodPrices: stockPrices
    });

    // Get day's cash flow
    const dayCashFlow = accountBalanceCalculator.calculateDayCashFlow(
      state.cashFlow.transactions,
      dateStr
    );

    return {
      balance: balanceData.balance,
      realizedBalance: balanceData.realizedBalance,
      unrealizedPnL: balanceData.unrealizedPnL,
      stockPrices,
      positionsOwned: openTickers,
      cashFlow: dayCashFlow,
      timestamp: Date.now()
    };
  }

  /**
   * Backfill incomplete days (days that failed to save properly)
   */
  async _backfillIncompleteDays() {
    const incompleteDays = eodCacheManager.getIncompleteDays();

    if (incompleteDays.length === 0) {
      return;
    }

    console.log(`[EquityCurve] Found ${incompleteDays.length} incomplete days, backfilling`);

    const daysToFill = incompleteDays.map(d => d.date);
    await this._fillMissingEODData(daysToFill);
  }

  /**
   * Get open positions grouped by day
   */
  _getOpenPositionsByDay(days) {
    const result = {};

    for (const day of days) {
      const openTrades = this._getTradesOpenOnDate(day);
      result[day] = [...new Set(openTrades.map(t => t.ticker))];
    }

    return result;
  }

  /**
   * Get trades that were open on a specific date
   */
  _getTradesOpenOnDate(dateStr) {
    return state.journal.entries.filter(trade => {
      const enteredBefore = trade.entryDate <= dateStr;
      const notClosedYet = !trade.closeDate || trade.closeDate > dateStr;
      return enteredBefore && notClosedYet;
    });
  }

  /**
   * Check if we have historical prices for a ticker for entire date range
   */
  _hasHistoricalPricesForRange(ticker, startDate, endDate) {
    const cacheData = historicalPricesBatcher.getCachedData(ticker);
    if (!cacheData) return false;

    const businessDays = marketHours.getBusinessDaysBetween(startDate, endDate);

    // Check if we have data for all business days in range
    for (const day of businessDays) {
      if (!cacheData[day]) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get the earliest trade date
   */
  _getEarliestTradeDate() {
    const trades = state.journal.entries;
    if (trades.length === 0) return null;

    return trades.reduce((earliest, trade) => {
      return !earliest || trade.entryDate < earliest ? trade.entryDate : earliest;
    }, null);
  }

  /**
   * Get the affected start date for a trade (for waterfall updates)
   */
  _getTradeAffectedStartDate(trade) {
    const dates = [trade.entryDate];

    if (trade.closeDate) {
      dates.push(trade.closeDate);
    }

    if (trade.trimHistory && trade.trimHistory.length > 0) {
      for (const trim of trade.trimHistory) {
        dates.push(trim.date);
      }
    }

    return dates.sort()[0]; // Return earliest date
  }

  /**
   * Split array into chunks
   */
  _splitIntoChunks(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Sleep utility
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Create singleton instance
const equityCurveManager = new EquityCurveManager();

export { equityCurveManager, EquityCurveManager };
