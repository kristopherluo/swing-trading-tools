/**
 * Stats - Trading statistics calculations and DOM rendering
 */

import { state } from '../../core/state.js';

class Stats {
  constructor() {
    this.elements = {};
    this.stats = {};
  }

  init() {
    // Cache DOM elements
    this.elements = {
      // Trading Performance
      openPositions: document.getElementById('statOpenPositions'),
      openRisk: document.getElementById('statOpenRisk'),
      totalPnL: document.getElementById('statTotalPnL'),
      pnlCard: document.getElementById('statPnLCard'),
      pnlTrades: document.getElementById('statPnLTrades'),
      winRate: document.getElementById('statWinRate'),
      winLoss: document.getElementById('statWinLoss'),
      sharpe: document.getElementById('statSharpe'),

      // Account Growth
      currentAccount: document.getElementById('statCurrentAccount'),
      accountChange: document.getElementById('statAccountChange'),
      tradingGrowth: document.getElementById('statTradingGrowth'),
      tradingGrowthCard: document.getElementById('statTradingGrowthCard'),
      totalGrowth: document.getElementById('statTotalGrowth'),
      totalGrowthCard: document.getElementById('statTotalGrowthCard'),
      cashFlow: document.getElementById('statCashFlow'),

      // Chart
      chartValue: document.getElementById('statChartValue')
    };

    // Listen for journal changes
    state.on('journalEntryAdded', () => this.refresh());
    state.on('journalEntryUpdated', () => this.refresh());
    state.on('journalEntryDeleted', () => this.refresh());
    state.on('viewChanged', (data) => {
      if (data.to === 'stats') this.refresh();
    });

    // Initial calculation
    this.refresh();
  }

  refresh() {
    this.calculate();
    this.render();
  }

  calculate() {
    const entries = state.journal.entries;
    const settings = state.settings;
    const account = state.account;

    // Open positions
    const openTrades = entries.filter(e => e.status === 'open');
    const openRiskTotal = openTrades.reduce((sum, t) => sum + (t.riskDollars || 0), 0);

    // Closed trades (includes 'closed' and 'trimmed')
    const closedTrades = entries.filter(e => e.status === 'closed' || e.status === 'trimmed');

    // P&L from closed trades - use totalRealizedPnL for trades with trim history
    const totalPnL = closedTrades.reduce((sum, t) => sum + (t.totalRealizedPnL ?? t.pnl ?? 0), 0);

    // Win/Loss calculation
    const wins = closedTrades.filter(t => (t.totalRealizedPnL ?? t.pnl ?? 0) > 0);
    const losses = closedTrades.filter(t => (t.totalRealizedPnL ?? t.pnl ?? 0) < 0);
    const winRate = closedTrades.length > 0
      ? (wins.length / closedTrades.length) * 100
      : null;

    // Sharpe ratio calculation
    const sharpe = this.calculateSharpe(closedTrades);

    // Account growth calculations
    const startingAccount = settings.startingAccountSize;
    const currentAccount = account.currentSize;
    const tradingGrowth = startingAccount > 0
      ? (totalPnL / startingAccount) * 100
      : 0;
    const totalGrowth = startingAccount > 0
      ? ((currentAccount - startingAccount) / startingAccount) * 100
      : 0;
    const netCashFlow = currentAccount - startingAccount - totalPnL;

    this.stats = {
      openPositions: openTrades.length,
      openRiskTotal,
      closedTradeCount: closedTrades.length,
      totalPnL,
      wins: wins.length,
      losses: losses.length,
      winRate,
      sharpe,
      startingAccount,
      currentAccount,
      tradingGrowth,
      totalGrowth,
      netCashFlow
    };

    return this.stats;
  }

