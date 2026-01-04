/**
 * Positions View - Full-fledged open positions manager
 */

import { state } from '../../core/state.js';
import { formatCurrency, formatPercent } from '../../core/utils.js';
import { trimModal } from '../../components/modals/trimModal.js';
import { viewManager } from '../../components/ui/viewManager.js';
import { priceTracker } from '../../core/priceTracker.js';
import { showToast } from '../../components/ui/ui.js';

class PositionsView {
  constructor() {
    this.elements = {};
    this.currentFilter = 'all';
    this.autoRefreshInterval = null;
  }

  init() {
    this.cacheElements();
    this.bindEvents();
    this.render();

    // Listen for journal changes
    state.on('journalEntryAdded', () => this.render());
    state.on('journalEntryUpdated', () => this.render());
    state.on('journalEntryDeleted', () => this.render());

    // Listen for view changes
    state.on('viewChanged', (data) => {
      if (data.to === 'positions') {
        this.render();
        this.startAutoRefresh();
      } else {
        this.stopAutoRefresh();
      }
    });

    // Listen for price updates
    state.on('pricesUpdated', () => this.render());

    // Start auto-refresh if we're on positions page
    if (state.ui.currentView === 'positions') {
      this.startAutoRefresh();
    }
  }

  cacheElements() {
    this.elements = {
      // Header
      positionsCount: document.getElementById('positionsCount'),

      // Risk bar
      riskBar: document.getElementById('positionsRiskBar'),
      openRisk: document.getElementById('positionsOpenRisk'),
      openPnL: document.getElementById('positionsOpenPnL'),
      riskLevel: document.getElementById('positionsRiskLevel'),
      refreshPricesBtn: document.getElementById('refreshPositionsPricesBtn'),

      // Grid
      grid: document.getElementById('positionsGrid'),

      // Empty state
      empty: document.getElementById('positionsEmpty'),
      emptyTitle: document.getElementById('positionsEmptyTitle'),
      emptyText: document.getElementById('positionsEmptyText'),
      goToDashboard: document.getElementById('positionsGoToDashboard'),

      // Filter buttons
      filterButtons: document.querySelectorAll('.positions-view .filter-btn')
    };
  }

