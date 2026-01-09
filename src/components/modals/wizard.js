/**
 * Trade Wizard - Guided trade logging with thesis prompts
 */

import { state } from '../../core/state.js';
import { showToast } from '../ui/ui.js';
import { formatCurrency, formatNumber, formatPercent, formatDate, createTimestampFromDateInput } from '../../core/utils.js';
import { priceTracker } from '../../core/priceTracker.js';

class TradeWizard {
  constructor() {
    this.elements = {};
    this.currentStep = 1;
    this.totalSteps = 3;
    this.skippedSteps = [];

    // Thesis data collected during wizard
    this.thesis = {
      setupType: null,
      theme: null,
      conviction: null
    };

    this.notes = '';
  }

  init() {
    this.cacheElements();
    this.bindEvents();
    this.initNotesEditor();
  }

  initNotesEditor() {
    // Auto-convert "- " to bullet points (same as journal notes)
    if (!this.elements.notesInput) return;

    this.elements.notesInput.addEventListener('input', (e) => {
      const selection = window.getSelection();
      if (!selection.rangeCount) return;

      const range = selection.getRangeAt(0);
      const textNode = range.startContainer;

      // Only work with text nodes
      if (textNode.nodeType !== Node.TEXT_NODE) return;

      const textContent = textNode.textContent;
      const cursorPos = range.startOffset;

      // Check if the text just before cursor is "- " (support both regular space and &nbsp;)
      if (cursorPos >= 2) {
        const substringToCheck = textContent.substring(cursorPos - 2, cursorPos);
        const isDash = substringToCheck[0] === '-';
        const isSpace = substringToCheck[1] === ' ' || substringToCheck[1] === '\u00A0'; // Regular space or &nbsp;

        if (isDash && isSpace) {
        const beforeDash = textContent.substring(0, cursorPos - 2);
        const afterDash = textContent.substring(cursorPos);
        const combinedText = beforeDash + afterDash;

        // Create a proper list structure
        const ul = document.createElement('ul');
        const li = document.createElement('li');

        if (combinedText) {
          li.textContent = combinedText;
        } else {
          li.innerHTML = '<br>';
        }

        ul.appendChild(li);

        // Replace content with list
        const parent = textNode.parentNode;
        if (parent === this.elements.notesInput) {
          this.elements.notesInput.replaceChild(ul, textNode);
        } else {
          parent.parentNode.replaceChild(ul, parent);
        }

        // Set cursor in the li
        const newRange = document.createRange();
        const newSelection = window.getSelection();

        if (li.firstChild) {
          newRange.setStart(li.firstChild, combinedText.length);
        } else {
          newRange.setStart(li, 0);
        }

        newRange.collapse(true);
        newSelection.removeAllRanges();
        newSelection.addRange(newRange);
        }
      }
    });
  }

