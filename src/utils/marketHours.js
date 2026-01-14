/**
 * Market Hours Utility - Market timing and trading day logic
 *
 * Key Concept: A "trading day" runs from market open (9:30am EST) to the next market open.
 * For example:
 * - Monday 9:30am EST to Tuesday 9:29am EST = Monday's trading day
 * - Friday 4:01pm EST is still Friday's trading day (market closed but before next open)
 * - Saturday 10am EST is still Friday's trading day (weekend, market closed)
 * - Monday 8am EST is still Friday's trading day (before Monday's 9:30am open)
 */

/**
 * Get current time in EST timezone
 * @param {Date} date - Optional date object (defaults to now)
 * @returns {Date} Date object representing the time in EST
 */
export function getCurrentEST(date = new Date()) {
  // Use Intl.DateTimeFormat to get EST time components
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(date);
  const values = {};
  parts.forEach(part => {
    if (part.type !== 'literal') {
      values[part.type] = part.value;
    }
  });

  // Create a new Date object with EST time components
  // Note: This creates a Date in the user's local timezone but with EST time values
  const estDate = new Date(
    parseInt(values.year),
    parseInt(values.month) - 1, // Month is 0-indexed
    parseInt(values.day),
    parseInt(values.hour),
    parseInt(values.minute),
    parseInt(values.second)
  );

  return estDate;
}

/**
 * Check if market is currently open
 * Market hours: Monday-Friday, 9:30am - 4:00pm EST
 * @param {Date} date - Optional date object (defaults to now in EST)
 * @returns {boolean} True if market is open
 */
export function isMarketOpen(date = null) {
  const estDate = date ? getCurrentEST(date) : getCurrentEST();

  const dayOfWeek = estDate.getDay();

  // Weekend check (Saturday = 6, Sunday = 0)
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return false;
  }

  // Get time in minutes since midnight for easier comparison
  const hours = estDate.getHours();
  const minutes = estDate.getMinutes();
  const totalMinutes = hours * 60 + minutes;

  // Market open: 9:30am = 570 minutes
  // Market close: 4:00pm = 960 minutes
  const marketOpenMinutes = 9 * 60 + 30; // 9:30am = 570
  const marketCloseMinutes = 16 * 60;    // 4:00pm = 960

  return totalMinutes >= marketOpenMinutes && totalMinutes < marketCloseMinutes;
}

/**
 * Check if it's after market close (after 4pm EST but before next market open)
 * This is the window where we can save EOD snapshots using Finnhub's closing prices
 * @param {Date} date - Optional date object (defaults to now in EST)
 * @returns {boolean} True if after close and before next open
 */
export function isAfterMarketClose(date = null) {
  const estDate = date ? getCurrentEST(date) : getCurrentEST();

  const dayOfWeek = estDate.getDay();
  const hours = estDate.getHours();
  const minutes = estDate.getMinutes();
  const totalMinutes = hours * 60 + minutes;

  const marketCloseMinutes = 16 * 60; // 4:00pm = 960
  const marketOpenMinutes = 9 * 60 + 30; // 9:30am = 570

  // Weekday after 4pm but before midnight
  if (dayOfWeek >= 1 && dayOfWeek <= 5) {
    if (totalMinutes >= marketCloseMinutes) {
      return true;
    }
    // Also check if before market open (early morning)
    if (totalMinutes < marketOpenMinutes) {
      return true;
    }
  }

  // Weekend (all day is "after close")
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return true;
  }

  return false;
}

/**
 * Get the "trading day" for a given timestamp
 * A trading day runs from market open (9:30am EST) to next market open
 * @param {Date} date - Date object (defaults to now)
 * @returns {string} Trading day in 'YYYY-MM-DD' format
 */
export function getTradingDay(date = new Date()) {
  const estDate = getCurrentEST(date);

  const dayOfWeek = estDate.getDay();
  const hours = estDate.getHours();
  const minutes = estDate.getMinutes();
  const totalMinutes = hours * 60 + minutes;

  const marketOpenMinutes = 9 * 60 + 30; // 9:30am = 570

  // If it's before 9:30am on a weekday, trading day is the previous business day
  if (dayOfWeek >= 1 && dayOfWeek <= 5 && totalMinutes < marketOpenMinutes) {
    const previousDay = new Date(estDate);
    previousDay.setDate(previousDay.getDate() - 1);
    return getPreviousTradingDay(formatDate(previousDay));
  }

  // If it's Saturday, trading day is Friday
  if (dayOfWeek === 6) {
    const friday = new Date(estDate);
    friday.setDate(friday.getDate() - 1);
    return formatDate(friday);
  }

  // If it's Sunday, trading day is Friday
  if (dayOfWeek === 0) {
    const friday = new Date(estDate);
    friday.setDate(friday.getDate() - 2);
    return formatDate(friday);
  }

  // Otherwise, trading day is today
  return formatDate(estDate);
}