  bindEvents() {
    // Go to dashboard button
    if (this.elements.goToDashboard) {
      this.elements.goToDashboard.addEventListener('click', () => {
        viewManager.navigateTo('dashboard');
      });
    }

    // Refresh prices button
    if (this.elements.refreshPricesBtn) {
      this.elements.refreshPricesBtn.addEventListener('click', async () => {
        await this.refreshPrices();
      });
    }

    // Filter buttons
    this.elements.filterButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.setFilter(e.target.dataset.filter);
      });
    });
  }

  setFilter(filter) {
    this.currentFilter = filter;

    // Update active button state
    this.elements.filterButtons.forEach(btn => {
      btn.classList.toggle('filter-btn--active', btn.dataset.filter === filter);
    });

    this.render();
  }

  getFilteredPositions() {
    const activeTrades = state.journal.entries.filter(
      e => e.status === 'open' || e.status === 'trimmed'
    );

    switch (this.currentFilter) {
      case 'open':
        return activeTrades.filter(t => t.status === 'open');
      case 'trimmed':
        return activeTrades.filter(t => t.status === 'trimmed');
      default:
        return activeTrades;
    }
  }

  render() {
    const positions = this.getFilteredPositions();
    const allActiveCount = state.journal.entries.filter(
      e => e.status === 'open' || e.status === 'trimmed'
    ).length;

    // Update count
    if (this.elements.positionsCount) {
      this.elements.positionsCount.textContent = `${allActiveCount} active position${allActiveCount !== 1 ? 's' : ''}`;
    }

    // Render risk bar
    this.renderRiskBar();

    // Show empty state or grid
    if (positions.length === 0) {
      this.showEmptyState();
    } else {
      this.hideEmptyState();
      this.renderGrid(positions);
    }
  }

  renderRiskBar() {
    const activeTrades = state.journal.entries.filter(
      e => e.status === 'open' || e.status === 'trimmed'
    );

    if (activeTrades.length === 0) {
      if (this.elements.openRisk) {
        this.elements.openRisk.textContent = '$0.00';
      }
      if (this.elements.openPnL) {
        this.elements.openPnL.textContent = '$0.00';
        this.elements.openPnL.className = 'positions-risk-bar__value positions-risk-bar__value--pnl';
      }
      if (this.elements.riskLevel) {
        this.elements.riskLevel.textContent = 'CASH';
        this.elements.riskLevel.className = 'positions-risk-bar__value positions-risk-bar__value--indicator';
        // Reset any inline styles
        this.elements.riskLevel.style.display = 'inline-block';
      }
      return;
    }

    // Calculate NET risk (remaining risk minus realized profit for trimmed trades)
    const totalRisk = activeTrades.reduce((sum, t) => {
      const shares = t.remainingShares ?? t.shares;
      const riskPerShare = t.entry - t.stop;
      const grossRisk = shares * riskPerShare;

      // For trimmed trades, subtract realized profit (net risk can't go below 0)
      const realizedPnL = t.totalRealizedPnL || 0;
      const isTrimmed = t.status === 'trimmed';
      const netRisk = isTrimmed ? Math.max(0, grossRisk - realizedPnL) : grossRisk;

      return sum + netRisk;
    }, 0);

    // Calculate total unrealized P&L
    const pnlData = priceTracker.calculateTotalUnrealizedPnL();
    const totalPnL = pnlData.totalPnL;

    const riskPercent = (totalRisk / state.account.currentSize) * 100;

    // Determine risk level
    let level = 'LOW';
    let levelClass = '';
    if (riskPercent > 2) {
      level = 'HIGH';
      levelClass = 'risk-high';
    } else if (riskPercent > 0.5) {
      level = 'MEDIUM';
      levelClass = 'risk-medium';
    }

    if (this.elements.openRisk) {
      this.elements.openRisk.textContent = `${formatCurrency(totalRisk)} (${formatPercent(riskPercent)})`;
    }

    // Update Open P&L
    if (this.elements.openPnL) {
      const pnlClass = totalPnL >= 0 ? 'text-success' : 'text-danger';
      const pnlSign = totalPnL >= 0 ? '+' : '';
      this.elements.openPnL.textContent = `${pnlSign}${formatCurrency(totalPnL)}`;
      this.elements.openPnL.className = `positions-risk-bar__value positions-risk-bar__value--pnl ${pnlClass}`;
    }

    if (this.elements.riskLevel) {
      this.elements.riskLevel.textContent = level;
      this.elements.riskLevel.className = `positions-risk-bar__value positions-risk-bar__value--indicator ${levelClass}`;
    }
  }

  renderGrid(positions) {
    if (!this.elements.grid) return;

    this.elements.grid.innerHTML = positions.map(trade => {
      const shares = trade.remainingShares ?? trade.shares;
      const riskPerShare = trade.entry - trade.stop;
      const grossRisk = shares * riskPerShare;
      const isTrimmed = trade.status === 'trimmed';
      const realizedPnL = trade.totalRealizedPnL || 0;

      // For trimmed trades, calculate NET risk (remaining risk - realized profit)
      const netRisk = isTrimmed ? Math.max(0, grossRisk - realizedPnL) : grossRisk;
      const riskPercent = (netRisk / state.account.currentSize) * 100;

      // Check if trade is "free rolled" - realized profit covers remaining risk
      const isFreeRoll = isTrimmed && realizedPnL >= (grossRisk - 0.01);

      // Get price data from tracker
      const pnlData = priceTracker.calculateUnrealizedPnL(trade);

      // Determine status
      let statusClass = trade.status;
      let statusText = 'Open';
      if (isFreeRoll) {
        statusClass = 'freeroll';
        statusText = 'Free Rolled';
      } else if (isTrimmed) {
        statusText = 'Trimmed';
      }

      return `
        <div class="position-card ${isTrimmed ? 'position-card--trimmed' : ''}" data-id="${trade.id}">
          <div class="position-card__header">
            <span class="position-card__ticker">${trade.ticker}</span>
            <span class="position-card__status position-card__status--${statusClass}">
              ${statusText}
            </span>
          </div>

          <div class="position-card__details">
            <div class="position-card__detail">
              <span class="position-card__detail-label">Shares</span>
              <span class="position-card__detail-value">${shares}${isTrimmed ? ` / ${trade.originalShares}` : ''}</span>
            </div>
            <div class="position-card__detail">
              <span class="position-card__detail-label">Entry</span>
              <span class="position-card__detail-value">${formatCurrency(trade.entry)}</span>
            </div>
            ${pnlData ? `
            <div class="position-card__detail">
              <span class="position-card__detail-label">Current</span>
              <span class="position-card__detail-value ${pnlData.unrealizedPnL >= 0 ? 'text-success' : 'text-danger'}">${formatCurrency(pnlData.currentPrice)}</span>
            </div>
            ` : ''}
            <div class="position-card__detail">
              <span class="position-card__detail-label">Stop</span>
              <span class="position-card__detail-value">${formatCurrency(trade.stop)}</span>
            </div>
            ${trade.target ? `
            <div class="position-card__detail">
              <span class="position-card__detail-label">Target</span>
              <span class="position-card__detail-value">${formatCurrency(trade.target)}</span>
            </div>
            ` : ''}
          </div>

          <div class="position-card__risk">
            <div class="position-card__risk-row">
              <span class="position-card__risk-label">Open Risk</span>
              <span class="position-card__risk-value">${formatCurrency(netRisk)} (${formatPercent(riskPercent)})</span>
            </div>
            ${pnlData ? `
            <div class="position-card__risk-row">
              <span class="position-card__risk-label">Unrealized P&L</span>
              <span class="position-card__risk-value ${pnlData.unrealizedPnL >= 0 ? 'text-success' : 'text-danger'}">${pnlData.unrealizedPnL >= 0 ? '+' : ''}${formatCurrency(pnlData.unrealizedPnL)} (${pnlData.unrealizedPercent >= 0 ? '+' : ''}${formatPercent(pnlData.unrealizedPercent)})</span>
            </div>
            ` : ''}
            ${isTrimmed ? `
            <div class="position-card__risk-row position-card__realized">
              <span class="position-card__risk-label">Realized P&L</span>
              <span class="position-card__risk-value position-card__realized-value ${realizedPnL >= 0 ? '' : 'text-danger'}">${realizedPnL >= 0 ? '+' : ''}${formatCurrency(realizedPnL)}</span>
            </div>
            ` : ''}
          </div>

          <div class="position-card__actions">
            <button class="position-card__btn position-card__btn--primary" data-action="close" data-id="${trade.id}">
              Edit
            </button>
            <button class="position-card__btn position-card__btn--danger" data-action="delete" data-id="${trade.id}">
              Delete
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Bind action buttons
    this.bindCardActions();
  }

  bindCardActions() {
    // Close/Trim buttons
    this.elements.grid.querySelectorAll('[data-action="close"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = parseInt(e.target.dataset.id);
        trimModal.open(id);
      });
    });

    // Delete buttons
    this.elements.grid.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = parseInt(e.target.dataset.id);
        if (confirm('Delete this trade?')) {
          state.deleteJournalEntry(id);
        }
      });
    });
  }

  showEmptyState() {
    if (this.elements.grid) {
      this.elements.grid.style.display = 'none';
    }

    // Check if there are any active positions at all
    const allActivePositions = state.journal.entries.filter(
      e => e.status === 'open' || e.status === 'trimmed'
    );
    const hasActivePositions = allActivePositions.length > 0;

    // Update empty state message based on context
    if (hasActivePositions) {
      // User has positions but none match the current filter
      if (this.elements.emptyTitle) {
        this.elements.emptyTitle.textContent =
          this.currentFilter === 'trimmed' ? 'No Trimmed Positions' :
          this.currentFilter === 'open' ? 'No Open Positions' :
          'No Positions';
      }
      if (this.elements.emptyText) {
        this.elements.emptyText.textContent =
          this.currentFilter === 'trimmed' ? 'You don\'t have any trimmed positions yet.' :
          this.currentFilter === 'open' ? 'You don\'t have any open positions.' :
          'No positions match this filter.';
      }
      // Hide the "Go to Dashboard" button when they already have positions
      if (this.elements.goToDashboard) {
        this.elements.goToDashboard.style.display = 'none';
      }
    } else {
      // User has no positions at all
      if (this.elements.emptyTitle) {
        this.elements.emptyTitle.textContent = 'No Active Positions';
      }
      if (this.elements.emptyText) {
        this.elements.emptyText.textContent = 'You\'re currently all cash. Head to the Dashboard to log a new trade.';
      }
      // Show the "Go to Dashboard" button
      if (this.elements.goToDashboard) {
        this.elements.goToDashboard.style.display = '';
      }
    }

    if (this.elements.empty) {
      this.elements.empty.classList.add('positions-empty--visible');
    }
  }

  hideEmptyState() {
    if (this.elements.grid) {
      this.elements.grid.style.display = '';
    }
    if (this.elements.empty) {
      this.elements.empty.classList.remove('positions-empty--visible');
    }
  }

  async refreshPrices(isAutoRefresh = false) {
    if (!priceTracker.apiKey) {
      if (!isAutoRefresh) {
        showToast('⚠️ Please add your Finnhub API key in Settings first', 'error');
      }
      return;
    }

    const btn = this.elements.refreshPricesBtn;

    // Show loading state on button if manual refresh
    if (!isAutoRefresh && btn) {
      btn.disabled = true;
      btn.classList.add('loading');
      const svg = btn.querySelector('svg');
      if (svg) {
        svg.style.animation = 'spin 1s linear infinite';
      }
    }

    try {
      const results = await priceTracker.refreshAllActivePrices();

      if (results.success.length > 0) {
        // Only show toast for manual refresh
        if (!isAutoRefresh) {
          showToast(`✅ Updated ${results.success.length} stock price${results.success.length > 1 ? 's' : ''}`, 'success');
        }

        // Render will be triggered by the 'pricesUpdated' event
        state.emit('pricesUpdated', results);
      }

      if (results.failed.length > 0) {
        console.error('Failed to fetch some prices:', results.failed);
        if (!isAutoRefresh) {
          showToast(`⚠️ Failed to fetch ${results.failed.length} price${results.failed.length > 1 ? 's' : ''}`, 'warning');
        }
      }
    } catch (error) {
      console.error('Price refresh error:', error);
      if (!isAutoRefresh) {
        showToast('❌ Failed to fetch prices: ' + error.message, 'error');
      }
    } finally {
      // Re-enable button if manual refresh
      if (!isAutoRefresh && btn) {
        btn.disabled = false;
        btn.classList.remove('loading');
        const svg = btn.querySelector('svg');
        if (svg) {
          svg.style.animation = '';
        }
      }
    }
  }

  startAutoRefresh() {
    // Clear any existing interval
    this.stopAutoRefresh();

    // Refresh immediately on start
    if (priceTracker.apiKey) {
      this.refreshPrices(true);
    }

    // Set up 1-minute auto-refresh
    this.autoRefreshInterval = setInterval(() => {
      this.refreshPrices(true);
    }, 60000); // 60 seconds
  }

  stopAutoRefresh() {
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
      this.autoRefreshInterval = null;
    }
  }
}

export const positionsView = new PositionsView();
export { PositionsView };
