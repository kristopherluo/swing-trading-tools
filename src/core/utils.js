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