  cacheElements() {
    this.elements = {
      // Modal
      modal: document.getElementById('wizardModal'),
      overlay: document.getElementById('wizardModalOverlay'),
      closeBtn: document.getElementById('closeWizardBtn'),

      // Progress
      progressSteps: document.querySelectorAll('.wizard-progress__step'),
      connectors: document.querySelectorAll('.wizard-progress__connector'),

      // Steps
      steps: document.querySelectorAll('.wizard-step'),

      // Step 1 - Trade Details
      wizardTicker: document.getElementById('wizardTicker'),
      wizardEntryPrice: document.getElementById('wizardEntryPrice'),
      wizardStopLoss: document.getElementById('wizardStopLoss'),
      wizardShares: document.getElementById('wizardShares'),
      wizardTargetPrice: document.getElementById('wizardTargetPrice'),
      wizardTradeDate: document.getElementById('wizardTradeDate'),
      cancel1Btn: document.getElementById('wizardCancel1'),
      next1Btn: document.getElementById('wizardNext1'),

      // Step 2 - Thesis
      setupBtns: document.querySelectorAll('[data-setup]'),
      themeInput: document.getElementById('wizardTheme'),
      convictionStars: document.querySelectorAll('.wizard-star'),
      notesInput: document.getElementById('wizardNotes'),
      cancel2Btn: document.getElementById('wizardCancel2'),
      back2Btn: document.getElementById('wizardBack2'),
      skip2Btn: document.getElementById('wizardSkip2'),
      next2Btn: document.getElementById('wizardNext2'),

      // Step 3 - Confirmation
      confirmTicker: document.getElementById('wizardConfirmTicker'),
      confirmPosition: document.getElementById('wizardConfirmPosition'),
      confirmRisk: document.getElementById('wizardConfirmRisk'),
      confirmDate: document.getElementById('wizardConfirmDate'),
      confirmSetupRow: document.getElementById('wizardConfirmSetupRow'),
      confirmSetup: document.getElementById('wizardConfirmSetup'),
      confirmThemeRow: document.getElementById('wizardConfirmThemeRow'),
      confirmTheme: document.getElementById('wizardConfirmTheme'),
      streakDisplay: document.getElementById('wizardStreakDisplay'),
      streakText: document.getElementById('wizardStreakText'),
      cancelBtn: document.getElementById('wizardCancel'),
      back3Btn: document.getElementById('wizardBack3'),
      confirmBtn: document.getElementById('wizardConfirmBtn'),

      // Confetti
      confettiCanvas: document.getElementById('confettiCanvas')
    };
  }

  bindEvents() {
    // Close modal
    this.elements.closeBtn?.addEventListener('click', () => this.close());
    this.elements.overlay?.addEventListener('click', () => this.close());

    // Keyboard
    document.addEventListener('keydown', (e) => {
      if (!this.isOpen()) return;
      if (e.key === 'Escape') this.close();
      if (e.key === 'Enter' && !e.shiftKey) {
        // Don't trigger next step if user is typing in the notes editor
        const isInNotesEditor = e.target.closest('.wizard-notes-editable');
        if (isInNotesEditor) return;

        e.preventDefault();
        this.nextStep();
      }
    });

    // Step 1 buttons - validate all fields before proceeding
    this.elements.cancel1Btn?.addEventListener('click', () => this.close());
    this.elements.next1Btn?.addEventListener('click', async () => {
      if (await this.validateStep1()) {
        this.goToStep(2);
      }
    });

    // Step 2 buttons
    this.elements.cancel2Btn?.addEventListener('click', () => this.close());
    this.elements.back2Btn?.addEventListener('click', () => this.goToStep(1));
    this.elements.next2Btn?.addEventListener('click', () => this.goToStep(3));

    // Step 3 buttons
    this.elements.cancelBtn?.addEventListener('click', () => this.close());
    this.elements.back3Btn?.addEventListener('click', () => this.goToStep(2));
    this.elements.confirmBtn?.addEventListener('click', () => this.confirmTrade());

    // Setup type buttons
    this.elements.setupBtns?.forEach(btn => {
      btn.addEventListener('click', () => {
        this.elements.setupBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.thesis.setupType = btn.dataset.setup;
      });
    });

    // Conviction stars
    this.elements.convictionStars?.forEach(star => {
      star.addEventListener('click', () => {
        const level = parseInt(star.dataset.conviction);
        this.thesis.conviction = level;
        this.elements.convictionStars.forEach((s, i) => {
          s.classList.toggle('active', i < level);
        });
      });
    });

    // Ticker input - update state and UI as user types
    this.elements.wizardTicker?.addEventListener('input', () => {
      const ticker = this.elements.wizardTicker.value.toUpperCase();
      this.elements.wizardTicker.value = ticker; // Force uppercase
      // Update state so it persists
      state.updateTrade({ ticker });
    });

    // Entry, stop, shares, target inputs - update state as user types
    this.elements.wizardEntryPrice?.addEventListener('input', () => {
      const entry = parseFloat(this.elements.wizardEntryPrice.value) || 0;
      state.updateTrade({ entry });
    });
    this.elements.wizardStopLoss?.addEventListener('input', () => {
      const stop = parseFloat(this.elements.wizardStopLoss.value) || 0;
      state.updateTrade({ stop });
    });
    this.elements.wizardTargetPrice?.addEventListener('input', () => {
      const target = parseFloat(this.elements.wizardTargetPrice.value) || 0;
      state.updateTrade({ target });
    });
  }