/**
 * Get the previous trading day (skips weekends)
 * @param {string} dateStr - Date string in 'YYYY-MM-DD' format
 * @returns {string} Previous trading day in 'YYYY-MM-DD' format
 */
export function getPreviousTradingDay(dateStr) {
  const date = new Date(dateStr + 'T12:00:00'); // Use noon to avoid timezone issues
  let previous = new Date(date);
  previous.setDate(previous.getDate() - 1);

  // If it's Sunday (0), go back to Friday
  if (previous.getDay() === 0) {
    previous.setDate(previous.getDate() - 2);
  }
  // If it's Saturday (6), go back to Friday
  else if (previous.getDay() === 6) {
    previous.setDate(previous.getDate() - 1);
  }

  return formatDate(previous);
}

/**
 * Get the next trading day (skips weekends)
 * @param {string} dateStr - Date string in 'YYYY-MM-DD' format
 * @returns {string} Next trading day in 'YYYY-MM-DD' format
 */
export function getNextTradingDay(dateStr) {
  const date = new Date(dateStr + 'T12:00:00'); // Use noon to avoid timezone issues
  let next = new Date(date);
  next.setDate(next.getDate() + 1);

  // If it's Saturday (6), go forward to Monday
  if (next.getDay() === 6) {
    next.setDate(next.getDate() + 2);
  }
  // If it's Sunday (0), go forward to Monday
  else if (next.getDay() === 0) {
    next.setDate(next.getDate() + 1);
  }

  return formatDate(next);
}

/**
 * Check if a date string is a business day (Monday-Friday)
 * @param {string} dateStr - Date string in 'YYYY-MM-DD' format
 * @returns {boolean} True if it's a weekday
 */
export function isBusinessDay(dateStr) {
  const date = new Date(dateStr + 'T12:00:00'); // Use noon to avoid timezone issues
  const dayOfWeek = date.getDay();
  return dayOfWeek >= 1 && dayOfWeek <= 5;
}

/**
 * Adjust a Date object to the previous weekday if it falls on a weekend
 * Modifies the date in-place
 * @param {Date} date - Date object to adjust
 * @returns {Date} The adjusted date (same object)
 */
export function adjustToPreviousWeekday(date) {
  const dayOfWeek = date.getDay();
  if (dayOfWeek === 0) {
    // Sunday: go back to Friday
    date.setDate(date.getDate() - 2);
  } else if (dayOfWeek === 6) {
    // Saturday: go back to Friday
    date.setDate(date.getDate() - 1);
  }
  return date;
}

/**
 * Adjust a Date object to the next weekday if it falls on a weekend
 * Modifies the date in-place
 * @param {Date} date - Date object to adjust
 * @returns {Date} The adjusted date (same object)
 */
export function adjustToNextWeekday(date) {
  const dayOfWeek = date.getDay();
  if (dayOfWeek === 6) {
    // Saturday: go forward to Monday
    date.setDate(date.getDate() + 2);
  } else if (dayOfWeek === 0) {
    // Sunday: go forward to Monday
    date.setDate(date.getDate() + 1);
  }
  return date;
}

/**
 * Format Date object to 'YYYY-MM-DD' string
 * Uses UTC methods to avoid timezone issues
 * @param {Date} date - Date object
 * @returns {string} Date string in 'YYYY-MM-DD' format
 */
export function formatDate(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get all business days between two dates (inclusive)
 * @param {string} startDate - Start date in 'YYYY-MM-DD' format
 * @param {string} endDate - End date in 'YYYY-MM-DD' format
 * @returns {Array<string>} Array of business day strings in 'YYYY-MM-DD' format
 */
export function getBusinessDaysBetween(startDate, endDate) {
  const businessDays = [];
  let current = startDate;

  while (current <= endDate) {
    if (isBusinessDay(current)) {
      businessDays.push(current);
    }
    current = getNextTradingDay(current);
  }

  return businessDays;
}

/**
 * Parse a date string to Date object (handles 'YYYY-MM-DD' format)
 * Uses noon to avoid timezone issues
 * @param {string} dateStr - Date string in 'YYYY-MM-DD' format
 * @returns {Date} Date object
 */
export function parseDate(dateStr) {
  return new Date(dateStr + 'T12:00:00');
}

/**
 * Get the start time of a trading day (9:30am EST)
 * @param {string} dateStr - Date string in 'YYYY-MM-DD' format
 * @returns {Date} Date object representing 9:30am EST on that day
 */
export function getTradingDayStart(dateStr) {
  const date = parseDate(dateStr);
  date.setHours(9, 30, 0, 0);
  return date;
}

/**
 * Get the end time of a trading day (4:00pm EST)
 * @param {string} dateStr - Date string in 'YYYY-MM-DD' format
 * @returns {Date} Date object representing 4:00pm EST on that day
 */
export function getTradingDayEnd(dateStr) {
  const date = parseDate(dateStr);
  date.setHours(16, 0, 0, 0);
  return date;
}
