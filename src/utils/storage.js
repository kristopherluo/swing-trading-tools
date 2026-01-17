/**
 * Storage Adapter - Unified storage interface using IndexedDB via localForage
 * Provides async storage with automatic migration from localStorage
 */

// Check if localforage is available (loaded via script tag)
if (typeof localforage === 'undefined') {
  throw new Error('localforage library not loaded. Make sure the script tag is included in index.html');
}

// Configure localForage to use IndexedDB
localforage.config({
  name: 'StonkStats',
  version: 1.0,
  storeName: 'trading_data',
  description: 'Trading journal and settings storage'
});

/**
 * Storage adapter that wraps localForage
 * Provides async get/set/remove methods
 */
class StorageAdapter {
  constructor() {
    this.migrated = false;
    this._migrationPromise = null;  // Promise lock to prevent race conditions
    this.migrationKeys = [
      'riskCalcJournal',
      'riskCalcCashFlow',
      'riskCalcSettings',
      'riskCalcJournalMeta',
      'eodCache',
      'historicalPriceCache',
      'companyDataCache',
      'chartDataCache',
      'riskCalcPriceCache',
      'optionsPriceCache',
      'finnhubApiKey',
      'twelveDataApiKey',
      'alphaVantageApiKey',
      'theme'
    ];
  }

  /**
   * Migrate data from localStorage to IndexedDB (one-time operation)
   * Uses promise lock to prevent race conditions from concurrent calls
   */
  async migrateFromLocalStorage() {
    // Return existing migration promise if already running
    if (this._migrationPromise) {
      return this._migrationPromise;
    }

    // Already migrated
    if (this.migrated) {
      return;
    }

    // Create and cache migration promise
    this._migrationPromise = this._performMigration();

    try {
      await this._migrationPromise;
    } finally {
      this._migrationPromise = null;
    }
  }

  /**
   * Internal migration implementation
   * @private
   */
  async _performMigration() {
    try {
      for (const key of this.migrationKeys) {
        const localValue = localStorage.getItem(key);

        if (localValue !== null) {
          // Check if already in IndexedDB
          const indexedValue = await localforage.getItem(key);

          if (indexedValue === null) {
            // Migrate from localStorage to IndexedDB
            try {
              // For JSON strings, parse and store as objects
              let valueToStore = localValue;
              try {
                valueToStore = JSON.parse(localValue);
              } catch (e) {
                // Not JSON, store as string
              }

              await localforage.setItem(key, valueToStore);
            } catch (e) {
              console.error(`[Storage] Failed to migrate ${key}:`, e);
            }
          }
        }
      }

      this.migrated = true;
    } catch (error) {
      console.error('[Storage] Migration error:', error);
      this.migrated = true; // Don't block app if migration fails
    }
  }

  /**
   * Get an item from storage
   * @param {string} key - Storage key
   * @returns {Promise<any>} Value (already parsed if it was JSON)
   */
  async getItem(key) {
    await this.migrateFromLocalStorage();

    try {
      const value = await localforage.getItem(key);
      return value;
    } catch (error) {
      console.error(`[Storage] Error getting ${key}:`, error);
      return null;
    }
  }

  /**
   * Set an item in storage
   * @param {string} key - Storage key
   * @param {any} value - Value to store (will be automatically serialized)
   * @returns {Promise<void>}
   */
  async setItem(key, value) {
    await this.migrateFromLocalStorage();

    try {
      await localforage.setItem(key, value);
    } catch (error) {
      console.error(`[Storage] Error setting ${key}:`, error);
      throw error; // Re-throw to let caller handle quota errors
    }
  }

  /**
   * Remove an item from storage
   * @param {string} key - Storage key
   * @returns {Promise<void>}
   */
  async removeItem(key) {
    await this.migrateFromLocalStorage();

    try {
      await localforage.removeItem(key);
    } catch (error) {
      console.error(`[Storage] Error removing ${key}:`, error);
    }
  }

  /**
   * Clear all items from storage
   * @returns {Promise<void>}
   */
  async clear() {
    try {
      await localforage.clear();
    } catch (error) {
      console.error('[Storage] Error clearing storage:', error);
    }
  }

  /**
   * Get all keys in storage
   * @returns {Promise<string[]>}
   */
  async keys() {
    try {
      return await localforage.keys();
    } catch (error) {
      console.error('[Storage] Error getting keys:', error);
      return [];
    }
  }

  /**
   * Get storage usage statistics
   * @returns {Promise<Object>} Storage usage info
   */
  async getUsage() {
    try {
      const keys = await this.keys();
      let totalSize = 0;
      const breakdown = {};

      for (const key of keys) {
        const value = await localforage.getItem(key);
        const size = new Blob([JSON.stringify(value)]).size;
        breakdown[key] = size;
        totalSize += size;
      }

      return {
        totalSize,
        breakdown,
        keys: keys.length
      };
    } catch (error) {
      console.error('[Storage] Error calculating usage:', error);
      return { totalSize: 0, breakdown: {}, keys: 0 };
    }
  }

  /**
   * Get IndexedDB quota estimate
   * @returns {Promise<Object>} Quota info with usage, quota, and percentage
   */
  async getQuotaEstimate() {
    try {
      if (!navigator.storage || !navigator.storage.estimate) {
        console.warn('[Storage] StorageManager API not available');
        return { usage: 0, quota: 0, percentage: 0, available: false };
      }

      const estimate = await navigator.storage.estimate();
      const usage = estimate.usage || 0;
      const quota = estimate.quota || 0;
      const percentage = quota > 0 ? (usage / quota) * 100 : 0;

      return {
        usage,
        quota,
        percentage: Math.round(percentage * 100) / 100,
        available: true
      };
    } catch (error) {
      console.error('[Storage] Error getting quota estimate:', error);
      return { usage: 0, quota: 0, percentage: 0, available: false };
    }
  }

  /**
   * Check if storage is approaching quota (>= 80%)
   * @returns {Promise<boolean>} True if at or above 80% capacity
   */
  async isApproachingQuota() {
    const estimate = await this.getQuotaEstimate();
    if (!estimate.available) {
      return false; // Can't determine, assume safe
    }
    return estimate.percentage >= 80;
  }
}

// Export singleton instance
export const storage = new StorageAdapter();
