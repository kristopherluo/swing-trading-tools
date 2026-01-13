/**
 * Trade Wizard - Guided trade logging with thesis prompts
 */

import { state } from '../../core/state.js';
import { showToast } from '../ui/ui.js';
import { formatCurrency, formatNumber, formatPercent, formatDate, createTimestampFromDateInput, initFlatpickr, getCurrentWeekday, restrictToNumberInput } from '../../core/utils.js';
import { priceTracker } from '../../core/priceTracker.js';

class TradeWizard {
  constructor() {
    this.elements = {};
    this.currentStep = 1;
    this.totalSteps = 3;
    this.skippedSteps = [];
    this.updatingProgrammatically = false;

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
    this.setupNumberRestrictions();
    this.initNotesEditor();
    this.disableWeekends();
  }

  setupNumberRestrictions() {
    // Restrict numeric inputs to numbers and decimals only
    restrictToNumberInput(this.elements.wizardEntryPrice, true);
    restrictToNumberInput(this.elements.wizardStopLoss, true);
    restrictToNumberInput(this.elements.wizardShares, false); // Integer only
    restrictToNumberInput(this.elements.wizardRiskDollar, true);
    restrictToNumberInput(this.elements.wizardTargetPrice, true);
  }

  disableWeekends() {
    // Initialize trade date with default to current weekday (or last Friday if weekend)
    const today = getCurrentWeekday();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const dateString = `${year}-${month}-${day}`;

    initFlatpickr(this.elements.wizardTradeDate, {
      defaultDate: dateString
    });

    // Explicitly set the date to ensure it shows in the visible field
    if (this.elements.wizardTradeDate?._flatpickr) {
      this.elements.wizardTradeDate._flatpickr.setDate(dateString, false);
    }
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
      wizardTickerStatus: document.getElementById('wizardTickerStatus'),
      wizardEntryPrice: document.getElementById('wizardEntryPrice'),
      wizardStopLoss: document.getElementById('wizardStopLoss'),
      wizardShares: document.getElementById('wizardShares'),
      wizardTargetPrice: document.getElementById('wizardTargetPrice'),
      wizardRMultipleGroup: document.getElementById('wizardRMultipleGroup'),
      wizardRMultipleBtns: document.querySelectorAll('#wizardRMultipleGroup .preset-btn'),
      wizardRiskPercentGroup: document.getElementById('wizardRiskPercentGroup'),
      wizardRiskPercentBtns: document.querySelectorAll('#wizardRiskPercentGroup .preset-btn'),
      wizardRiskDollar: document.getElementById('wizardRiskDollar'),
      wizardRiskPercentDisplay: document.getElementById('wizardRiskPercentDisplay'),
      wizardRDisplay: document.getElementById('wizardRDisplay'),
      wizardTradeDate: document.getElementById('wizardTradeDate'),
      cancel1Btn: document.getElementById('wizardCancel1'),
      next1Btn: document.getElementById('wizardNext1'),

      // Step 1 - Error elements
      wizardTickerError: document.getElementById('wizardTickerError'),
      wizardEntryPriceError: document.getElementById('wizardEntryPriceError'),
      wizardStopLossError: document.getElementById('wizardStopLossError'),
      wizardSharesError: document.getElementById('wizardSharesError'),
      wizardRiskDollarError: document.getElementById('wizardRiskDollarError'),
      wizardTargetPriceError: document.getElementById('wizardTargetPriceError'),
      wizardTradeDateError: document.getElementById('wizardTradeDateError'),

      // Step 2 - Thesis
      setupBtns: document.querySelectorAll('[data-setup]'),
      themeInput: document.getElementById('wizardTheme'),
      convictionStars: document.querySelectorAll('.wizard-star'),
      notesInput: document.getElementById('wizardNotes'),
      cancel2Btn: document.getElementById('wizardCancel2'),
      back2Btn: document.getElementById('wizardBack2'),
      skip2Btn: document.getElementById('wizardSkip2'),
      next2Btn: document.getElementById('wizardNext2'),

      // Step 2 - Error elements
      wizardSetupTypeError: document.getElementById('wizardSetupTypeError'),

      // Step 3 - Confirmation
      confirmTicker: document.getElementById('wizardConfirmTicker'),
      confirmPosition: document.getElementById('wizardConfirmPosition'),
      confirmRisk: document.getElementById('wizardConfirmRisk'),
      confirmPositionSize: document.getElementById('wizardConfirmPositionSize'),
      confirmDate: document.getElementById('wizardConfirmDate'),
      confirmSetupRow: document.getElementById('wizardConfirmSetupRow'),
      confirmSetup: document.getElementById('wizardConfirmSetup'),
      confirmThemeRow: document.getElementById('wizardConfirmThemeRow'),
      confirmTheme: document.getElementById('wizardConfirmTheme'),
      cancelBtn: document.getElementById('wizardCancel'),
      back3Btn: document.getElementById('wizardBack3'),
      confirmBtn: document.getElementById('wizardConfirmBtn')
    };
  }

  bindEvents() {
    // Close modal
    this.elements.closeBtn?.addEventListener('click', () => this.close());
    this.elements.overlay?.addEventListener('click', () => this.close());

    // Keyboard
    document.addEventListener('keydown', async (e) => {
      if (!this.isOpen()) return;
      if (e.key === 'Escape') this.close();
      if (e.key === 'Enter' && !e.shiftKey) {
        // Don't trigger next step if user is typing in the notes editor
        const isInNotesEditor = e.target.closest('.wizard-notes-editable');
        if (isInNotesEditor) return;

        e.preventDefault();

        // Validate step 1 before advancing
        if (this.currentStep === 1) {
          if (await this.validateStep1()) {
            this.goToStep(2);
          }
        } else {
          this.nextStep();
        }
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
    this.elements.next2Btn?.addEventListener('click', () => {
      if (this.validateStep2()) {
        this.goToStep(3);
      }
    });

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

        // Clear error when a type is selected
        if (this.elements.wizardSetupTypeError) {
          this.elements.wizardSetupTypeError.textContent = '';
          this.elements.wizardSetupTypeError.classList.remove('input-error--visible');
        }
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

    // Ticker blur - validate ticker when user leaves the field
    this.elements.wizardTicker?.addEventListener('blur', async () => {
      await this.validateTickerOnBlur();
    });

    // Entry, stop, shares, target inputs - sanitize and validate as user types
    this.elements.wizardEntryPrice?.addEventListener('input', (e) => this.sanitizeEntryPriceInput(e));
    this.elements.wizardStopLoss?.addEventListener('input', (e) => this.sanitizeStopLossInput(e));
    this.elements.wizardShares?.addEventListener('input', (e) => this.sanitizeSharesInput(e));
    this.elements.wizardTargetPrice?.addEventListener('input', (e) => this.sanitizeTargetPriceInput(e));
    this.elements.wizardRiskDollar?.addEventListener('input', (e) => this.sanitizeRiskDollarInput(e));

    // R-Multiple buttons
    this.elements.wizardRMultipleBtns?.forEach(btn => {
      btn.addEventListener('click', () => {
        const rMultiple = parseFloat(btn.dataset.r);

        // Remove active class from all buttons
        this.elements.wizardRMultipleBtns.forEach(b => b.classList.remove('active'));

        // Add active class to clicked button
        btn.classList.add('active');

        this.setTargetFromRMultiple(rMultiple);
      });
    });

    // Risk percent buttons
    this.elements.wizardRiskPercentBtns?.forEach(btn => {
      btn.addEventListener('click', () => {
        const riskPercent = parseFloat(btn.dataset.risk);

        // Remove active class from all buttons
        this.elements.wizardRiskPercentBtns.forEach(b => b.classList.remove('active'));

        // Add active class to clicked button
        btn.classList.add('active');

        this.setSharesFromRiskPercent(riskPercent);
      });
    });

    // Risk dollar input
    this.elements.wizardRiskDollar?.addEventListener('input', () => {
      this.handleCustomRiskDollar();
    });

    // Clear errors on input
    this.elements.wizardTicker?.addEventListener('input', () => {
      this.clearInputError(this.elements.wizardTicker, this.elements.wizardTickerError);
      this.hideTickerStatus(); // Also hide validation status icons
    });
    this.elements.wizardTradeDate?.addEventListener('change', () => {
      this.clearInputError(this.elements.wizardTradeDate, this.elements.wizardTradeDateError);
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
    this.clearAllErrors();

    // Set trade date to today using Flatpickr API
    if (this.elements.wizardTradeDate?._flatpickr) {
      const today = getCurrentWeekday();
      // Format date as YYYY-MM-DD string for flatpickr
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      const dateString = `${year}-${month}-${day}`;

      this.elements.wizardTradeDate._flatpickr.setDate(dateString, false);
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
    // Clear all previous errors
    this.clearAllErrors();

    // Get all field values
    const ticker = this.elements.wizardTicker?.value.trim() || '';
    const entryPrice = parseFloat(this.elements.wizardEntryPrice?.value);
    const stopPrice = parseFloat(this.elements.wizardStopLoss?.value);
    const shares = parseInt(this.elements.wizardShares?.value);
    const targetPrice = this.elements.wizardTargetPrice?.value.trim();
    const tradeDate = this.elements.wizardTradeDate?.value;

    // Validate ticker (required)
    if (!ticker) {
      this.showInputError(
        this.elements.wizardTicker,
        this.elements.wizardTickerError,
        'Ticker is required'
      );
      return false;
    }

    // Validate ticker with API if available
    if (priceTracker.apiKey) {
      try {
        await priceTracker.fetchPrice(ticker);
      } catch (error) {
        const errorMsg = error.message.includes('Invalid ticker')
          ? `Invalid ticker: ${ticker}`
          : `Failed to validate ticker: ${error.message}`;
        this.showInputError(
          this.elements.wizardTicker,
          this.elements.wizardTickerError,
          errorMsg
        );
        return false;
      }
    }

    // Validate entry price (required)
    if (!entryPrice || isNaN(entryPrice) || entryPrice <= 0) {
      this.showInputError(
        this.elements.wizardEntryPrice,
        this.elements.wizardEntryPriceError,
        'Entry price must be greater than 0'
      );
      return false;
    }

    // Validate stop loss (required)
    if (!stopPrice || isNaN(stopPrice) || stopPrice <= 0) {
      this.showInputError(
        this.elements.wizardStopLoss,
        this.elements.wizardStopLossError,
        'Stop loss must be greater than 0'
      );
      return false;
    }

    // Validate shares (required)
    if (!shares || isNaN(shares) || shares <= 0) {
      this.showInputError(
        this.elements.wizardShares,
        this.elements.wizardSharesError,
        'Shares must be greater than 0'
      );
      return false;
    }

    // Validate risk dollar if provided
    const riskDollar = this.elements.wizardRiskDollar?.value.trim();
    if (riskDollar && riskDollar.length > 0) {
      const risk = parseFloat(riskDollar);
      if (isNaN(risk) || risk <= 0) {
        this.showInputError(
          this.elements.wizardRiskDollar,
          this.elements.wizardRiskDollarError,
          'Risk must be greater than 0'
        );
        return false;
      }
    }

    // Validate target price if provided
    if (targetPrice && targetPrice.length > 0) {
      const target = parseFloat(targetPrice);
      if (isNaN(target) || target <= 0) {
        this.showInputError(
          this.elements.wizardTargetPrice,
          this.elements.wizardTargetPriceError,
          'Target price must be greater than 0'
        );
        return false;
      }
      // Ensure target is greater than entry
      if (target <= entryPrice) {
        this.showInputError(
          this.elements.wizardTargetPrice,
          this.elements.wizardTargetPriceError,
          'Target price must be greater than entry price'
        );
        return false;
      }
    }

    // Validate date (required)
    if (!tradeDate) {
      this.showInputError(
        this.elements.wizardTradeDate,
        this.elements.wizardTradeDateError,
        'Trade date is required'
      );
      this.elements.wizardTradeDate?.focus();
      return false;
    }

    return true;
  }

  validateStep2() {
    // Clear previous error
    if (this.elements.wizardSetupTypeError) {
      this.elements.wizardSetupTypeError.textContent = '';
      this.elements.wizardSetupTypeError.classList.remove('input-error--visible');
    }

    // Check if setup type is selected
    if (!this.thesis.setupType) {
      this.showInputError(
        null,
        this.elements.wizardSetupTypeError,
        'Please select a setup type'
      );
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
    if (this.elements.confirmPositionSize) {
      const positionSize = (trade.entry || 0) * (results.shares || 0);
      const positionPercent = (positionSize / account.currentSize) * 100;
      this.elements.confirmPositionSize.textContent =
        `${formatCurrency(positionSize)} (${formatPercent(positionPercent)})`;
    }
    if (this.elements.confirmDate) {
      // Get trade date from calculator or use today
      const tradeDateInput = document.getElementById('tradeDate');
      const tradeDate = tradeDateInput?.value || new Date().toISOString().split('T')[0];
      const timestamp = createTimestampFromDateInput(tradeDate);
      const formattedDate = formatDate(timestamp, { year: 'numeric' });
      this.elements.confirmDate.textContent = formattedDate;
    }

    // Update R-Multiple buttons state after pre-filling
    this.updateRMultipleButtons();

    // Update risk buttons and display
    this.updateRiskButtons();
    this.updateRiskDisplay();
    this.updateTargetRDisplay();

    // Auto-select 5R if buttons are enabled (only need entry and stop)
    if (this.elements.wizardRMultipleBtns && this.elements.wizardRMultipleBtns.length > 0) {
      const entry = parseFloat(this.elements.wizardEntryPrice?.value) || 0;
      const stop = parseFloat(this.elements.wizardStopLoss?.value) || 0;

      if (entry > 0 && stop > 0 && entry !== stop) {
        // Auto-select 5R button
        const fiveRBtn = Array.from(this.elements.wizardRMultipleBtns).find(btn => btn.dataset.r === '5');
        if (fiveRBtn) {
          this.elements.wizardRMultipleBtns.forEach(b => b.classList.remove('active'));
          fiveRBtn.classList.add('active');
          this.setTargetFromRMultiple(5);
        }
      }
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

    // Update position size display
    if (this.elements.confirmPositionSize) {
      const positionSize = entry * shares;
      const positionPercent = (positionSize / state.account.currentSize) * 100;
      this.elements.confirmPositionSize.textContent = `${formatCurrency(positionSize)} (${formatPercent(positionPercent)})`;
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
      if (this.elements.confirmSetupRow) {
        this.elements.confirmSetupRow.style.display = 'flex';
      }
      if (this.elements.confirmSetup) {
        this.elements.confirmSetup.textContent = this.thesis.setupType.toUpperCase();
      }
    } else {
      if (this.elements.confirmSetupRow) {
        this.elements.confirmSetupRow.style.display = 'none';
      }
    }

    // Update theme row
    if (this.thesis.theme) {
      if (this.elements.confirmThemeRow) {
        this.elements.confirmThemeRow.style.display = 'flex';
      }
      if (this.elements.confirmTheme) {
        this.elements.confirmTheme.textContent = this.thesis.theme;
      }
    } else {
      if (this.elements.confirmThemeRow) {
        this.elements.confirmThemeRow.style.display = 'none';
      }
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

    // Get trade date from flatpickr instance if available, otherwise from input value
    let tradeDate;
    if (this.elements.wizardTradeDate?._flatpickr && this.elements.wizardTradeDate._flatpickr.selectedDates.length > 0) {
      const selectedDate = this.elements.wizardTradeDate._flatpickr.selectedDates[0];
      const year = selectedDate.getFullYear();
      const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const day = String(selectedDate.getDate()).padStart(2, '0');
      tradeDate = `${year}-${month}-${day}`;
    } else {
      tradeDate = this.elements.wizardTradeDate?.value || new Date().toISOString().split('T')[0];
    }

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
        // Fetch price to validate ticker and company profile in parallel
        const [priceData, profileData] = await Promise.all([
          priceTracker.fetchPrice(ticker),
          priceTracker.fetchCompanyProfile(ticker)
        ]);

        companyData = profileData;
      } catch (error) {
        // Only block trade if it's definitely an invalid ticker
        if (error.message.includes('Invalid ticker symbol')) {
          // Silent validation - no toast
          return;
        }

        // For API errors (rate limits, network issues), log trade anyway - silent
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

    // Save changes
    state.saveJournalMeta();

    // Success toast removed - silent save
  }

  hasThesisData() {
    return this.thesis.setupType ||
           this.thesis.theme ||
           this.thesis.conviction;
  }

  updateRMultipleButtons() {
    if (!this.elements.wizardRMultipleBtns) return;

    const entry = parseFloat(this.elements.wizardEntryPrice?.value) || 0;
    const stop = parseFloat(this.elements.wizardStopLoss?.value) || 0;

    // Only need entry and stop to calculate target price (R-Multiple)
    const canCalculate = entry > 0 && stop > 0 && entry !== stop;

    this.elements.wizardRMultipleBtns.forEach(btn => {
      btn.disabled = !canCalculate;
    });

    // Auto-select 5R if buttons just became enabled and no button is selected and no target entered
    if (canCalculate) {
      const hasActiveButton = Array.from(this.elements.wizardRMultipleBtns).some(btn => btn.classList.contains('active'));
      const targetValue = this.elements.wizardTargetPrice?.value.trim();

      if (!hasActiveButton && !targetValue) {
        const fiveRBtn = Array.from(this.elements.wizardRMultipleBtns).find(btn => btn.dataset.r === '5');
        if (fiveRBtn) {
          this.elements.wizardRMultipleBtns.forEach(b => b.classList.remove('active'));
          fiveRBtn.classList.add('active');
          this.setTargetFromRMultiple(5);
        }
      }
    }
  }

  setTargetFromRMultiple(rMultiple) {
    const entry = parseFloat(this.elements.wizardEntryPrice?.value) || 0;
    const stop = parseFloat(this.elements.wizardStopLoss?.value) || 0;

    if (entry <= 0 || stop <= 0 || entry === stop) return;

    const riskPerShare = entry - stop;
    const targetPrice = entry + (rMultiple * riskPerShare);

    if (this.elements.wizardTargetPrice) {
      this.elements.wizardTargetPrice.value = targetPrice.toFixed(2);
      state.updateTrade({ target: targetPrice });
    }

    this.updateTargetRDisplay();
  }

  updateRiskButtons() {
    if (!this.elements.wizardRiskPercentBtns) return;

    const entry = parseFloat(this.elements.wizardEntryPrice?.value) || 0;
    const stop = parseFloat(this.elements.wizardStopLoss?.value) || 0;
    const accountSize = state.account.currentSize || 0;

    // Enable when entry, stop valid AND account > 0 (shares not required - buttons calculate shares)
    const canCalculate = entry > 0 &&
                         stop > 0 &&
                         entry !== stop &&
                         accountSize > 0;

    this.elements.wizardRiskPercentBtns.forEach(btn => {
      btn.disabled = !canCalculate;
    });
  }

  setSharesFromRiskPercent(riskPercent) {
    const entry = parseFloat(this.elements.wizardEntryPrice?.value) || 0;
    const stop = parseFloat(this.elements.wizardStopLoss?.value) || 0;
    const accountSize = state.account.currentSize || 0;

    if (entry <= 0 || stop <= 0 || entry === stop || accountSize <= 0) return;

    const riskPerShare = entry - stop;
    const riskDollars = accountSize * (riskPercent / 100);
    const shares = Math.floor(riskDollars / riskPerShare);

    // Update shares input and risk dollar display programmatically
    this.updatingProgrammatically = true;
    if (this.elements.wizardShares) {
      this.elements.wizardShares.value = shares;
    }
    if (this.elements.wizardRiskDollar) {
      this.elements.wizardRiskDollar.value = riskDollars.toFixed(2);
    }
    this.updatingProgrammatically = false;

    // Update displays
    this.updateRiskPercentDisplay();
    this.updateRMultipleButtons();
  }

  handleCustomRiskDollar() {
    const riskDollars = parseFloat(this.elements.wizardRiskDollar?.value) || 0;
    const entry = parseFloat(this.elements.wizardEntryPrice?.value) || 0;
    const stop = parseFloat(this.elements.wizardStopLoss?.value) || 0;
    const accountSize = state.account.currentSize || 0;

    if (riskDollars <= 0 || entry <= 0 || stop <= 0 || entry === stop) {
      this.updateRiskPercentDisplay();
      return;
    }

    // Calculate shares from risk dollars
    const riskPerShare = entry - stop;
    const shares = Math.floor(riskDollars / riskPerShare);

    // Update shares input programmatically
    this.updatingProgrammatically = true;
    if (this.elements.wizardShares) {
      this.elements.wizardShares.value = shares;
    }
    this.updatingProgrammatically = false;

    // Calculate risk percentage
    const riskPercent = accountSize > 0 ? (riskDollars / accountSize) * 100 : 0;

    // Check if matches a preset button and auto-select it
    const presetValues = [0.1, 0.25, 0.5, 1, 2];
    const matchingPreset = presetValues.find(preset => {
      const presetDollars = accountSize * (preset / 100);
      return Math.abs(riskDollars - presetDollars) < 0.01; // Allow small floating point differences
    });

    // Update button states
    this.elements.wizardRiskPercentBtns?.forEach(btn => {
      const btnValue = parseFloat(btn.dataset.risk);
      if (matchingPreset && btnValue === matchingPreset) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Update displays
    this.updateRiskPercentDisplay();
    this.updateRMultipleButtons();
  }

  updateRiskDisplay() {
    if (!this.elements.wizardRiskDollar) return;

    // Skip if we're programmatically updating to avoid circular updates
    if (this.updatingProgrammatically) return;

    const entry = parseFloat(this.elements.wizardEntryPrice?.value) || 0;
    const stop = parseFloat(this.elements.wizardStopLoss?.value) || 0;
    const shares = parseInt(this.elements.wizardShares?.value) || 0;

    // Calculate risk dollars
    let riskDollars = 0;
    if (entry > 0 && stop > 0 && shares > 0 && entry !== stop) {
      const riskPerShare = entry - stop;
      riskDollars = riskPerShare * shares;
    }

    // Display formatted value
    this.elements.wizardRiskDollar.value = riskDollars.toFixed(2);

    // Update risk percent display
    this.updateRiskPercentDisplay();
  }

  updateRiskPercentDisplay() {
    if (!this.elements.wizardRiskPercentDisplay) return;

    const riskDollars = parseFloat(this.elements.wizardRiskDollar?.value) || 0;
    const accountSize = state.account.currentSize || 0;

    // Calculate and display risk percentage
    if (riskDollars > 0 && accountSize > 0) {
      const riskPercent = (riskDollars / accountSize) * 100;
      this.elements.wizardRiskPercentDisplay.textContent = `(${riskPercent.toFixed(2)}%)`;
      this.elements.wizardRiskPercentDisplay.style.display = '';
    } else {
      this.elements.wizardRiskPercentDisplay.style.display = 'none';
    }
  }

  updateTargetRDisplay() {
    if (!this.elements.wizardRDisplay) return;

    const entry = parseFloat(this.elements.wizardEntryPrice?.value) || 0;
    const stop = parseFloat(this.elements.wizardStopLoss?.value) || 0;
    const target = parseFloat(this.elements.wizardTargetPrice?.value) || 0;

    // Calculate R-Multiple
    let rMultiple = 0;
    if (entry > 0 && stop > 0 && target > 0 && entry !== stop) {
      const risk = entry - stop;
      const reward = target - entry;
      rMultiple = reward / risk;
    }

    // Display formatted value
    if (rMultiple !== 0) {
      this.elements.wizardRDisplay.textContent = `(${rMultiple.toFixed(1)}R)`;
      this.elements.wizardRDisplay.classList.toggle('negative', rMultiple < 0);
      this.elements.wizardRDisplay.style.display = '';
    } else {
      this.elements.wizardRDisplay.style.display = 'none';
    }
  }

  showSuccessToast() {
    const messages = [
      "Trade logged! Good luck!",
      "Nice setup! Tracked.",
      "You're on a roll! Trade saved.",
      "Disciplined trader! Logged.",
      "Trade captured! Let's go!"
    ];
    const message = messages[Math.floor(Math.random() * messages.length)];
    showToast(message, 'success');
  }

  showInputError(inputElement, errorElement, message) {
    // Add error class to input
    if (inputElement) {
      inputElement.classList.add('input--error');
    }

    // Show error message
    if (errorElement) {
      errorElement.textContent = message;
      errorElement.classList.add('input-error--visible');
    }
  }

  clearInputError(inputElement, errorElement) {

    // Remove error class from input
    if (inputElement) {
      inputElement.classList.remove('input--error');
    }

    // Hide error message
    if (errorElement) {
      errorElement.classList.remove('input-error--visible');
      errorElement.textContent = '';
    }
  }

  clearAllErrors() {
    // Clear all input error states
    const inputs = [
      this.elements.wizardTicker,
      this.elements.wizardEntryPrice,
      this.elements.wizardStopLoss,
      this.elements.wizardShares,
      this.elements.wizardRiskDollar,
      this.elements.wizardTargetPrice,
      this.elements.wizardTradeDate
    ];

    const errors = [
      this.elements.wizardTickerError,
      this.elements.wizardEntryPriceError,
      this.elements.wizardStopLossError,
      this.elements.wizardSharesError,
      this.elements.wizardRiskDollarError,
      this.elements.wizardTargetPriceError,
      this.elements.wizardTradeDateError,
      this.elements.wizardSetupTypeError
    ];

    inputs.forEach((input, index) => {
      this.clearInputError(input, errors[index]);
    });

    // Clear setup type error (no input element)
    if (this.elements.wizardSetupTypeError) {
      this.elements.wizardSetupTypeError.textContent = '';
      this.elements.wizardSetupTypeError.classList.remove('input-error--visible');
    }

    // Also clear ticker status icons
    this.hideTickerStatus();
  }

  showTickerLoading() {
    if (!this.elements.wizardTickerStatus) return;
    this.elements.wizardTickerStatus.className = 'input-status input-status--loading';
  }

  showTickerSuccess() {
    if (!this.elements.wizardTickerStatus) return;
    this.elements.wizardTickerStatus.className = 'input-status input-status--success';
  }

  hideTickerStatus() {
    if (!this.elements.wizardTickerStatus) return;
    this.elements.wizardTickerStatus.className = 'input-status';
  }

  async validateTickerOnBlur() {
    const ticker = this.elements.wizardTicker?.value.trim() || '';

    // Don't validate if ticker is empty
    if (!ticker) {
      this.hideTickerStatus();
      return;
    }

    // Don't validate if no API key is available
    if (!priceTracker.apiKey) {
      this.hideTickerStatus();
      return;
    }

    // Clear any existing errors
    this.clearInputError(this.elements.wizardTicker, this.elements.wizardTickerError);

    // Show loading spinner
    this.showTickerLoading();

    try {
      // Validate ticker with API
      await priceTracker.fetchPrice(ticker);

      // Show success check
      this.showTickerSuccess();
    } catch (error) {
      // Hide status icons
      this.hideTickerStatus();

      // Show error message
      const errorMsg = error.message.includes('Invalid ticker')
        ? `Invalid ticker: ${ticker}`
        : `Failed to validate ticker: ${error.message}`;
      this.showInputError(
        this.elements.wizardTicker,
        this.elements.wizardTickerError,
        errorMsg
      );
    }
  }

  sanitizeDecimalInput(e) {
    const input = e.target;
    const originalValue = input.value;
    let value = originalValue;

    // Allow only numbers and one decimal point
    value = value.replace(/[^\d.]/g, '');

    // Allow only one decimal point
    const parts = value.split('.');
    if (parts.length > 2) {
      value = parts[0] + '.' + parts.slice(1).join('');
    }

    // Only update if value changed (to avoid triggering another input event)
    if (value !== originalValue) {
      input.value = value;
    }
  }

  sanitizeEntryPriceInput(e) {
    // Use generic decimal sanitizer
    this.sanitizeDecimalInput(e);

    // Clear any existing error
    this.clearInputError(this.elements.wizardEntryPrice, this.elements.wizardEntryPriceError);

    // Validate entry price if value is provided
    const value = this.elements.wizardEntryPrice?.value.trim();

    if (value) {
      const entryPrice = parseFloat(value);

      if (!isNaN(entryPrice) && entryPrice <= 0) {
        this.showInputError(
          this.elements.wizardEntryPrice,
          this.elements.wizardEntryPriceError,
          'Entry price must be greater than 0'
        );
        return;
      }
    }

    // Update state and UI
    const entry = parseFloat(this.elements.wizardEntryPrice.value) || 0;
    state.updateTrade({ entry });
    this.updateRMultipleButtons();
    this.updateRiskButtons();
    this.updateRiskDisplay();
    this.updateTargetRDisplay();
  }

  sanitizeStopLossInput(e) {
    // Use generic decimal sanitizer
    this.sanitizeDecimalInput(e);

    // Clear any existing error
    this.clearInputError(this.elements.wizardStopLoss, this.elements.wizardStopLossError);

    // Validate stop loss if value is provided
    const value = this.elements.wizardStopLoss?.value.trim();
    if (value) {
      const stopLoss = parseFloat(value);
      if (!isNaN(stopLoss) && stopLoss <= 0) {
        this.showInputError(
          this.elements.wizardStopLoss,
          this.elements.wizardStopLossError,
          'Stop loss must be greater than 0'
        );
        return; // Don't update state if there's an error
      }
    }

    // Update state and UI
    const stop = parseFloat(this.elements.wizardStopLoss.value) || 0;
    state.updateTrade({ stop });
    this.updateRMultipleButtons();
    this.updateRiskButtons();
    this.updateRiskDisplay();
    this.updateTargetRDisplay();
  }

  sanitizeSharesInput(e) {
    const input = e.target;
    let value = input.value;

    // Allow only integers (no decimals)
    value = value.replace(/[^\d]/g, '');

    // Update input value with sanitized version
    input.value = value;

    // Clear any existing error
    this.clearInputError(this.elements.wizardShares, this.elements.wizardSharesError);

    // Validate shares if value is provided
    if (value) {
      const shares = parseInt(value);
      if (!isNaN(shares) && shares <= 0) {
        this.showInputError(
          this.elements.wizardShares,
          this.elements.wizardSharesError,
          'Shares must be greater than 0'
        );
        return; // Don't update state if there's an error
      }
    }

    // Remove active state when shares manually changed
    this.elements.wizardRiskPercentBtns?.forEach(b => b.classList.remove('active'));

    // Update UI
    this.updateRMultipleButtons();
    this.updateRiskButtons();
    this.updateRiskDisplay();
  }

  sanitizeTargetPriceInput(e) {
    // Use generic decimal sanitizer
    this.sanitizeDecimalInput(e);

    // Clear any existing error
    this.clearInputError(this.elements.wizardTargetPrice, this.elements.wizardTargetPriceError);

    // Validate target price if value is provided
    const value = this.elements.wizardTargetPrice?.value.trim();
    if (value) {
      const target = parseFloat(value);

      // Check if target > 0
      if (!isNaN(target) && target <= 0) {
        this.showInputError(
          this.elements.wizardTargetPrice,
          this.elements.wizardTargetPriceError,
          'Target price must be greater than 0'
        );
        return; // Don't update state if there's an error
      }

      // Check if target > entry price
      const entryValue = this.elements.wizardEntryPrice?.value.trim();
      if (entryValue) {
        const entryPrice = parseFloat(entryValue);
        if (!isNaN(target) && !isNaN(entryPrice) && target <= entryPrice) {
          this.showInputError(
            this.elements.wizardTargetPrice,
            this.elements.wizardTargetPriceError,
            'Target price must be greater than entry price'
          );
          return; // Don't update state if there's an error
        }
      }
    }

    // Update state and UI
    const target = parseFloat(this.elements.wizardTargetPrice.value) || 0;
    state.updateTrade({ target });
    this.updateTargetRDisplay();

    // Check if target matches any R-Multiple preset and update UI
    const entry = parseFloat(this.elements.wizardEntryPrice?.value) || 0;
    const stop = parseFloat(this.elements.wizardStopLoss?.value) || 0;
    const riskPerShare = entry - stop;

    if (riskPerShare > 0) {
      const rMultiple = (target - entry) / riskPerShare;
      let matchFound = false;

      this.elements.wizardRMultipleBtns?.forEach(btn => {
        const btnR = parseInt(btn.dataset.r);
        if (Math.abs(rMultiple - btnR) < 0.01) {
          btn.classList.add('active');
          matchFound = true;
        } else {
          btn.classList.remove('active');
        }
      });
    }
  }

  sanitizeRiskDollarInput(e) {
    // Use generic decimal sanitizer
    this.sanitizeDecimalInput(e);

    // Clear any existing error
    this.clearInputError(this.elements.wizardRiskDollar, this.elements.wizardRiskDollarError);

    // Validate risk dollar if value is provided
    const value = this.elements.wizardRiskDollar?.value.trim();
    if (value) {
      const riskDollar = parseFloat(value);
      if (!isNaN(riskDollar) && riskDollar <= 0) {
        this.showInputError(
          this.elements.wizardRiskDollar,
          this.elements.wizardRiskDollarError,
          'Risk must be greater than 0'
        );
      }
    }
  }
}

export const wizard = new TradeWizard();
export { TradeWizard };
