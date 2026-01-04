/**
 * Journal View - Full trade history with filtering and analysis
 */

import { state } from '../../core/state.js';
import { formatCurrency, formatPercent, formatDate } from '../../core/utils.js';
import { trimModal } from '../../components/modals/trimModal.js';
import { viewManager } from '../../components/ui/viewManager.js';
import { dataManager } from '../../core/dataManager.js';

class JournalView {
  constructor() {
    this.elements = {};
    this.currentFilter = 'all';
    this.sortColumn = 'date';
    this.sortDirection = 'desc';
    this.expandedRows = new Set();
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
      if (data.to === 'journal') this.render();
    });
  }

  cacheElements() {
    this.elements = {
      // Header
      journalCount: document.getElementById('journalCount'),

      // Summary bar
      totalPnL: document.getElementById('journalTotalPnL'),
      winRate: document.getElementById('journalWinRate'),
      wins: document.getElementById('journalWins'),
      losses: document.getElementById('journalLosses'),
      avgWin: document.getElementById('journalAvgWin'),
      avgLoss: document.getElementById('journalAvgLoss'),

      // Table
      tableBody: document.getElementById('journalTableBody'),
      tableContainer: document.querySelector('.journal-table-container'),

      // Empty state
      empty: document.getElementById('journalEmpty'),
      goToDashboard: document.getElementById('journalGoToDashboard'),

      // Export buttons
      exportCSV: document.getElementById('journalExportCSV'),
      exportTSV: document.getElementById('journalExportTSV'),

      // Filter buttons
      filterButtons: document.querySelectorAll('.journal-view .filter-btn')
    };
  }

  bindEvents() {
    // Go to dashboard button
    if (this.elements.goToDashboard) {
      this.elements.goToDashboard.addEventListener('click', () => {
        viewManager.navigateTo('dashboard');
      });
    }

    // Filter buttons
    this.elements.filterButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.setFilter(e.target.dataset.filter);
      });
    });

    // Export buttons
    if (this.elements.exportCSV) {
      this.elements.exportCSV.addEventListener('click', () => {
        dataManager.exportCSV();
      });
    }
    if (this.elements.exportTSV) {
      this.elements.exportTSV.addEventListener('click', () => {
        dataManager.exportTSV();
      });
    }

    // Table header click for sorting (delegated)
    const table = document.getElementById('journalTable');
    if (table) {
      table.querySelector('thead').addEventListener('click', (e) => {
        const th = e.target.closest('th');
        if (th && th.dataset.sort) {
          this.handleSort(th.dataset.sort);
        }
      });
    }
  }

  setFilter(filter) {
    this.currentFilter = filter;

    // Update active button state
    this.elements.filterButtons.forEach(btn => {
      btn.classList.toggle('filter-btn--active', btn.dataset.filter === filter);
    });

    this.render();
  }

  handleSort(column) {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'desc';
    }
    this.render();
  }

  getFilteredTrades() {
    const entries = state.journal.entries;

    let filtered;
    switch (this.currentFilter) {
      case 'open':
        filtered = entries.filter(t => t.status === 'open');
        break;
      case 'trimmed':
        filtered = entries.filter(t => t.status === 'trimmed');
        break;
      case 'closed':
        filtered = entries.filter(t => t.status === 'closed');
        break;
      case 'winners':
        filtered = entries.filter(t => {
          const pnl = t.totalRealizedPnL ?? t.pnl ?? 0;
          return (t.status === 'closed' || t.status === 'trimmed') && pnl > 0;
        });
        break;
      case 'losers':
        filtered = entries.filter(t => {
          const pnl = t.totalRealizedPnL ?? t.pnl ?? 0;
          return (t.status === 'closed' || t.status === 'trimmed') && pnl < 0;
        });
        break;
      default:
        filtered = entries;
    }

    // Sort
    return this.sortTrades(filtered);
  }

  sortTrades(trades) {
    const direction = this.sortDirection === 'asc' ? 1 : -1;

    return [...trades].sort((a, b) => {
      let aVal, bVal;

      switch (this.sortColumn) {
        case 'date':
          aVal = new Date(a.timestamp).getTime();
          bVal = new Date(b.timestamp).getTime();
          break;
        case 'ticker':
          aVal = a.ticker.toLowerCase();
          bVal = b.ticker.toLowerCase();
          break;
        case 'entry':
          aVal = a.entry;
          bVal = b.entry;
          break;
        case 'pnl':
          aVal = a.totalRealizedPnL ?? a.pnl ?? 0;
          bVal = b.totalRealizedPnL ?? b.pnl ?? 0;
          break;
        default:
          aVal = new Date(a.timestamp).getTime();
          bVal = new Date(b.timestamp).getTime();
      }

      if (aVal < bVal) return -1 * direction;
      if (aVal > bVal) return 1 * direction;
      return 0;
    });
  }

  render() {
    const trades = this.getFilteredTrades();
    const allTrades = state.journal.entries;

    // Update count
    if (this.elements.journalCount) {
      this.elements.journalCount.textContent = `${allTrades.length} trade${allTrades.length !== 1 ? 's' : ''}`;
    }

    // Render summary bar
    this.renderSummary();

    // Show empty state or table
    if (trades.length === 0) {
      this.showEmptyState();
    } else {
      this.hideEmptyState();
      this.renderTable(trades);
    }
  }

  renderSummary() {
    const closedTrades = state.journal.entries.filter(
      t => t.status === 'closed' || t.status === 'trimmed'
    );

    // Total P&L
    const totalPnL = closedTrades.reduce((sum, t) => {
      return sum + (t.totalRealizedPnL ?? t.pnl ?? 0);
    }, 0);

    if (this.elements.totalPnL) {
      const isPositive = totalPnL >= 0;
      this.elements.totalPnL.textContent = `${isPositive ? '+' : ''}${formatCurrency(totalPnL)}`;
      this.elements.totalPnL.className = `journal-summary-bar__value journal-summary-bar__value--lg ${isPositive ? 'journal-summary-bar__value--positive' : 'journal-summary-bar__value--negative'}`;
    }

    // Wins and losses
    const winningTrades = closedTrades.filter(t => (t.totalRealizedPnL ?? t.pnl ?? 0) > 0);
    const losingTrades = closedTrades.filter(t => (t.totalRealizedPnL ?? t.pnl ?? 0) < 0);
    const wins = winningTrades.length;
    const losses = losingTrades.length;
    const total = wins + losses;

    // Win rate
    if (this.elements.winRate) {
      const winRate = total > 0 ? (wins / total) * 100 : null;
      this.elements.winRate.textContent = winRate !== null ? `${winRate.toFixed(1)}%` : '—';
    }

    // Wins count
    if (this.elements.wins) {
      this.elements.wins.textContent = wins.toString();
    }

    // Losses count
    if (this.elements.losses) {
      this.elements.losses.textContent = losses.toString();
    }

    // Average win
    if (this.elements.avgWin) {
      if (wins > 0) {
        const totalWinPnL = winningTrades.reduce((sum, t) => sum + (t.totalRealizedPnL ?? t.pnl ?? 0), 0);
        const avgWin = totalWinPnL / wins;
        this.elements.avgWin.textContent = `+${formatCurrency(avgWin)}`;
        this.elements.avgWin.className = 'journal-summary-bar__value journal-summary-bar__value--positive';
      } else {
        this.elements.avgWin.textContent = '—';
        this.elements.avgWin.className = 'journal-summary-bar__value';
      }
    }

    // Average loss
    if (this.elements.avgLoss) {
      if (losses > 0) {
        const totalLossPnL = losingTrades.reduce((sum, t) => sum + (t.totalRealizedPnL ?? t.pnl ?? 0), 0);
        const avgLoss = totalLossPnL / losses;
        this.elements.avgLoss.textContent = formatCurrency(avgLoss);
        this.elements.avgLoss.className = 'journal-summary-bar__value journal-summary-bar__value--negative';
      } else {
        this.elements.avgLoss.textContent = '—';
        this.elements.avgLoss.className = 'journal-summary-bar__value';
      }
    }
  }

  renderTable(trades) {
    if (!this.elements.tableBody) return;

    // Update sort indicators in headers
    const headers = document.querySelectorAll('.journal-view .journal-table th[data-sort]');
    headers.forEach(th => {
      th.classList.remove('sort-asc', 'sort-desc');
      if (th.dataset.sort === this.sortColumn) {
        th.classList.add(this.sortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
      }
    });

    this.elements.tableBody.innerHTML = trades.map(trade => {
      const pnl = trade.totalRealizedPnL ?? trade.pnl ?? 0;
      const hasPnL = trade.status === 'closed' || trade.status === 'trimmed';
      const shares = trade.remainingShares ?? trade.shares;
      const sharesDisplay = trade.originalShares
        ? `${shares}/${trade.originalShares}`
        : shares;

      // Calculate R-multiple
      let rMultiple = null;
      if (hasPnL && trade.riskDollars > 0) {
        rMultiple = pnl / trade.riskDollars;
      }

      // Calculate P&L % based on position cost
      let pnlPercent = null;
      if (hasPnL) {
        const totalShares = trade.originalShares || trade.shares;
        const positionCost = trade.entry * totalShares;
        if (positionCost > 0) {
          pnlPercent = (pnl / positionCost) * 100;
        }
      }

      // Check if trade is "free rolled" - realized profit covers remaining risk
      const isTrimmed = trade.status === 'trimmed';
      const realizedPnL = trade.totalRealizedPnL || 0;
      const currentRisk = shares * (trade.entry - trade.stop);
      const isFreeRoll = isTrimmed && realizedPnL >= (currentRisk - 0.01);

      // Determine display status
      let statusClass = trade.status;
      let statusText = trade.status.charAt(0).toUpperCase() + trade.status.slice(1);
      if (isFreeRoll) {
        statusClass = 'freeroll';
        statusText = 'Free Rolled';
      }

      const isExpanded = this.expandedRows.has(trade.id);

      return `
        <tr class="journal-table__row" data-id="${trade.id}">
          <td>${formatDate(trade.timestamp)}</td>
          <td><strong>${trade.ticker}</strong></td>
          <td>${formatCurrency(trade.entry)}</td>
          <td>${trade.exitPrice ? formatCurrency(trade.exitPrice) : '—'}</td>
          <td>${sharesDisplay}</td>
          <td class="${hasPnL ? (pnl >= 0 ? 'journal-table__pnl--positive' : 'journal-table__pnl--negative') : ''}">
            ${hasPnL ? `${pnl >= 0 ? '+' : ''}${formatCurrency(pnl)}` : '—'}
          </td>
          <td class="${hasPnL ? (pnlPercent >= 0 ? 'journal-table__pnl--positive' : 'journal-table__pnl--negative') : ''}">
            ${pnlPercent !== null ? `${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%` : '—'}
          </td>
          <td>${rMultiple !== null ? (Math.abs(rMultiple) < 0.05 ? '<span class="tag tag--breakeven">BE</span>' : `${rMultiple >= 0 ? '+' : ''}${rMultiple.toFixed(1)}R`) : '—'}</td>
          <td>
            <span class="journal-table__status journal-table__status--${statusClass}">
              ${statusText}
            </span>
          </td>
          <td class="journal-table__actions">
            <button class="journal-table__action-btn" data-action="expand" data-id="${trade.id}" title="View details">👁️</button>
            <button class="journal-table__action-btn journal-table__action-btn--delete" data-action="delete" data-id="${trade.id}" title="Delete trade">🗑️</button>
          </td>
        </tr>
        <tr class="journal-table__row-details ${isExpanded ? 'expanded' : ''}" data-details-id="${trade.id}">
          <td colspan="10">
            ${this.renderRowDetails(trade)}
          </td>
        </tr>
      `;
    }).join('');

    // Bind row actions
    this.bindRowActions();
  }

  renderRowDetails(trade) {
    const isTrimmed = trade.status === 'trimmed';
    const isClosed = trade.status === 'closed';
    const isActive = !isClosed;

    return `
      <div class="journal-row-details">
        <div class="journal-row-details__section">
          <div class="journal-row-details__label">Notes</div>
          <div class="journal-row-details__notes-container" data-trade-id="${trade.id}">
            <div class="journal-row-details__notes-view">
              <span class="journal-row-details__value">${trade.notes || 'No notes added'}</span>
              <button class="btn btn--xs btn--ghost" data-action="edit-notes" data-id="${trade.id}">Edit</button>
            </div>
            <div class="journal-row-details__notes-edit" style="display: none;">
              <textarea class="journal-row-details__notes-input" rows="3">${trade.notes || ''}</textarea>
              <div class="journal-row-details__notes-actions">
                <button class="btn btn--xs btn--primary" data-action="save-notes" data-id="${trade.id}">Save</button>
                <button class="btn btn--xs btn--ghost" data-action="cancel-notes" data-id="${trade.id}">Cancel</button>
              </div>
            </div>
          </div>
        </div>
        ${trade.thesis ? `
        <div class="journal-row-details__section">
          <div class="journal-row-details__label">Thesis</div>
          <div class="journal-row-details__value">
            ${trade.thesis.setup ? `Setup: ${trade.thesis.setup}` : ''}
            ${trade.thesis.theme ? `<br>Theme: ${trade.thesis.theme}` : ''}
            ${trade.thesis.conviction ? `<br>Conviction: ${'★'.repeat(trade.thesis.conviction)}${'☆'.repeat(5 - trade.thesis.conviction)}` : ''}
          </div>
        </div>
        ` : ''}
        ${trade.trimHistory && trade.trimHistory.length > 0 ? `
        <div class="journal-row-details__section">
          <div class="journal-row-details__label">Trade Log</div>
          <div class="journal-row-details__value journal-row-details__trade-log">
            ${trade.trimHistory.map((trim, index) => {
              const isLastEntry = index === trade.trimHistory.length - 1;
              const isClose = isLastEntry && trade.status === 'closed';
              const actionText = isClose ? 'Closed' : 'Trimmed';
              const statusClass = isClose ? 'closed' : 'trimmed';
              return `<div class="trade-log-entry"><span class="journal-table__status journal-table__status--${statusClass}">${actionText}</span> ${formatDate(trim.date)}: ${trim.shares} shares @ ${formatCurrency(trim.exitPrice)} = <span class="${trim.pnl >= 0 ? 'text-success' : 'text-danger'}">${trim.pnl >= 0 ? '+' : ''}${formatCurrency(trim.pnl)}</span> (${trim.rMultiple >= 0 ? '+' : ''}${trim.rMultiple.toFixed(1)}R)</div>`;
            }).join('')}
          </div>
        </div>
        ` : ''}
        <div class="journal-row-details__actions">
          ${isActive ? `
            <button class="btn btn--sm btn--primary" data-action="close" data-id="${trade.id}">
              Edit
            </button>
          ` : ''}
          <button class="btn btn--sm btn--ghost" data-action="delete" data-id="${trade.id}">Delete</button>
        </div>
      </div>
    `;
  }

  bindRowActions() {
    // Expand buttons
    this.elements.tableBody.querySelectorAll('[data-action="expand"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = parseInt(e.currentTarget.dataset.id);
        this.toggleRowExpand(id);
      });
    });

    // Close/Trim buttons
    this.elements.tableBody.querySelectorAll('[data-action="close"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = parseInt(e.currentTarget.dataset.id);
        trimModal.open(id);
      });
    });

    // Delete buttons
    this.elements.tableBody.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = parseInt(e.currentTarget.dataset.id);
        if (confirm('Delete this trade?')) {
          state.deleteJournalEntry(id);
        }
      });
    });

    // Edit notes buttons
    this.elements.tableBody.querySelectorAll('[data-action="edit-notes"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = parseInt(e.currentTarget.dataset.id);
        const container = this.elements.tableBody.querySelector(`.journal-row-details__notes-container[data-trade-id="${id}"]`);
        if (container) {
          container.querySelector('.journal-row-details__notes-view').style.display = 'none';
          container.querySelector('.journal-row-details__notes-edit').style.display = 'block';
          container.querySelector('.journal-row-details__notes-input').focus();
        }
      });
    });

    // Save notes buttons
    this.elements.tableBody.querySelectorAll('[data-action="save-notes"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = parseInt(e.currentTarget.dataset.id);
        const container = this.elements.tableBody.querySelector(`.journal-row-details__notes-container[data-trade-id="${id}"]`);
        if (container) {
          const newNotes = container.querySelector('.journal-row-details__notes-input').value;
          state.updateJournalEntry(id, { notes: newNotes });
        }
      });
    });

    // Cancel notes buttons
    this.elements.tableBody.querySelectorAll('[data-action="cancel-notes"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = parseInt(e.currentTarget.dataset.id);
        const container = this.elements.tableBody.querySelector(`.journal-row-details__notes-container[data-trade-id="${id}"]`);
        const trade = state.journal.entries.find(t => t.id === id);
        if (container && trade) {
          container.querySelector('.journal-row-details__notes-input').value = trade.notes || '';
          container.querySelector('.journal-row-details__notes-view').style.display = 'flex';
          container.querySelector('.journal-row-details__notes-edit').style.display = 'none';
        }
      });
    });
  }

  toggleRowExpand(id) {
    if (this.expandedRows.has(id)) {
      this.expandedRows.delete(id);
    } else {
      this.expandedRows.add(id);
    }

    // Toggle classes
    const expandBtn = this.elements.tableBody.querySelector(`[data-action="expand"][data-id="${id}"]`);
    const detailsRow = this.elements.tableBody.querySelector(`[data-details-id="${id}"]`);

    if (expandBtn) {
      expandBtn.classList.toggle('expanded', this.expandedRows.has(id));
    }
    if (detailsRow) {
      detailsRow.classList.toggle('expanded', this.expandedRows.has(id));
    }
  }

  showEmptyState() {
    if (this.elements.tableContainer) {
      this.elements.tableContainer.style.display = 'none';
    }
    if (this.elements.empty) {
      this.elements.empty.classList.add('journal-empty--visible');
    }
  }

  hideEmptyState() {
    if (this.elements.tableContainer) {
      this.elements.tableContainer.style.display = '';
    }
    if (this.elements.empty) {
      this.elements.empty.classList.remove('journal-empty--visible');
    }
  }
}

export const journalView = new JournalView();
export { JournalView };