  calculateSharpe(closedTrades) {
    if (closedTrades.length < 2) return null;

    // Get returns as percentages
    const returns = closedTrades.map(t => {
      const pnl = t.totalRealizedPnL ?? t.pnl ?? 0;
      const positionSize = t.positionSize || 1;
      return (pnl / positionSize) * 100;
    });

    // Mean return
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;

    // Standard deviation
    const squaredDiffs = returns.map(r => Math.pow(r - mean, 2));
    const variance = squaredDiffs.reduce((sum, d) => sum + d, 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    // Sharpe ratio (simplified, no risk-free rate)
    if (stdDev === 0) return null;
    return mean / stdDev;
  }

  render() {
    const s = this.stats;

    // Trading Performance
    if (this.elements.openPositions) {
      this.elements.openPositions.textContent = s.openPositions;
    }
    if (this.elements.openRisk) {
      this.elements.openRisk.textContent = `$${this.formatNumber(s.openRiskTotal)} at risk`;
    }

    // Total P&L
    if (this.elements.totalPnL) {
      const isPositive = s.totalPnL >= 0;
      this.elements.totalPnL.textContent = `${isPositive ? '+' : ''}$${this.formatNumber(s.totalPnL)}`;
      this.elements.pnlCard?.classList.toggle('stat-card--success', isPositive && s.totalPnL !== 0);
      this.elements.pnlCard?.classList.toggle('stat-card--danger', !isPositive);
    }
    if (this.elements.pnlTrades) {
      this.elements.pnlTrades.textContent = `${s.closedTradeCount} closed trade${s.closedTradeCount !== 1 ? 's' : ''}`;
    }

    // Win Rate
    if (this.elements.winRate) {
      this.elements.winRate.textContent = s.winRate !== null
        ? `${s.winRate.toFixed(1)}%`
        : '—';
    }
    if (this.elements.winLoss) {
      const winText = `${s.wins} win${s.wins !== 1 ? 's' : ''}`;
      const lossText = `${s.losses} loss${s.losses !== 1 ? 'es' : ''}`;
      this.elements.winLoss.textContent = `${winText} · ${lossText}`;
    }

    // Sharpe Ratio
    if (this.elements.sharpe) {
      this.elements.sharpe.textContent = s.sharpe !== null
        ? s.sharpe.toFixed(2)
        : '—';
    }

    // Account Growth
    if (this.elements.currentAccount) {
      this.elements.currentAccount.textContent = `$${this.formatNumber(s.currentAccount)}`;
    }
    if (this.elements.accountChange) {
      const change = s.currentAccount - s.startingAccount;
      const isPositive = change >= 0;
      this.elements.accountChange.textContent = `${isPositive ? '+' : ''}$${this.formatNumber(change)} from start`;
    }

    // Trading Growth
    if (this.elements.tradingGrowth) {
      const isPositive = s.tradingGrowth >= 0;
      this.elements.tradingGrowth.textContent = `${isPositive ? '+' : ''}${s.tradingGrowth.toFixed(2)}%`;
      this.elements.tradingGrowthCard?.classList.toggle('stat-card--success', isPositive && s.tradingGrowth !== 0);
      this.elements.tradingGrowthCard?.classList.toggle('stat-card--danger', !isPositive);
    }

    // Total Growth
    if (this.elements.totalGrowth) {
      const isPositive = s.totalGrowth >= 0;
      this.elements.totalGrowth.textContent = `${isPositive ? '+' : ''}${s.totalGrowth.toFixed(2)}%`;
      this.elements.totalGrowthCard?.classList.toggle('stat-card--success', isPositive && s.totalGrowth !== 0);
      this.elements.totalGrowthCard?.classList.toggle('stat-card--danger', !isPositive);
    }

    // Net Cash Flow
    if (this.elements.cashFlow) {
      const isPositive = s.netCashFlow >= 0;
      this.elements.cashFlow.textContent = `${isPositive ? '+' : ''}$${this.formatNumber(s.netCashFlow)}`;
    }

    // Chart value (current account)
    if (this.elements.chartValue) {
      this.elements.chartValue.textContent = `$${this.formatNumber(s.currentAccount)}`;
    }
  }

  formatNumber(num) {
    return Math.abs(num).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  // Build equity curve data points for chart
  buildEquityCurve() {
    const entries = state.journal.entries;
    const startingBalance = state.settings.startingAccountSize;

    // Get closed trades sorted by close date
    const closedTrades = entries
      .filter(e => e.status === 'closed' || e.status === 'trimmed')
      .map(t => ({
        date: t.closeDate || t.timestamp,
        pnl: t.totalRealizedPnL ?? t.pnl ?? 0,
        ticker: t.ticker
      }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    if (closedTrades.length === 0) {
      return [];
    }

    // Build running balance
    let balance = startingBalance;
    const dataPoints = [{
      date: new Date(closedTrades[0].date).getTime() - 86400000, // Day before first trade
      balance: startingBalance,
      pnl: 0,
      ticker: 'Start'
    }];

    closedTrades.forEach(trade => {
      balance += trade.pnl;
      dataPoints.push({
        date: new Date(trade.date).getTime(),
        balance,
        pnl: trade.pnl,
        ticker: trade.ticker
      });
    });

    return dataPoints;
  }

  getStats() {
    return this.stats;
  }
}

export const stats = new Stats();
export { Stats };
