/**
 * Utility Functions - Formatting and parsing helpers
 */

// Currency formatting
export function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

// Number formatting with locale
export function formatNumber(value, decimals = 0) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value);
}

// Percentage formatting
export function formatPercent(value, decimals = 2) {
  return `${formatNumber(value, decimals)}%`;
}

// Format with commas (no currency symbol)
export function formatWithCommas(value) {
  if (value === null || value === undefined) return '';
  return formatNumber(value, value % 1 === 0 ? 0 : 2);
}

// Parse number from string (handles K/M notation and commas)
export function parseNumber(str) {
  if (!str) return null;
  if (typeof str === 'number') return str;

  // Remove commas and whitespace
  let cleaned = str.toString().replace(/,/g, '').trim();

  // Handle K/M notation
  const multipliers = { k: 1000, m: 1000000 };
  const match = cleaned.match(/^([\d.]+)\s*([km])$/i);

  if (match) {
    const num = parseFloat(match[1]);
    const multiplier = multipliers[match[2].toLowerCase()];
    return num * multiplier;
  }

  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

// Debounce function
export function debounce(fn, delay) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), delay);
  };
}

// Throttle function
export function throttle(fn, limit) {
  let inThrottle;
  return function (...args) {
    if (!inThrottle) {
      fn.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Sleep for a specified duration
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} Promise that resolves after the specified time
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Generate unique ID
export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Clamp value between min and max
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// Format date for display
export function formatDate(dateString, options = {}) {
  const defaults = { month: 'short', day: 'numeric' };
  return new Date(dateString).toLocaleDateString('en-US', { ...defaults, ...options });
}

// Format time for display
export function formatTime(dateString) {
  return new Date(dateString).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit'
  });
}

// Create ISO timestamp from date input value (YYYY-MM-DD)
// Uses noon (12:00) to avoid timezone issues
export function createTimestampFromDateInput(dateInputValue) {
  if (!dateInputValue) {
    return new Date().toISOString();
  }
  return new Date(dateInputValue + 'T12:00:00').toISOString();
}

// Initialize Flatpickr date picker with weekend disabling and custom options
export function initFlatpickr(dateInput, options = {}) {
  if (!dateInput) return null;
  if (!window.flatpickr) {
    console.error('Flatpickr library not loaded');
    return null;
  }

  // Default configuration
  const defaultConfig = {
    dateFormat: 'Y-m-d',
    altInput: true,
    altFormat: 'M j, Y', // e.g., "Jan 10, 2026"
    animate: true,
    // Disable weekends
    disable: [
      function(date) {
        // Return true to disable the date
        return (date.getDay() === 0 || date.getDay() === 6); // Sunday = 0, Saturday = 6
      }
    ],
    // Prevent future dates
    maxDate: 'today',
    // Position calendar below input
    position: 'auto',
    // Allow input
    allowInput: false,
    // Close on selection
    static: false,
    // Show week numbers
    weekNumbers: false,
    // First day of week (0 = Sunday, 1 = Monday)
    locale: {
      firstDayOfWeek: 0 // Start with Sunday
    },
    // Convert year input to dropdown
    onReady: function(selectedDates, dateStr, instance) {
      setTimeout(() => {
        const yearInput = instance.calendarContainer.querySelector('.cur-year');
        if (yearInput && !yearInput.dataset.convertedToDropdown) {
          yearInput.dataset.convertedToDropdown = 'true';

          // Create a select element
          const yearSelect = document.createElement('select');
          yearSelect.className = 'cur-year';

          // Generate year options (from 10 years ago to current year)
          const currentYear = new Date().getFullYear();
          const startYear = currentYear - 10;

          for (let year = currentYear; year >= startYear; year--) {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            if (year === parseInt(yearInput.value)) {
              option.selected = true;
            }
            yearSelect.appendChild(option);
          }

          // Handle year change
          yearSelect.addEventListener('change', function() {
            instance.changeYear(parseInt(this.value));
          });

          // Replace the input with the select
          yearInput.parentNode.replaceChild(yearSelect, yearInput);
        }
      }, 50);
    },
    // Update year dropdown when month navigation changes the year
    onMonthChange: function(selectedDates, dateStr, instance) {
      setTimeout(() => {
        const yearSelect = instance.calendarContainer.querySelector('.cur-year');
        if (yearSelect && yearSelect.tagName === 'SELECT') {
          const currentYear = instance.currentYear;
          yearSelect.value = currentYear;
        }
      }, 10);
    },
    // Update year dropdown when year changes
    onYearChange: function(selectedDates, dateStr, instance) {
      setTimeout(() => {
        const yearSelect = instance.calendarContainer.querySelector('.cur-year');
        if (yearSelect && yearSelect.tagName === 'SELECT') {
          const currentYear = instance.currentYear;
          yearSelect.value = currentYear;
        }
      }, 10);
    }
  };

  // Merge with custom options
  const config = { ...defaultConfig, ...options };

  // Initialize flatpickr
  const fp = flatpickr(dateInput, config);

  return fp;
}

// Get previous business day (skip weekends)
export function getPreviousBusinessDay(date) {
  const result = new Date(date);
  result.setDate(result.getDate() - 1);

  // If it's Sunday (0), go back to Friday
  if (result.getDay() === 0) {
    result.setDate(result.getDate() - 2);
  }
  // If it's Saturday (6), go back to Friday
  else if (result.getDay() === 6) {
    result.setDate(result.getDate() - 1);
  }

  return result;
}

// Get current weekday (or last Friday if today is weekend)
export function getCurrentWeekday() {
  const today = new Date();
  const dayOfWeek = today.getDay();

  // If Saturday (6), go back to Friday
  if (dayOfWeek === 6) {
    today.setDate(today.getDate() - 1);
  }
  // If Sunday (0), go back to Friday
  else if (dayOfWeek === 0) {
    today.setDate(today.getDate() - 2);
  }

  return today;
}

/**
 * Restrict input to numeric values only (with optional decimal support)
 * @param {HTMLInputElement} inputElement - The input element to restrict
 * @param {boolean} allowDecimal - Whether to allow decimal points (default: true)
 */
export function restrictToNumberInput(inputElement, allowDecimal = true) {
  if (!inputElement) return;

  inputElement.addEventListener('input', (e) => {
    let value = e.target.value;

    if (allowDecimal) {
      // Allow numbers and one decimal point
      value = value.replace(/[^0-9.]/g, '');
      // Allow only one decimal point
      const parts = value.split('.');
      if (parts.length > 2) {
        value = parts[0] + '.' + parts.slice(1).join('');
      }
    } else {
      // Allow only integers
      value = value.replace(/[^0-9]/g, '');
    }

    e.target.value = value;
  });
}
