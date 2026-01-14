/**
 * Trade Filters - Centralized trade status filtering logic
 * Provides consistent helper functions for filtering trades by status
 */

export const TRADE_STATUS = {
  OPEN: 'open',
  CLOSED: 'closed',
  TRIMMED: 'trimmed'
};

/**
 * Check if a trade is closed (fully exited)
 * @param {Object} trade - Trade object
 * @returns {boolean}
 */
export function isClosedTrade(trade) {
  return trade.status === TRADE_STATUS.CLOSED || trade.status === TRADE_STATUS.TRIMMED;
}

/**
 * Check if a trade is open (has active position)
 * @param {Object} trade - Trade object
 * @returns {boolean}
 */
export function isOpenTrade(trade) {
  return trade.status === TRADE_STATUS.OPEN || trade.status === TRADE_STATUS.TRIMMED;
}

/**
 * Filter trades to only closed/trimmed trades
 * @param {Array} trades - Array of trade objects
 * @returns {Array} Filtered trades
 */
export function getClosedTrades(trades) {
  return trades.filter(isClosedTrade);
}

/**
 * Filter trades to only open/trimmed trades
 * @param {Array} trades - Array of trade objects
 * @returns {Array} Filtered trades
 */
export function getOpenTrades(trades) {
  return trades.filter(isOpenTrade);
}
