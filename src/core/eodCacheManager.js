/**
 * EOD Cache Manager - Manages End of Day balance and price snapshots
 *
 * Purpose: Store daily snapshots of account balance and stock prices at market close.
 * This allows us to build equity curves without repeatedly fetching historical data.
 *
 * Cache Structure:
 * {
 *   version: 1,
 *   lastSavedTradingDay: '2026-01-10',
 *   days: {
 *     '2026-01-08': {
 *       balance: 105432.50,           // Account balance at EOD (including unrealized)
 *       realizedBalance: 104200.00,   // Account balance without unrealized
 *       unrealizedPnL: 1232.50,       // Total unrealized P&L at EOD
 *       stockPrices: {                // EOD prices for stocks owned at close
 *         'AAPL': 182.50,
 *         'MSFT': 422.30
 *       },
 *       positionsOwned: ['AAPL', 'MSFT'], // Tickers of open positions
 *       cashFlow: 0,                  // Net cash flow on this day
 *       timestamp: 1736366400000,     // When this EOD snapshot was saved
 *       source: 'finnhub',            // 'finnhub', 'twelve_data', or 'recalculated'
 *       incomplete: false,            // Optional: true if data is incomplete
 *       missingTickers: []            // Optional: tickers that failed to fetch
 *     }
 *   }
 * }
 */

import { formatDate, isBusinessDay, getBusinessDaysBetween, parseDate } from '../utils/marketHours.js';
import { storage } from '../utils/storage.js';

const CACHE_KEY = 'eodCache';
const CACHE_VERSION = 1;

class EODCacheManager {
  constructor() {
    this.cache = null;
    this.initialized = false;
  }

  /**
   * Initialize the cache (async)
   * Must be called before using the manager
   */
  async init() {
    if (!this.initialized) {
      this.cache = await this._loadCache();
      this.initialized = true;
    }
  }

  /**
   * Load cache from IndexedDB
   * @returns {Promise<Object>} Cache object
   * @private
   */
  async _loadCache() {
    try {
      const cache = await storage.getItem(CACHE_KEY);
      if (!cache) {
        return this._createEmptyCache();
      }

      // Version check
      if (cache.version !== CACHE_VERSION) {
        console.warn(`EOD cache version mismatch. Expected ${CACHE_VERSION}, got ${cache.version}. Resetting cache.`);
        return this._createEmptyCache();
      }

      // Validate cache structure and clean up corrupted days
      const validatedCache = await this._validateAndCleanCache(cache);

      return validatedCache;
    } catch (error) {
      console.error('Error loading EOD cache:', error);
      return this._createEmptyCache();
    }
  }

  /**
   * Validate cache structure and remove corrupted days
   * @param {Object} cache - Cache object to validate
   * @returns {Promise<Object>} Cleaned cache
   * @private
   */
  async _validateAndCleanCache(cache) {
    if (!cache.days || typeof cache.days !== 'object') {
      console.error('[EODCache] Corrupted cache: missing or invalid days object');
      return this._createEmptyCache();
    }

    const corruptedDays = [];

    // Validate each day's data
    for (const dateStr in cache.days) {
      const dayData = cache.days[dateStr];

      if (!this._validateEODData(dayData, dateStr)) {
        corruptedDays.push(dateStr);
        delete cache.days[dateStr];
      }
    }

    if (corruptedDays.length > 0) {
      console.warn(`[EODCache] Removed ${corruptedDays.length} corrupted days:`, corruptedDays);
      // Save cleaned cache
      try {
        await storage.setItem(CACHE_KEY, cache);
      } catch (error) {
        console.error('[EODCache] Failed to save cleaned cache:', error);
      }
    }

    return cache;
  }