  isOpen() {
    return this.elements.modal?.classList.contains('open');
  }

  open() {
    if (!this.elements.modal) return;

    // Reset state
    this.currentStep = 1;
    this.skippedSteps = [];
    this.thesis = {
      setupType: null,
      theme: null,
      conviction: null
    };
    this.notes = '';

    // Reset UI
    this.resetForm();

    // Set trade date to today
    if (this.elements.wizardTradeDate) {
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      this.elements.wizardTradeDate.value = `${year}-${month}-${day}`;
    }

    // Pre-fill from calculator
    this.prefillFromCalculator();

    // Show modal
    this.elements.modal.classList.add('open');
    this.elements.overlay?.classList.add('open');
    document.body.style.overflow = 'hidden';

    // Show step 1
    this.showStep(1);
  }

  close() {
    this.elements.modal?.classList.remove('open');
    this.elements.overlay?.classList.remove('open');
    document.body.style.overflow = '';
    this.resetForm();

    // Clear calculator state so values don't persist when reopening
    state.updateTrade({
      ticker: '',
      entry: null,
      stop: null,
      target: null
    });
    state.updateResults({
      shares: 0,
      positionSize: 0,
      riskDollars: 0
    });
  }

  resetForm() {
    // Reset Step 1 inputs
    if (this.elements.wizardTicker) this.elements.wizardTicker.value = '';
    if (this.elements.wizardEntryPrice) this.elements.wizardEntryPrice.value = '';
    if (this.elements.wizardStopLoss) this.elements.wizardStopLoss.value = '';
    if (this.elements.wizardShares) this.elements.wizardShares.value = '';
    if (this.elements.wizardTargetPrice) this.elements.wizardTargetPrice.value = '';
    // Date will be auto-set in open() method

    // Reset Step 2 buttons
    this.elements.setupBtns?.forEach(b => b.classList.remove('active'));
    this.elements.convictionStars?.forEach(s => s.classList.remove('active'));

    // Reset Step 2 inputs
    if (this.elements.themeInput) this.elements.themeInput.value = '';

    // Reset notes editor
    if (this.elements.notesInput) {
      this.elements.notesInput.innerHTML = '';
    }
    this.notes = '';

    // Reset progress
    this.elements.progressSteps?.forEach(step => {
      step.classList.remove('active', 'completed');
    });
    this.elements.progressSteps?.[0]?.classList.add('active');
  }

  updateTickerHint() {
    // No longer needed with new input structure
  }

