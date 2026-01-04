/**
 * Settings - Settings panel and configuration
 */

import { state } from '../../core/state.js';
import { parseNumber, formatCurrency, formatWithCommas } from '../../core/utils.js';
import { showToast } from '../../components/ui/ui.js';
import { dataManager } from '../../core/dataManager.js';
import { clearDataModal } from '../../components/modals/clearDataModal.js';

class Settings {
  constructor() {
    this.elements = {};
  }

  init() {
    this.cacheElements();
    this.bindEvents();
    this.loadAndApply();

    // Listen for account changes
    state.on('accountSizeChanged', (size) => this.updateAccountDisplay(size));
  }

  cacheElements() {
    this.elements = {
      // Panel
      settingsPanel: document.getElementById('settingsPanel'),
      settingsOverlay: document.getElementById('settingsOverlay'),
      settingsBtn: document.getElementById('settingsBtn'),
      closeSettingsBtn: document.getElementById('closeSettingsBtn'),

      // Settings inputs
      settingsAccountSize: document.getElementById('settingsAccountSize'),
      dynamicAccountToggle: document.getElementById('dynamicAccountToggle'),
      resetAccountBtn: document.getElementById('resetAccountBtn'),

      // Journal settings
      wizardEnabledToggle: document.getElementById('wizardEnabledToggle'),
      celebrationsToggle: document.getElementById('celebrationsToggle'),
      soundToggle: document.getElementById('soundToggle'),

      // Data management buttons
      exportDataBtn: document.getElementById('exportDataBtn'),
      importDataBtn: document.getElementById('importDataBtn'),
      clearDataBtn: document.getElementById('clearDataBtn'),

      // Summary
      summaryStarting: document.getElementById('summaryStarting'),
      summaryPnL: document.getElementById('summaryPnL'),
      summaryCurrent: document.getElementById('summaryCurrent'),

      // Main calculator inputs
      accountSize: document.getElementById('accountSize'),
      maxPositionPercent: document.getElementById('maxPositionPercent'),

      // Header
      headerAccountValue: document.querySelector('.header__account-value')
    };
  }