  /**
   * Validate EOD data structure for a single day
   * @param {Object} data - EOD data object
   * @param {string} dateStr - Date string for logging
   * @returns {boolean} True if valid
   * @private
   */
  _validateEODData(data, dateStr) {
    // Check if data exists
    if (!data || typeof data !== 'object') {
      console.warn(`[EODCache] Invalid data for ${dateStr}: not an object`);
      return false;
    }

    // Check required fields exist
    const requiredFields = ['balance', 'unrealizedPnL', 'stockPrices', 'positionsOwned'];
    for (const field of requiredFields) {
      if (!(field in data)) {
        console.warn(`[EODCache] Invalid data for ${dateStr}: missing field '${field}'`);
        return false;
      }
    }

    // Check data types
    if (typeof data.balance !== 'number' || isNaN(data.balance)) {
      console.warn(`[EODCache] Invalid data for ${dateStr}: balance is not a valid number`);
      return false;
    }

    if (typeof data.unrealizedPnL !== 'number' || isNaN(data.unrealizedPnL)) {
      console.warn(`[EODCache] Invalid data for ${dateStr}: unrealizedPnL is not a valid number`);
      return false;
    }

    if (typeof data.stockPrices !== 'object' || data.stockPrices === null) {
      console.warn(`[EODCache] Invalid data for ${dateStr}: stockPrices is not an object`);
      return false;
    }

    if (!Array.isArray(data.positionsOwned)) {
      console.warn(`[EODCache] Invalid data for ${dateStr}: positionsOwned is not an array`);
      return false;
    }

    // Check consistency: positionsOwned should match stockPrices keys
    const stockPriceKeys = Object.keys(data.stockPrices);
    const positionsSet = new Set(data.positionsOwned);

    // Allow incomplete data (marked with incomplete flag)
    if (!data.incomplete) {
      // For complete data, verify all positions have prices
      for (const ticker of data.positionsOwned) {
        if (!(ticker in data.stockPrices)) {
          console.warn(`[EODCache] Invalid data for ${dateStr}: position '${ticker}' missing from stockPrices`);
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Create empty cache structure
   * @returns {Object} Empty cache
   * @private
   */
  _createEmptyCache() {
    return {
      version: CACHE_VERSION,
      lastSavedTradingDay: null,
      days: {}
    };
  }

  /**
   * Save cache to IndexedDB
   * @private
   */
  async _saveCache() {
    try {
      await storage.setItem(CACHE_KEY, this.cache);
    } catch (error) {
      console.error('Error saving EOD cache:', error);
    }
  }

  /**
   * Ensure cache is initialized
   * @private
   */
  _ensureInitialized() {
    if (!this.initialized || !this.cache) {
      throw new Error('EODCacheManager not initialized. Call init() first.');
    }
  }

  /**
   * Save EOD snapshot for a specific trading day
   * @param {string} dateStr - Date in 'YYYY-MM-DD' format
   * @param {Object} data - EOD snapshot data
   * @param {number} data.balance - Account balance at EOD (including unrealized)
   * @param {number} data.realizedBalance - Account balance without unrealized
   * @param {number} data.unrealizedPnL - Total unrealized P&L at EOD
   * @param {Object} data.stockPrices - Map of ticker → EOD price
   * @param {Array<string>} data.positionsOwned - Array of tickers owned at EOD
   * @param {number} data.cashFlow - Net cash flow on this day
   * @param {number} data.timestamp - When this snapshot was saved
   * @param {string} data.source - Data source ('finnhub', 'twelve_data', 'recalculated')
   * @param {boolean} [data.incomplete] - Optional: true if data is incomplete
   * @param {Array<string>} [data.missingTickers] - Optional: tickers that failed to fetch
   */
  saveEODSnapshot(dateStr, data) {
    if (!isBusinessDay(dateStr)) {
      console.warn(`Attempted to save EOD snapshot for non-business day: ${dateStr}`);
      return;
    }

    // Validate required fields
    if (typeof data.balance !== 'number') {
      console.error('Invalid EOD snapshot: balance is required');
      return;
    }

    // Store snapshot
    const existingData = this.cache.days[dateStr];
    this.cache.days[dateStr] = {
      balance: data.balance,
      realizedBalance: data.realizedBalance || data.balance,
      unrealizedPnL: data.unrealizedPnL || 0,
      stockPrices: data.stockPrices || {},
      positionsOwned: data.positionsOwned || [],
      cashFlow: data.cashFlow || 0,
      timestamp: data.timestamp || Date.now(),
      source: data.source || 'unknown',
      incomplete: data.incomplete || false,
      missingTickers: data.missingTickers || [],
      retryCount: data.retryCount ?? existingData?.retryCount ?? 0
    };

    // Update last saved day if this is more recent
    if (!this.cache.lastSavedTradingDay || dateStr > this.cache.lastSavedTradingDay) {
      if (!data.incomplete) {
        this.cache.lastSavedTradingDay = dateStr;
      }
    }

    this._saveCache();

    // Only log significant events (Finnhub saves or incomplete data)
    if (data.source === 'finnhub' || data.incomplete) {
      console.log(`Saved EOD snapshot for ${dateStr}:`, {
        balance: data.balance,
        source: data.source,
        incomplete: data.incomplete
      });
    }
  }

  /**
   * Get EOD data for a specific date
   * @param {string} dateStr - Date in 'YYYY-MM-DD' format
   * @returns {Object|null} EOD data or null if not cached
   */
  getEODData(dateStr) {
    return this.cache.days[dateStr] || null;
  }

  /**
   * Check if EOD data exists for a specific date
   * @param {string} dateStr - Date in 'YYYY-MM-DD' format
   * @returns {boolean} True if data exists and is complete
   */
  hasEODData(dateStr) {
    const data = this.cache.days[dateStr];
    return data && !data.incomplete;
  }

  /**
   * Get EOD price for a specific ticker on a specific date
   * @param {string} ticker - Stock ticker
   * @param {string} dateStr - Date in 'YYYY-MM-DD' format
   * @returns {number|null} Price or null if not found
   */
  getEODPrice(ticker, dateStr) {
    const dayData = this.cache.days[dateStr];
    if (!dayData || !dayData.stockPrices) {
      return null;
    }
    return dayData.stockPrices[ticker] || null;
  }

  /**
   * Find missing days in cache between two dates
   * @param {string} startDate - Start date in 'YYYY-MM-DD' format
   * @param {string} endDate - End date in 'YYYY-MM-DD' format
   * @returns {Array<string>} Array of missing date strings
   */
  findMissingDays(startDate, endDate) {
    const businessDays = getBusinessDaysBetween(startDate, endDate);
    const missingDays = [];

    for (const day of businessDays) {
      if (!this.hasEODData(day)) {
        missingDays.push(day);
      }
    }

    return missingDays;
  }

  /**
   * Bulk save EOD data for multiple days
   * Used for gap filling from Twelve Data
   * @param {Object} daysMap - Map of dateStr → EOD data
   */
  bulkSaveEODData(daysMap) {
    let savedCount = 0;

    for (const [dateStr, data] of Object.entries(daysMap)) {
      this.saveEODSnapshot(dateStr, data);
      savedCount++;
    }

    console.log(`Bulk saved ${savedCount} EOD snapshots`);
  }

  /**
   * Update days from a specific date forward using an update function
   * Used for waterfall updates when past trades change
   * @param {string} startDate - Date to start updating from
   * @param {Function} updateFn - Function that takes (dateStr, currentData) and returns new data
   * @returns {number} Number of days updated
   */
  updateDaysFromDate(startDate, updateFn) {
    let updatedCount = 0;

    // Get all days from startDate forward
    const allDays = Object.keys(this.cache.days)
      .filter(day => day >= startDate)
      .sort();

    for (const dateStr of allDays) {
      const currentData = this.cache.days[dateStr];
      const newData = updateFn(dateStr, currentData);

      if (newData) {
        this.saveEODSnapshot(dateStr, newData);
        updatedCount++;
      }
    }

    return updatedCount;
  }

  /**
   * Invalidate (delete) days from a specific date forward
   * Used when past trades change and we need to recalculate
   * Deletes days entirely so they'll be recalculated from scratch
   * @param {string} startDate - Date to start invalidating from
   * @returns {number} Number of days invalidated
   */
  invalidateDaysFromDate(startDate) {
    let invalidatedCount = 0;

    const allDays = Object.keys(this.cache.days)
      .filter(day => day >= startDate)
      .sort();

    for (const dateStr of allDays) {
      if (this.cache.days[dateStr]) {
        delete this.cache.days[dateStr];
        invalidatedCount++;
      }
    }

    this._saveCache();
    console.log(`Invalidated (deleted) ${invalidatedCount} days from ${startDate}`);

    return invalidatedCount;
  }

  /**
   * Get the most recent trading day with saved EOD data
   * @returns {string|null} Date string or null if no data
   */
  getLastSavedDay() {
    return this.cache.lastSavedTradingDay;
  }

  /**
   * Get all days with EOD data (sorted)
   * @returns {Array<Object>} Array of { date, data } objects
   */
  getAllDays() {
    return Object.keys(this.cache.days)
      .sort()
      .map(date => ({
        date,
        data: this.cache.days[date]
      }));
  }

  /**
   * Get all incomplete days (days marked as incomplete)
   * @returns {Array<Object>} Array of { date, data } objects
   */
  getIncompleteDays() {
    return Object.keys(this.cache.days)
      .filter(date => this.cache.days[date].incomplete)
      .sort()
      .map(date => ({
        date,
        data: this.cache.days[date]
      }));
  }

  /**
   * Delete EOD data for a specific date
   * @param {string} dateStr - Date in 'YYYY-MM-DD' format
   */
  async deleteDayData(dateStr) {
    if (this.cache.days[dateStr]) {
      delete this.cache.days[dateStr];
      await this._saveCache();
      console.log(`Deleted EOD data for ${dateStr}`);
    }
  }

  /**
   * Clear all EOD data (reset cache)
   */
  async clearAllData() {
    this.cache = this._createEmptyCache();
    await this._saveCache();
    console.log('Cleared all EOD cache data');
  }

  /**
   * Cleanup old data (delete data older than specified days)
   * @param {number} daysToKeep - Number of days to keep (default: 730 = 2 years)
   * @returns {Promise<number>} Number of days deleted
   */
  async cleanupOldData(daysToKeep = 730) {
    const today = formatDate(new Date());
    const cutoffDate = formatDate(new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000));

    let deletedCount = 0;

    for (const dateStr of Object.keys(this.cache.days)) {
      if (dateStr < cutoffDate) {
        delete this.cache.days[dateStr];
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      await this._saveCache();
      console.log(`Cleaned up ${deletedCount} days of EOD data older than ${cutoffDate}`);
    }

    return deletedCount;
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  getStats() {
    const allDays = Object.keys(this.cache.days);
    const incompleteDays = allDays.filter(day => this.cache.days[day].incomplete);

    return {
      totalDays: allDays.length,
      incompleteDays: incompleteDays.length,
      completeDays: allDays.length - incompleteDays.length,
      lastSavedDay: this.cache.lastSavedTradingDay,
      dateRange: allDays.length > 0 ? {
        earliest: allDays.sort()[0],
        latest: allDays.sort()[allDays.length - 1]
      } : null,
      cacheSize: new Blob([JSON.stringify(this.cache)]).size
    };
  }

  /**
   * Export cache data (for debugging or backup)
   * @returns {Object} Cache data
   */
  exportData() {
    return JSON.parse(JSON.stringify(this.cache));
  }

  /**
   * Import cache data (for debugging or restore)
   * @param {Object} cacheData - Cache data to import
   */
  async importData(cacheData) {
    if (cacheData.version !== CACHE_VERSION) {
      console.error('Cannot import cache: version mismatch');
      return false;
    }

    this.cache = cacheData;
    await this._saveCache();
    console.log('Imported EOD cache data');
    return true;
  }
}

// Create singleton instance
const eodCacheManager = new EODCacheManager();

export default eodCacheManager;