  async validateStep1() {
    // Get all field values
    const ticker = this.elements.wizardTicker?.value.trim() || '';
    const entryPrice = parseFloat(this.elements.wizardEntryPrice?.value);
    const stopPrice = parseFloat(this.elements.wizardStopLoss?.value);
    const shares = parseInt(this.elements.wizardShares?.value);
    const targetPrice = this.elements.wizardTargetPrice?.value.trim();
    const tradeDate = this.elements.wizardTradeDate?.value;

    // Validate ticker (required)
    if (!ticker) {
      showToast('❌ Ticker is required', 'error');
      this.elements.wizardTicker?.focus();
      return false;
    }

    // Validate ticker with API if available
    if (priceTracker.apiKey) {
      try {
        showToast('🔍 Validating ticker...', 'info');
        await priceTracker.fetchPrice(ticker);
      } catch (error) {
        if (error.message.includes('Invalid ticker')) {
          showToast(`❌ Invalid ticker: ${ticker}`, 'error');
        } else {
          showToast(`❌ Failed to validate ticker: ${error.message}`, 'error');
        }
        this.elements.wizardTicker?.focus();
        return false;
      }
    }

    // Validate entry price (required)
    if (!entryPrice || isNaN(entryPrice) || entryPrice <= 0) {
      showToast('❌ Entry price must be a valid number greater than 0', 'error');
      this.elements.wizardEntryPrice?.focus();
      return false;
    }

    // Validate stop loss (required)
    if (!stopPrice || isNaN(stopPrice) || stopPrice <= 0) {
      showToast('❌ Stop loss must be a valid number greater than 0', 'error');
      this.elements.wizardStopLoss?.focus();
      return false;
    }

    // Validate shares (required)
    if (!shares || isNaN(shares) || shares <= 0) {
      showToast('❌ Shares must be a valid number greater than 0', 'error');
      this.elements.wizardShares?.focus();
      return false;
    }

    // Validate target price if provided
    if (targetPrice && targetPrice.length > 0) {
      const target = parseFloat(targetPrice);
      if (isNaN(target) || target <= 0) {
        showToast('❌ Target price must be a valid number greater than 0', 'error');
        this.elements.wizardTargetPrice?.focus();
        return false;
      }
    }

    // Validate date (required)
    if (!tradeDate) {
      showToast('❌ Trade date is required', 'error');
      this.elements.wizardTradeDate?.focus();
      return false;
    }

    return true;
  }

  prefillFromCalculator() {
    const trade = state.trade;
    const results = state.results;
    const account = state.account;

    // Step 1 - Fill input fields from calculator
    if (this.elements.wizardTicker) {
      this.elements.wizardTicker.value = trade.ticker || '';
    }
    if (this.elements.wizardEntryPrice) {
      this.elements.wizardEntryPrice.value = trade.entry || '';
    }
    if (this.elements.wizardStopLoss) {
      this.elements.wizardStopLoss.value = trade.stop || '';
    }
    if (this.elements.wizardShares) {
      this.elements.wizardShares.value = results.shares || '';
    }
    if (this.elements.wizardTargetPrice) {
      this.elements.wizardTargetPrice.value = trade.target || '';
    }

    // Step 2 notes - pre-fill from Quick Note
    const quickNoteEl = document.getElementById('tradeNotes');
    if (this.elements.notesInput && quickNoteEl) {
      const quickNoteContent = quickNoteEl.innerHTML.trim();
      if (quickNoteContent) {
        this.elements.notesInput.innerHTML = quickNoteContent;
      }
    }

    // Step 3 confirmation - will be updated in updateConfirmation()
    if (this.elements.confirmTicker) {
      this.elements.confirmTicker.textContent = trade.ticker || 'No Ticker';
    }
    if (this.elements.confirmPosition) {
      this.elements.confirmPosition.textContent =
        `${formatNumber(results.shares || 0)} shares @ ${formatCurrency(trade.entry || 0)}`;
    }
    if (this.elements.confirmRisk) {
      this.elements.confirmRisk.textContent =
        `${formatCurrency(results.riskDollars || 0)} (${formatPercent(account.riskPercent || 0)})`;
    }
    if (this.elements.confirmDate) {
      // Get trade date from calculator or use today
      const tradeDateInput = document.getElementById('tradeDate');
      const tradeDate = tradeDateInput?.value || new Date().toISOString().split('T')[0];
      const timestamp = createTimestampFromDateInput(tradeDate);
      const formattedDate = formatDate(timestamp, { year: 'numeric' });
      this.elements.confirmDate.textContent = formattedDate;
    }
  }

  showStep(step) {
    this.currentStep = step;

    // Update steps visibility
    this.elements.steps?.forEach((stepEl, i) => {
      const stepNum = i + 1;
      stepEl.classList.remove('active', 'exit-left');
      if (stepNum === step) {
        stepEl.classList.add('active');
      }
    });

    // Update progress indicators
    this.elements.progressSteps?.forEach((progressStep, i) => {
      const stepNum = i + 1;
      progressStep.classList.remove('active', 'completed');
      if (stepNum < step) {
        progressStep.classList.add('completed');
      } else if (stepNum === step) {
        progressStep.classList.add('active');
      }
    });

    // Update confirmation on step 3
    if (step === 3) {
      this.updateConfirmation();
    }
  }

