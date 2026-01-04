/**
 * TrimModal - Handles partial position exits (trimming trades)
 */

import { state } from '../../core/state.js';
import { formatCurrency, formatNumber } from '../../core/utils.js';
import { showToast } from '../ui/ui.js';

class TrimModal {
  constructor() {
    this.elements = {};
    this.currentTrade = null;
    this.selectedR = 5;
    this.selectedTrimPercent = 100;
  }

  init() {
    this.cacheElements();
    this.bindEvents();
  }

  cacheElements() {
    this.elements = {
      modal: document.getElementById('trimModal'),
      overlay: document.getElementById('trimModalOverlay'),
      closeBtn: document.getElementById('closeTrimModalBtn'),
      cancelBtn: document.getElementById('cancelTrimBtn'),
      confirmBtn: document.getElementById('confirmTrimBtn'),
      ticker: document.getElementById('trimModalTicker'),
      entryPrice: document.getElementById('trimEntryPrice'),
      originalStop: document.getElementById('trimOriginalStop'),
      stopLoss: document.getElementById('trimStopLoss'),
      riskPerShare: document.getElementById('trimRiskPerShare'),
      remainingShares: document.getElementById('trimRemainingShares'),
      exitPrice: document.getElementById('trimExitPrice'),
      rDisplay: document.getElementById('trimRDisplay'),
      customTrimPercent: document.getElementById('customTrimPercent'),
      dateInput: document.getElementById('trimDate'),
      newStop: document.getElementById('trimNewStop'),
      sharesClosing: document.getElementById('trimSharesClosing'),
      sharesRemaining: document.getElementById('trimSharesRemaining'),
      profitPerShare: document.getElementById('trimProfitPerShare'),
      totalPnL: document.getElementById('trimTotalPnL'),
      preview: document.getElementById('trimPreview'),
      onlyMoveStopCheckbox: document.getElementById('onlyMoveStopCheckbox'),
      newStopOptional: document.getElementById('newStopOptional')
    };

    // Cache sections for show/hide (done after modal is in DOM)
    this.sections = {};
  }

  cacheSections() {
    // Cache sections dynamically since they need to be in DOM
    const trimSections = Array.from(this.elements.modal?.querySelectorAll('.trim-section') || []);

    // Find section containing R-multiple buttons
    this.sections.rMultiple = trimSections.find(section =>
      section.querySelector('[data-r]')
    );

    // Find section containing trim percentage buttons
    this.sections.trimPercent = trimSections.find(section =>
      section.querySelector('[data-trim]')
    );

    // Find section containing close date
    this.sections.closeDate = trimSections.find(section =>
      section.querySelector('#trimDate')
    );

    // Shares display is inside trim percentage section
    this.sections.sharesDisplay = this.elements.modal?.querySelector('.trim-shares-display');
  }

