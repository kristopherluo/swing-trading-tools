/**
 * ClearDataModal - Confirmation modal for clearing all data
 */

import { state } from '../../core/state.js';
import { dataManager } from '../../core/dataManager.js';

class ClearDataModal {
  constructor() {
    this.elements = {};
  }

  init() {
    this.elements = {
      modal: document.getElementById('clearDataModal'),
      overlay: document.getElementById('clearDataModalOverlay'),
      closeBtn: document.getElementById('closeClearDataBtn'),
      cancelBtn: document.getElementById('cancelClearDataBtn'),
      confirmBtn: document.getElementById('confirmClearDataBtn'),
      tradeCount: document.getElementById('clearDataTradeCount'),
      achievementCount: document.getElementById('clearDataAchievementCount')
    };

    this.bindEvents();
  }

  bindEvents() {
    this.elements.closeBtn?.addEventListener('click', () => this.close());
    this.elements.overlay?.addEventListener('click', () => this.close());
    this.elements.cancelBtn?.addEventListener('click', () => this.close());
    this.elements.confirmBtn?.addEventListener('click', () => dataManager.confirmClearAllData());

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen()) this.close();
    });
  }

  isOpen() {
    return this.elements.modal?.classList.contains('open');
  }

  open() {
    if (!this.elements.modal) return;

    // Update counts
    const tradeCount = state.journal.entries.length;
    const achievementCount = state.journalMeta.achievements.unlocked.length;
    const streak = state.journalMeta.achievements.progress.currentStreak;

    if (this.elements.tradeCount) {
      this.elements.tradeCount.textContent = tradeCount === 0
        ? 'No trades logged'
        : `${tradeCount} trade${tradeCount !== 1 ? 's' : ''} will be deleted`;
    }

    if (this.elements.achievementCount) {
      const parts = [];
      if (achievementCount > 0) parts.push(`${achievementCount} badge${achievementCount !== 1 ? 's' : ''}`);
      if (streak > 0) parts.push(`${streak}-day streak`);
      this.elements.achievementCount.textContent = parts.length > 0
        ? parts.join(' and ') + ' will be reset'
        : 'No achievements unlocked';
    }

    this.elements.modal.classList.add('open');
    this.elements.overlay?.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  close() {
    this.elements.modal?.classList.remove('open');
    this.elements.overlay?.classList.remove('open');
    document.body.style.overflow = '';
  }
}

export const clearDataModal = new ClearDataModal();