  goToStep(step) {
    if (step < 1 || step > this.totalSteps) return;

    // Collect data before leaving current step
    this.collectStepData();

    this.showStep(step);
  }

  nextStep() {
    if (this.currentStep < this.totalSteps) {
      this.goToStep(this.currentStep + 1);
    } else {
      this.confirmTrade();
    }
  }

  skipStep(step) {
    if (!this.skippedSteps.includes(step)) {
      this.skippedSteps.push(step);
    }
    this.goToStep(step + 1);
  }

  async skipAll() {
    // Direct save without wizard
    await this.logTrade(false);
    this.close();
  }

  collectStepData() {
    // Step 2 - Thesis
    if (this.currentStep === 2) {
      this.thesis.theme = this.elements.themeInput?.value.trim() || null;
      // Get notes from contenteditable div (store as HTML for formatting)
      if (this.elements.notesInput) {
        this.notes = this.elements.notesInput.innerHTML.trim() || '';
      }
    }
  }

  updateConfirmation() {
    // Get values from wizard inputs
    const ticker = this.elements.wizardTicker?.value.trim() || '';
    const entry = parseFloat(this.elements.wizardEntryPrice?.value) || 0;
    const shares = parseInt(this.elements.wizardShares?.value) || 0;
    const riskPerShare = entry - (parseFloat(this.elements.wizardStopLoss?.value) || 0);
    const riskDollars = shares * riskPerShare;
    const riskPercent = (riskDollars / state.account.currentSize) * 100;

    // Update ticker display
    if (this.elements.confirmTicker) {
      this.elements.confirmTicker.textContent = ticker || 'No Ticker';
      this.elements.confirmTicker.classList.toggle('wizard-confirmation__ticker--empty', !ticker);
    }

    // Update position display
    if (this.elements.confirmPosition) {
      this.elements.confirmPosition.textContent = `${formatNumber(shares)} shares @ ${formatCurrency(entry)}`;
    }

    // Update risk display
    if (this.elements.confirmRisk) {
      this.elements.confirmRisk.textContent = `${formatCurrency(riskDollars)} (${formatPercent(riskPercent)})`;
    }

    // Update date display
    if (this.elements.confirmDate) {
      const tradeDate = this.elements.wizardTradeDate?.value || new Date().toISOString().split('T')[0];
      const timestamp = createTimestampFromDateInput(tradeDate);
      const formattedDate = formatDate(timestamp, { year: 'numeric' });
      this.elements.confirmDate.textContent = formattedDate;
    }

    // Update setup row
    if (this.thesis.setupType) {
      this.elements.confirmSetupRow.style.display = 'flex';
      this.elements.confirmSetup.textContent = this.thesis.setupType.toUpperCase();
    } else {
      this.elements.confirmSetupRow.style.display = 'none';
    }

    // Update theme row
    if (this.thesis.theme) {
      this.elements.confirmThemeRow.style.display = 'flex';
      this.elements.confirmTheme.textContent = this.thesis.theme;
    } else {
      this.elements.confirmThemeRow.style.display = 'none';
    }

    // Show streak preview
    const progress = state.journalMeta.achievements.progress;
    const today = new Date().toDateString();
    const lastDate = progress.lastTradeDate ? new Date(progress.lastTradeDate).toDateString() : null;

    if (lastDate !== today && progress.currentStreak > 0) {
      // Will extend streak
      this.elements.streakDisplay.style.display = 'flex';
      this.elements.streakText.textContent = `${progress.currentStreak + 1} day streak!`;
    } else if (!lastDate) {
      // First trade ever
      this.elements.streakDisplay.style.display = 'flex';
      this.elements.streakText.textContent = 'Start your streak!';
    } else {
      this.elements.streakDisplay.style.display = 'none';
    }
  }

  async confirmTrade() {
    this.collectStepData();
    await this.logTrade(true);
    this.close();
  }