  bindEvents() {
    // Open/close
    if (this.elements.settingsBtn) {
      this.elements.settingsBtn.addEventListener('click', () => this.open());
    }
    if (this.elements.closeSettingsBtn) {
      this.elements.closeSettingsBtn.addEventListener('click', () => this.close());
    }
    if (this.elements.settingsOverlay) {
      this.elements.settingsOverlay.addEventListener('click', () => this.close());
    }

    // Settings account size with K/M instant conversion
    if (this.elements.settingsAccountSize) {
      const syncAccountSize = (value) => {
        state.updateSettings({ startingAccountSize: value });
        state.updateAccount({ currentSize: value });
        this.updateSummary();
        // Sync to Quick Settings field
        if (this.elements.accountSize) {
          this.elements.accountSize.value = formatWithCommas(value);
        }
        this.updateAccountDisplay(value);
        state.emit('accountSizeChanged', value);
      };

      this.elements.settingsAccountSize.addEventListener('input', (e) => {
        const inputValue = e.target.value.trim();

        // Instant format when K/M notation is used
        if (inputValue && (inputValue.toLowerCase().includes('k') || inputValue.toLowerCase().includes('m'))) {
          const converted = parseNumber(inputValue);
          if (converted !== null) {
            const cursorPosition = e.target.selectionStart;
            const originalLength = e.target.value.length;
            e.target.value = formatWithCommas(converted);
            const newLength = e.target.value.length;
            const newCursorPosition = Math.max(0, cursorPosition + (newLength - originalLength));
            e.target.setSelectionRange(newCursorPosition, newCursorPosition);
            syncAccountSize(converted);
          }
        }
      });

      this.elements.settingsAccountSize.addEventListener('blur', (e) => {
        const value = parseNumber(e.target.value);
        if (value) {
          e.target.value = formatWithCommas(value);
          syncAccountSize(value);
        }
      });

      this.elements.settingsAccountSize.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const value = parseNumber(e.target.value);
          if (value) {
            e.target.value = formatWithCommas(value);
            syncAccountSize(value);
          }
          e.target.blur();
        }
      });
    }

    // Dynamic account toggle
    if (this.elements.dynamicAccountToggle) {
      this.elements.dynamicAccountToggle.addEventListener('change', (e) => {
        state.updateSettings({ dynamicAccountEnabled: e.target.checked });
      });
    }

    // Wizard enabled toggle
    if (this.elements.wizardEnabledToggle) {
      this.elements.wizardEnabledToggle.addEventListener('change', (e) => {
        state.updateJournalMetaSettings({ wizardEnabled: e.target.checked });
      });
    }

    // Celebrations toggle
    if (this.elements.celebrationsToggle) {
      this.elements.celebrationsToggle.addEventListener('change', (e) => {
        state.updateJournalMetaSettings({ celebrationsEnabled: e.target.checked });
      });
    }

    // Sound toggle
    if (this.elements.soundToggle) {
      this.elements.soundToggle.addEventListener('change', (e) => {
        state.updateJournalMetaSettings({ soundEnabled: e.target.checked });
      });
    }

    // Reset account
    if (this.elements.resetAccountBtn) {
      this.elements.resetAccountBtn.addEventListener('click', () => this.resetAccount());
    }

    // Data management buttons
    if (this.elements.exportDataBtn) {
      this.elements.exportDataBtn.addEventListener('click', () => dataManager.exportAllData());
    }
    if (this.elements.importDataBtn) {
      this.elements.importDataBtn.addEventListener('click', () => dataManager.importData());
    }
    if (this.elements.clearDataBtn) {
      this.elements.clearDataBtn.addEventListener('click', () => clearDataModal.open());
    }

    // Settings preset buttons
    if (this.elements.settingsPanel) {
      this.elements.settingsPanel.addEventListener('click', (e) => this.handlePresetClick(e));
    }
  }

  handlePresetClick(e) {
    const btn = e.target.closest('.preset-btn[data-setting]');
    if (!btn) return;

    e.preventDefault();
    e.stopPropagation();

    const setting = btn.dataset.setting;
    const value = btn.dataset.value;
    const group = btn.closest('.preset-group');

    if (!setting || !value) {
      return;
    }

    group.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    if (setting === 'defaultRisk') {
      const riskValue = parseFloat(value);
      state.updateSettings({ defaultRiskPercent: riskValue });
      // Also update current account risk to match default
      state.updateAccount({ riskPercent: riskValue });
    } else if (setting === 'defaultMaxPos') {
      const maxPosValue = parseFloat(value);
      state.updateSettings({ defaultMaxPositionPercent: maxPosValue });
      // Also update current account max position to match default
      state.updateAccount({ maxPositionPercent: maxPosValue });
      // Sync Quick Settings preset buttons
      this.syncQuickSettingsMaxPositionPresets(maxPosValue);
    } else if (setting === 'theme') {
      document.documentElement.dataset.theme = value;
      state.updateSettings({ theme: value });
      localStorage.setItem('theme', value);
    }
  }

  syncPresetButtons() {
    // Sync defaultRisk preset buttons
    const savedRisk = state.settings.defaultRiskPercent;
    document.querySelectorAll('.preset-btn[data-setting="defaultRisk"]').forEach(btn => {
      const btnValue = parseFloat(btn.dataset.value);
      btn.classList.toggle('active', btnValue === savedRisk);
    });

    // Sync defaultMaxPos preset buttons
    const savedMaxPos = state.settings.defaultMaxPositionPercent;
    document.querySelectorAll('.preset-btn[data-setting="defaultMaxPos"]').forEach(btn => {
      const btnValue = parseFloat(btn.dataset.value);
      btn.classList.toggle('active', btnValue === savedMaxPos);
    });

    // Sync theme preset buttons
    const savedTheme = state.settings.theme || 'dark';
    document.querySelectorAll('.preset-btn[data-setting="theme"]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.value === savedTheme);
    });
  }

  syncQuickSettingsMaxPositionPresets(maxPosValue) {
    // Sync Quick Settings max position preset buttons (in .settings-grid)
    const settingsGrid = document.querySelector('.settings-grid');
    if (settingsGrid) {
      const settingsItems = settingsGrid.querySelectorAll('.settings-item');
      if (settingsItems.length >= 2) {
        const maxPosItem = settingsItems[1]; // Second item is Max Position Size
        const presetGroup = maxPosItem.querySelector('.preset-group');
        if (presetGroup) {
          presetGroup.querySelectorAll('.preset-btn').forEach(btn => {
            const btnValue = parseFloat(btn.dataset.value);
            btn.classList.toggle('active', btnValue === maxPosValue);
          });
        }
      }
    }
  }

  loadAndApply() {
    // Load saved settings
    state.loadSettings();
    state.loadJournal();
    state.loadJournalMeta();

    // Migrate existing journal entries to new schema
    state.migrateJournalEntries();

    // Apply theme
    const theme = state.settings.theme || 'dark';
    document.documentElement.dataset.theme = theme;

    // Apply to settings panel
    if (this.elements.settingsAccountSize) {
      this.elements.settingsAccountSize.value = formatWithCommas(state.settings.startingAccountSize);
    }
    if (this.elements.dynamicAccountToggle) {
      this.elements.dynamicAccountToggle.checked = state.settings.dynamicAccountEnabled;
    }

    // Apply journal meta settings to toggles
    if (this.elements.wizardEnabledToggle) {
      this.elements.wizardEnabledToggle.checked = state.journalMeta.settings.wizardEnabled || false;
    }
    if (this.elements.celebrationsToggle) {
      this.elements.celebrationsToggle.checked = state.journalMeta.settings.celebrationsEnabled !== false; // Default true
    }
    if (this.elements.soundToggle) {
      this.elements.soundToggle.checked = state.journalMeta.settings.soundEnabled || false;
    }

    // Apply journal settings
    if (this.elements.wizardEnabledToggle) {
      this.elements.wizardEnabledToggle.checked = state.journalMeta.settings.wizardEnabled || false;
    }
    if (this.elements.celebrationsToggle) {
      this.elements.celebrationsToggle.checked = state.journalMeta.settings.celebrationsEnabled !== false; // Default true
    }
    if (this.elements.soundToggle) {
      this.elements.soundToggle.checked = state.journalMeta.settings.soundEnabled || false;
    }

    // Apply to main calculator
    if (this.elements.accountSize) {
      this.elements.accountSize.value = formatWithCommas(state.account.currentSize);
    }
    // Risk percent is handled by buttons, not an input field
    // Sync risk button active state (handled by calculator.syncRiskButton())
    if (this.elements.maxPositionPercent) {
      this.elements.maxPositionPercent.value = state.settings.defaultMaxPositionPercent;
    }

    // Sync preset button active states to match loaded settings
    this.syncPresetButtons();

    // Update header
    this.updateAccountDisplay(state.account.currentSize);
  }

  open() {
    this.elements.settingsPanel?.classList.add('open');
    this.elements.settingsOverlay?.classList.add('open');
    document.body.style.overflow = 'hidden';
    state.setUI('settingsOpen', true);
    this.updateSummary();
  }

  close() {
    this.elements.settingsPanel?.classList.remove('open');
    this.elements.settingsOverlay?.classList.remove('open');
    document.body.style.overflow = '';
    state.setUI('settingsOpen', false);
  }

  updateSummary() {
    const starting = state.settings.startingAccountSize;
    const pnl = state.account.realizedPnL;
    const current = starting + pnl;

    if (this.elements.summaryStarting) {
      this.elements.summaryStarting.textContent = formatCurrency(starting);
    }

    if (this.elements.summaryPnL) {
      this.elements.summaryPnL.textContent = (pnl >= 0 ? '+' : '') + formatCurrency(pnl);
      this.elements.summaryPnL.className = 'account-summary__value ' +
        (pnl >= 0 ? 'account-summary__value--success' : 'account-summary__value--danger');
    }

    if (this.elements.summaryCurrent) {
      this.elements.summaryCurrent.textContent = formatCurrency(current);
    }
  }

  updateAccountDisplay(size) {
    if (this.elements.headerAccountValue) {
      const newText = formatCurrency(size);
      if (this.elements.headerAccountValue.textContent !== newText) {
        this.elements.headerAccountValue.textContent = newText;
        this.flashHeaderAccount();
      }
    }

    if (this.elements.accountSize) {
      this.elements.accountSize.value = formatWithCommas(size);
    }
  }

  flashHeaderAccount() {
    this.elements.headerAccountValue?.classList.add('updated');
    setTimeout(() => {
      this.elements.headerAccountValue?.classList.remove('updated');
    }, 500);
  }

  resetAccount() {
    state.updateAccount({
      realizedPnL: 0,
      currentSize: state.settings.startingAccountSize
    });

    this.updateAccountDisplay(state.account.currentSize);
    this.updateSummary();

    // Emit for calculator to recalculate
    state.emit('accountSizeChanged', state.account.currentSize);

    showToast('🔄 Account reset to starting balance', 'success');
  }
}

export const settings = new Settings();
export { Settings };
