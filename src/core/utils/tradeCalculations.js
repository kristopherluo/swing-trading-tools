/**
 * Trade Calculations Utility
 * Shared calculation functions for trade-related metrics
 */

/**
 * Get realized P&L for a single trade
 * For trimmed trades, returns totalRealizedPnL (accumulated from all trims)
 * For closed trades, returns pnl (final P&L)
 * @param {Object} trade - Trade object
 * @returns {number} Realized P&L (0 if not available)
 */
export function getTradeRealizedPnL(trade) {
  return trade.totalRealizedPnL ?? trade.pnl ?? 0;
}

/**
 * Calculate realized P&L from trades
 * Includes closed trades (pnl) and trimmed trades (totalRealizedPnL)
 *
 * @param {Array} trades - Array of trade objects
 * @returns {number} Total realized P&L
 */
export function calculateRealizedPnL(trades) {
  return trades
    .filter(t => t.status === 'closed' || t.status === 'trimmed')
    .reduce((sum, t) => sum + getTradeRealizedPnL(t), 0);
}