  async logTrade(wizardComplete = false) {
    // Get values from wizard inputs
    const ticker = this.elements.wizardTicker?.value.trim() || '';
    const entryPrice = parseFloat(this.elements.wizardEntryPrice?.value) || 0;
    const stopPrice = parseFloat(this.elements.wizardStopLoss?.value) || 0;
    const targetPrice = parseFloat(this.elements.wizardTargetPrice?.value) || 0;
    const shares = parseInt(this.elements.wizardShares?.value) || 0;
    const tradeDate = this.elements.wizardTradeDate?.value || new Date().toISOString().split('T')[0];

    // Calculate derived values
    const riskPerShare = entryPrice - stopPrice;
    const positionSize = shares * entryPrice;
    const riskDollars = shares * riskPerShare;
    const riskPercent = (riskDollars / state.account.currentSize) * 100;
    const stopDistance = riskPerShare;

    // Validate ticker and fetch company data if API key is configured
    let companyData = null;
    if (priceTracker.apiKey && ticker) {
      try {
        // Show loading toast
        showToast('🔍 Validating ticker...', 'info');

        // Fetch price to validate ticker and company profile in parallel
        const [priceData, profileData] = await Promise.all([
          priceTracker.fetchPrice(ticker),
          priceTracker.fetchCompanyProfile(ticker)
        ]);

        companyData = profileData;
        if (companyData) {
          console.log('[Wizard] Company data fetched:', companyData);
        }
      } catch (error) {
        // If error contains "Invalid ticker", show specific error
        if (error.message.includes('Invalid ticker')) {
          showToast(`❌ ${error.message}`, 'error');
        } else {
          showToast(`❌ Failed to validate ticker: ${error.message}`, 'error');
        }
        return;
      }
    }

    // Get timestamp from trade date
    const timestamp = createTimestampFromDateInput(tradeDate);

    // Build journal entry
    const journalEntry = {
      timestamp,
      ticker,
      entry: entryPrice,
      stop: stopPrice,
      originalStop: stopPrice,
      currentStop: stopPrice,
      target: targetPrice || null,
      shares,
      positionSize,
      riskDollars,
      riskPercent,
      stopDistance,
      notes: this.notes || '',
      status: 'open',

      // Thesis data
      thesis: this.hasThesisData() ? { ...this.thesis } : null,
      wizardComplete,
      wizardSkipped: [...this.skippedSteps],

      // Company data (fetched during validation)
      company: companyData || null
    };

    // Add to journal
    const newEntry = state.addJournalEntry(journalEntry);

    // Update progress
    const progress = state.journalMeta.achievements.progress;
    progress.totalTrades++;

    if (this.notes) {
      progress.tradesWithNotes++;
    }
    if (this.hasThesisData()) {
      progress.tradesWithThesis++;
    }
    if (wizardComplete && this.skippedSteps.length === 0) {
      progress.completeWizardCount++;
    }

    // Update streak
    state.updateStreak();

    // Save progress
    state.saveJournalMeta();

    // Trigger events for achievements/celebrations
    state.emit('tradeLogged', {
      entry: newEntry,
      wizardComplete,
      thesis: this.thesis
    });

    // Show success toast
    this.showSuccessToast();

    // Trigger confetti if celebrations enabled
    if (state.journalMeta.settings.celebrationsEnabled) {
      state.emit('triggerConfetti');
    }
  }

  hasThesisData() {
    return this.thesis.setupType ||
           this.thesis.theme ||
           this.thesis.conviction;
  }

  showSuccessToast() {
    const messages = [
      "✅ Trade logged! Good luck!",
      "🎯 Nice setup! Tracked.",
      "🔥 You're on a roll! Trade saved.",
      "📝 Disciplined trader! Logged.",
      "✅ Trade captured! Let's go!"
    ];
    const message = messages[Math.floor(Math.random() * messages.length)];
    showToast(message, 'success');
  }
}

export const wizard = new TradeWizard();
export { TradeWizard };