  bindEvents() {
    this.elements.closeBtn?.addEventListener('click', () => this.close());
    this.elements.cancelBtn?.addEventListener('click', () => this.close());
    this.elements.overlay?.addEventListener('click', () => this.close());

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen()) this.close();
    });

    this.elements.modal?.querySelectorAll('[data-r]').forEach(btn => {
      btn.addEventListener('click', (e) => this.selectR(e));
    });

    this.elements.modal?.querySelectorAll('[data-trim]').forEach(btn => {
      btn.addEventListener('click', (e) => this.selectTrimPercent(e));
    });

    this.elements.customTrimPercent?.addEventListener('input', () => this.handleCustomTrimPercent());
    this.elements.exitPrice?.addEventListener('input', () => this.handleManualExitPrice());
    this.elements.confirmBtn?.addEventListener('click', () => this.confirm());
    this.elements.onlyMoveStopCheckbox?.addEventListener('change', () => this.handleOnlyMoveStopToggle());
  }

  setDefaultDate() {
    if (this.elements.dateInput) {
      this.elements.dateInput.value = new Date().toISOString().split('T')[0];
    }
  }

  open(tradeId) {
    const trade = state.journal.entries.find(e => e.id === tradeId);
    if (!trade) {
      showToast('❌ Trade not found', 'error');
      return;
    }

    this.currentTrade = trade;

    if (trade.originalShares === undefined || trade.originalShares === null) {
      trade.originalShares = trade.shares;
      trade.remainingShares = trade.shares;
      trade.trimHistory = [];
      trade.totalRealizedPnL = 0;
    }

    this.populateTradeData(trade);
    this.selectedR = 5;
    this.selectedTrimPercent = 100;
    this.setDefaultDate();

    // Cache sections (needs to be done after modal is in DOM)
    this.cacheSections();

    // Reset "Only move stop" checkbox
    if (this.elements.onlyMoveStopCheckbox) {
      this.elements.onlyMoveStopCheckbox.checked = false;
    }
    this.showAllSections();

    this.elements.modal?.querySelectorAll('[data-r]').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.r) === this.selectedR);
    });
    this.elements.modal?.querySelectorAll('[data-trim]').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.trim) === this.selectedTrimPercent);
    });

    if (this.elements.customTrimPercent) this.elements.customTrimPercent.value = '';

    this.calculateExitPrice();
    this.calculatePreview();

    this.elements.modal?.classList.add('open');
    this.elements.overlay?.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  close() {
    this.elements.modal?.classList.remove('open');
    this.elements.overlay?.classList.remove('open');
    document.body.style.overflow = '';
    this.currentTrade = null;
  }

  isOpen() {
    return this.elements.modal?.classList.contains('open') ?? false;
  }

  populateTradeData(trade) {
    const remainingShares = trade.remainingShares ?? trade.shares;
    const originalStop = trade.originalStop ?? trade.stop;
    const currentStop = trade.currentStop ?? trade.stop;
    const riskPerShare = trade.entry - originalStop;

    if (this.elements.ticker) this.elements.ticker.textContent = trade.ticker;
    if (this.elements.entryPrice) this.elements.entryPrice.textContent = formatCurrency(trade.entry);
    if (this.elements.originalStop) this.elements.originalStop.textContent = formatCurrency(originalStop);
    if (this.elements.stopLoss) this.elements.stopLoss.textContent = formatCurrency(currentStop);
    if (this.elements.riskPerShare) this.elements.riskPerShare.textContent = formatCurrency(riskPerShare);
    if (this.elements.remainingShares) this.elements.remainingShares.textContent = formatNumber(remainingShares);

    // Clear new stop input
    if (this.elements.newStop) this.elements.newStop.value = '';
  }

  selectR(e) {
    const btn = e.target.closest('[data-r]');
    if (!btn) return;

    this.selectedR = parseInt(btn.dataset.r);
    this.elements.modal?.querySelectorAll('[data-r]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // Auto-suggest trim percentage based on 1/(1+R) rule
    // 1R → 50%, 2R → 33%, 3R → 25%, 4R → 20%, 5R → 17%
    const suggestedTrimPercent = Math.round((1 / (1 + this.selectedR)) * 100);
    this.setTrimPercent(suggestedTrimPercent);

    this.calculateExitPrice();
    this.calculatePreview();
  }

  setTrimPercent(percent) {
    this.selectedTrimPercent = percent;

    // Update trim preset button states
    this.elements.modal?.querySelectorAll('[data-trim]').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.trim) === percent);
    });

    // If no preset matches, show in custom input
    const hasMatchingPreset = Array.from(this.elements.modal?.querySelectorAll('[data-trim]') || [])
      .some(btn => parseInt(btn.dataset.trim) === percent);

    if (this.elements.customTrimPercent) {
      this.elements.customTrimPercent.value = hasMatchingPreset ? '' : percent;
    }
  }

  selectTrimPercent(e) {
    const btn = e.target.closest('[data-trim]');
    if (!btn) return;

    this.selectedTrimPercent = parseInt(btn.dataset.trim);
    this.elements.modal?.querySelectorAll('[data-trim]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    if (this.elements.customTrimPercent) this.elements.customTrimPercent.value = '';
    this.calculatePreview();
  }

  handleCustomTrimPercent() {
    const value = parseFloat(this.elements.customTrimPercent?.value);
    if (!isNaN(value) && value > 0 && value <= 100) {
      this.selectedTrimPercent = value;
      this.elements.modal?.querySelectorAll('[data-trim]').forEach(b => b.classList.remove('active'));
      this.calculatePreview();
    }
  }

  handleManualExitPrice() {
    const exitPrice = parseFloat(this.elements.exitPrice?.value);
    if (!this.currentTrade || isNaN(exitPrice)) return;

    // Use originalStop for R-multiple calculation
    const originalStop = this.currentTrade.originalStop ?? this.currentTrade.stop;
    const riskPerShare = this.currentTrade.entry - originalStop;
    const rMultiple = riskPerShare !== 0 ? (exitPrice - this.currentTrade.entry) / riskPerShare : 0;

    if (this.elements.rDisplay) {
      this.elements.rDisplay.textContent = `(${rMultiple.toFixed(1)}R)`;
      this.elements.rDisplay.classList.toggle('negative', rMultiple < 0);
    }

    this.elements.modal?.querySelectorAll('[data-r]').forEach(b => b.classList.remove('active'));
    this.calculatePreview();
  }

  calculateExitPrice() {
    if (!this.currentTrade) return;

    // Use originalStop for R-multiple calculation
    const originalStop = this.currentTrade.originalStop ?? this.currentTrade.stop;
    const riskPerShare = this.currentTrade.entry - originalStop;
    const exitPrice = this.currentTrade.entry + (this.selectedR * riskPerShare);

    if (this.elements.exitPrice) this.elements.exitPrice.value = exitPrice.toFixed(2);
    if (this.elements.rDisplay) {
      this.elements.rDisplay.textContent = `(${this.selectedR}R)`;
      this.elements.rDisplay.classList.remove('negative');
    }
  }

  calculatePreview() {
    if (!this.currentTrade) return;

    const exitPrice = parseFloat(this.elements.exitPrice?.value) || 0;
    const remainingShares = this.currentTrade.remainingShares ?? this.currentTrade.shares;
    const sharesToClose = Math.floor(remainingShares * (this.selectedTrimPercent / 100));
    const sharesRemaining = remainingShares - sharesToClose;

    const profitPerShare = exitPrice - this.currentTrade.entry;
    const totalPnL = profitPerShare * sharesToClose;
    const isProfit = totalPnL >= 0;

    if (this.elements.sharesClosing) this.elements.sharesClosing.textContent = `${formatNumber(sharesToClose)} shares`;
    if (this.elements.sharesRemaining) this.elements.sharesRemaining.textContent = `(${formatNumber(sharesRemaining)} remaining)`;

    if (this.elements.profitPerShare) {
      this.elements.profitPerShare.textContent = `${isProfit ? '+' : ''}${formatCurrency(profitPerShare)}`;
      this.elements.profitPerShare.className = `trim-preview__value ${isProfit ? 'text-success' : 'text-danger'}`;
    }
    if (this.elements.totalPnL) {
      this.elements.totalPnL.textContent = `${isProfit ? '+' : ''}${formatCurrency(totalPnL)}`;
      this.elements.totalPnL.className = `trim-preview__value ${isProfit ? 'text-success' : 'text-danger'}`;
    }
    if (this.elements.preview) this.elements.preview.classList.toggle('negative', !isProfit);

    // Update confirm button text based on full close vs trim
    if (this.elements.confirmBtn) {
      const isFullClose = sharesRemaining === 0;
      this.elements.confirmBtn.textContent = isFullClose ? 'Confirm Close' : 'Confirm Trim';
    }
  }

  handleOnlyMoveStopToggle() {
    const isChecked = this.elements.onlyMoveStopCheckbox?.checked;

    if (isChecked) {
      this.hideClosingFields();
      // Update button text
      if (this.elements.confirmBtn) {
        this.elements.confirmBtn.textContent = 'Confirm Move Stop';
      }
      // Hide "(optional)" text since new stop is required
      if (this.elements.newStopOptional) {
        this.elements.newStopOptional.style.display = 'none';
      }
    } else {
      this.showAllSections();
      // Recalculate preview to restore button text
      this.calculatePreview();
      // Show "(optional)" text
      if (this.elements.newStopOptional) {
        this.elements.newStopOptional.style.display = '';
      }
    }
  }

  hideClosingFields() {
    // Hide R-Multiple section
    if (this.sections.rMultiple) {
      this.sections.rMultiple.style.display = 'none';
    }

    // Hide Trim Percentage section
    if (this.sections.trimPercent) {
      this.sections.trimPercent.style.display = 'none';
    }

    // Hide Close Date section
    if (this.sections.closeDate) {
      this.sections.closeDate.style.display = 'none';
    }

    // Hide shares display
    if (this.sections.sharesDisplay) {
      this.sections.sharesDisplay.style.display = 'none';
    }

    // Hide P&L preview
    if (this.elements.preview) {
      this.elements.preview.style.display = 'none';
    }
  }

  showAllSections() {
    // Show R-Multiple section
    if (this.sections.rMultiple) {
      this.sections.rMultiple.style.display = '';
    }

    // Show Trim Percentage section
    if (this.sections.trimPercent) {
      this.sections.trimPercent.style.display = '';
    }

    // Show Close Date section
    if (this.sections.closeDate) {
      this.sections.closeDate.style.display = '';
    }

    // Show shares display
    if (this.sections.sharesDisplay) {
      this.sections.sharesDisplay.style.display = '';
    }

    // Show P&L preview
    if (this.elements.preview) {
      this.elements.preview.style.display = '';
    }
  }

  confirm() {
    if (!this.currentTrade) return;

    // Check if "Only move stop" mode is active
    const isOnlyMoveStop = this.elements.onlyMoveStopCheckbox?.checked;

    if (isOnlyMoveStop) {
      // Only move stop mode - no shares closed
      const newStopValue = parseFloat(this.elements.newStop?.value);
      if (isNaN(newStopValue) || newStopValue <= 0) {
        showToast('⚠️ Enter a new stop', 'error');
        return;
      }

      // Update only the stop, no trimming
      const updates = {
        currentStop: newStopValue,
        stop: newStopValue
      };

      state.updateJournalEntry(this.currentTrade.id, updates);
      showToast(`✅ ${this.currentTrade.ticker} stop moved to ${formatCurrency(newStopValue)}`, 'success');
      this.close();
      return;
    }

    // Normal trim/close mode
    const exitPrice = parseFloat(this.elements.exitPrice?.value);
    if (isNaN(exitPrice) || exitPrice <= 0) {
      showToast('⚠️ Please enter a valid exit price', 'error');
      return;
    }

    const remainingShares = this.currentTrade.remainingShares ?? this.currentTrade.shares;
    const sharesToClose = Math.floor(remainingShares * (this.selectedTrimPercent / 100));

    if (sharesToClose <= 0) {
      showToast('⚠️ No shares to close', 'error');
      return;
    }

    const sharesAfterTrim = remainingShares - sharesToClose;
    // Use originalStop for R-multiple calculation
    const originalStop = this.currentTrade.originalStop ?? this.currentTrade.stop;
    const riskPerShare = this.currentTrade.entry - originalStop;
    const rMultiple = riskPerShare !== 0 ? (exitPrice - this.currentTrade.entry) / riskPerShare : 0;
    const pnl = (exitPrice - this.currentTrade.entry) * sharesToClose;

    const closeDate = this.elements.dateInput?.value
      ? new Date(this.elements.dateInput.value + 'T12:00:00').toISOString()
      : new Date().toISOString();

    const trimEvent = {
      id: Date.now(),
      date: closeDate,
      shares: sharesToClose,
      exitPrice: exitPrice,
      rMultiple: rMultiple,
      pnl: pnl,
      percentTrimmed: this.selectedTrimPercent
    };

    if (!this.currentTrade.trimHistory) this.currentTrade.trimHistory = [];

    const isFullClose = sharesAfterTrim === 0;
    const newStatus = isFullClose ? 'closed' : 'trimmed';
    const existingPnL = this.currentTrade.totalRealizedPnL || 0;
    const newTotalPnL = existingPnL + pnl;

    const updates = {
      originalShares: this.currentTrade.originalShares ?? this.currentTrade.shares,
      originalStop: this.currentTrade.originalStop ?? this.currentTrade.stop,
      remainingShares: sharesAfterTrim,
      status: newStatus,
      trimHistory: [...this.currentTrade.trimHistory, trimEvent],
      totalRealizedPnL: newTotalPnL
    };

    // Update current stop if new stop provided
    const newStopValue = parseFloat(this.elements.newStop?.value);
    if (!isNaN(newStopValue) && newStopValue > 0) {
      updates.currentStop = newStopValue;
      updates.stop = newStopValue; // Also update main stop for compatibility
    }

    if (isFullClose) {
      updates.exitPrice = exitPrice;
      updates.exitDate = closeDate;
      updates.pnl = newTotalPnL;
    }

    state.updateJournalEntry(this.currentTrade.id, updates);
    state.updateAccount({ realizedPnL: state.account.realizedPnL + pnl });

    if (state.settings.dynamicAccountEnabled) {
      const newSize = state.settings.startingAccountSize + state.account.realizedPnL;
      state.updateAccount({ currentSize: newSize });
      state.emit('accountSizeChanged', newSize);
    }

    const actionText = isFullClose ? 'closed' : `trimmed ${this.selectedTrimPercent}%`;
    const emoji = pnl >= 0 ? '✅' : '📉';
    showToast(
      `${emoji} ${this.currentTrade.ticker} ${actionText}: ${pnl >= 0 ? '+' : ''}${formatCurrency(pnl)}`,
      pnl >= 0 ? 'success' : 'warning'
    );

    this.close();
  }
}

export const trimModal = new TrimModal();
