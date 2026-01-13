/**
 * Stats Chart - Canvas-based equity curve chart
 */

import { state } from '../../core/state.js';
import { stats } from './stats.js';

class EquityChart {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.container = null;
    this.emptyState = null;
    this.dpr = window.devicePixelRatio || 1;
    this.tooltip = null;
    this.data = null;
    this.chartData = null;
    this.chartScales = null;
    this.chartPadding = null;

    // Chart colors
    this.colors = {
      line: '#3b82f6',      // Primary blue
      fill: 'rgba(59, 130, 246, 0.1)',
      fillEnd: 'rgba(59, 130, 246, 0)',
      profit: '#22c55e',     // Success green
      loss: '#ef4444',       // Danger red
      grid: 'rgba(255, 255, 255, 0.05)',
      text: '#64748b',       // Muted text
      axis: '#2a3545',       // Border subtle
      tooltip: 'rgba(0, 0, 0, 0.9)'
    };

    // Light theme colors (applied via CSS custom properties check)
    this.lightColors = {
      line: '#2563eb',
      fill: 'rgba(37, 99, 235, 0.08)',
      fillEnd: 'rgba(37, 99, 235, 0)',
      profit: '#16a34a',
      loss: '#dc2626',
      grid: 'rgba(0, 0, 0, 0.03)',
      text: '#64748b',
      axis: '#e2e8f0',
      tooltip: 'rgba(0, 0, 0, 0.85)'
    };
  }

  init() {
    this.canvas = document.getElementById('equityChartCanvas');
    this.container = document.getElementById('equityChartContainer');
    this.emptyState = document.getElementById('equityChartEmpty');

    if (!this.canvas || !this.container) {
      console.warn('EquityChart: Required elements not found');
      return;
    }

    this.ctx = this.canvas.getContext('2d');
    this.resize();

    // Handle resize with debouncing
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        try {
          this.resize();
          // Trigger stats to re-render the chart with fresh data
          if (stats && stats.renderEquityCurve) {
            stats.renderEquityCurve();
          }
        } catch (error) {
          console.error('[Chart] Error during resize:', error);
        }
      }, 100);
    });

    // Handle mouse events for tooltip
    this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    this.canvas.addEventListener('mouseleave', () => this.handleMouseLeave());

    // Note: Rendering is now controlled by stats.js via setData() and render()
    // stats.js handles the view transition timing and calls refresh() when ready
    // The resize happens automatically via the window resize listener above
  }

  resize() {
    if (!this.canvas || !this.container) return;

    const rect = this.container.getBoundingClientRect();

    // Skip if container has no dimensions (e.g., view not visible)
    if (rect.width === 0 || rect.height === 0) {
      return;
    }

    this.canvas.width = rect.width * this.dpr;
    this.canvas.height = rect.height * this.dpr;
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;

    // Setting canvas width/height resets the context, so reapply transformations
    this.ctx.scale(this.dpr, this.dpr);

    // Note: Render is now called explicitly by the caller after resize
    // This prevents double-rendering with stale data
  }

  getColors() {
    // Check if light theme
    const isLight = document.documentElement.dataset.theme === 'light';
    return isLight ? this.lightColors : this.colors;
  }

  // Set chart data (called from stats.js)
  setData(data) {
    this.data = data;
  }

  async render() {
    if (!this.ctx || !this.canvas) return;

    const data = this.data;
    if (!data) {
      console.warn('No data to render');
      return;
    }

    const rect = this.container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return;
    }

    if (this.canvas.width !== rect.width * this.dpr ||
        this.canvas.height !== rect.height * this.dpr) {
      this.resize();
    }

    const width = this.canvas.width / this.dpr;
    const height = this.canvas.height / this.dpr;

    if (width === 0 || height === 0) {
      return;
    }

    const colors = this.getColors();

    // Clear canvas
    this.ctx.clearRect(0, 0, width, height);

    // Check for empty state
    if (data.length < 2) {
      this.showEmptyState(true);
      return;
    }
    this.showEmptyState(false);

    // Chart padding
    const padding = {
      top: 20,
      right: 20,
      bottom: 30,
      left: 60
    };

    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Calculate min/max for scaling
    const values = data.map(d => d.balance);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const valueRange = maxValue - minValue || 1;

    // Add 10% padding to range
    const paddedMin = minValue - valueRange * 0.1;
    const paddedMax = maxValue + valueRange * 0.1;
    const paddedRange = paddedMax - paddedMin;

    // X scale (time)
    const dates = data.map(d => new Date(d.date).getTime());
    const minDate = Math.min(...dates);
    const maxDate = Math.max(...dates);
    const dateRange = maxDate - minDate || 1;

    const scaleX = (date) => padding.left + ((new Date(date).getTime() - minDate) / dateRange) * chartWidth;
    const scaleY = (value) => padding.top + chartHeight - ((value - paddedMin) / paddedRange) * chartHeight;

    // Store data and scales for tooltip
    this.chartData = data;
    this.chartScales = { scaleX, scaleY };
    this.chartPadding = padding;

    // Draw grid lines
    this.drawGrid(padding, chartWidth, chartHeight, paddedMin, paddedMax, colors);

    // Draw fill gradient
    this.drawFill(data, scaleX, scaleY, padding, chartHeight, colors);

    // Draw line
    this.drawLine(data, scaleX, scaleY, colors);

    // Draw Y-axis labels
    this.drawYAxisLabels(padding, chartHeight, paddedMin, paddedMax, colors);

    // Draw X-axis labels
    this.drawXAxisLabels(data, scaleX, padding, chartWidth, chartHeight, colors);
  }

  drawGrid(padding, chartWidth, chartHeight, minValue, maxValue, colors) {
    this.ctx.strokeStyle = colors.grid;
    this.ctx.lineWidth = 1;

    // Horizontal grid lines (5 lines)
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (chartHeight / 4) * i;
      this.ctx.beginPath();
      this.ctx.moveTo(padding.left, y);
      this.ctx.lineTo(padding.left + chartWidth, y);
      this.ctx.stroke();
    }
  }

  drawFill(data, scaleX, scaleY, padding, chartHeight, colors) {
    if (data.length < 2) return;

    const gradient = this.ctx.createLinearGradient(0, padding.top, 0, padding.top + chartHeight);
    gradient.addColorStop(0, colors.fill);
    gradient.addColorStop(1, colors.fillEnd);

    this.ctx.beginPath();
    this.ctx.moveTo(scaleX(data[0].date), scaleY(data[0].balance));

    for (let i = 1; i < data.length; i++) {
      this.ctx.lineTo(scaleX(data[i].date), scaleY(data[i].balance));
    }

    // Close the path along the bottom
    this.ctx.lineTo(scaleX(data[data.length - 1].date), padding.top + chartHeight);
    this.ctx.lineTo(scaleX(data[0].date), padding.top + chartHeight);
    this.ctx.closePath();

    this.ctx.fillStyle = gradient;
    this.ctx.fill();
  }

  drawLine(data, scaleX, scaleY, colors) {
    if (data.length < 2) return;

    this.ctx.strokeStyle = colors.line;
    this.ctx.lineWidth = 2;
    this.ctx.lineJoin = 'round';
    this.ctx.lineCap = 'round';

    this.ctx.beginPath();
    this.ctx.moveTo(scaleX(data[0].date), scaleY(data[0].balance));

    for (let i = 1; i < data.length; i++) {
      this.ctx.lineTo(scaleX(data[i].date), scaleY(data[i].balance));
    }

    this.ctx.stroke();
  }

  drawPoints(data, scaleX, scaleY, colors) {
    // Skip first point (starting balance)
    for (let i = 1; i < data.length; i++) {
      const point = data[i];
      const x = scaleX(point.date);
      const y = scaleY(point.balance);
      const isProfit = point.pnl >= 0;

      // Draw circle
      this.ctx.beginPath();
      this.ctx.arc(x, y, 4, 0, Math.PI * 2);
      this.ctx.fillStyle = isProfit ? colors.profit : colors.loss;
      this.ctx.fill();

      // White border
      this.ctx.strokeStyle = '#ffffff';
      this.ctx.lineWidth = 1.5;
      this.ctx.stroke();
    }
  }

  drawYAxisLabels(padding, chartHeight, minValue, maxValue, colors) {
    this.ctx.fillStyle = colors.text;
    this.ctx.font = '11px Inter, sans-serif';
    this.ctx.textAlign = 'right';
    this.ctx.textBaseline = 'middle';

    const valueRange = maxValue - minValue;
    const step = valueRange / 4;

    for (let i = 0; i <= 4; i++) {
      const value = maxValue - step * i;
      const y = padding.top + (chartHeight / 4) * i;
      const label = this.formatCurrency(value);
      this.ctx.fillText(label, padding.left - 8, y);
    }
  }

  drawXAxisLabels(data, scaleX, padding, chartWidth, chartHeight, colors) {
    if (data.length < 2) return;

    this.ctx.fillStyle = colors.text;
    this.ctx.font = '11px Inter, sans-serif';
    this.ctx.textBaseline = 'top';

    const y = padding.top + chartHeight + 8;

    // Only show start and end dates
    const startPoint = data[0];
    const endPoint = data[data.length - 1];

    // Draw start date (left-aligned)
    this.ctx.textAlign = 'left';
    this.ctx.fillText(this.formatDate(startPoint.date), scaleX(startPoint.date), y);

    // Draw end date (right-aligned)
    this.ctx.textAlign = 'right';
    this.ctx.fillText(this.formatDate(endPoint.date), scaleX(endPoint.date), y);
  }

  formatDate(dateStr) {
    // Parse YYYY-MM-DD as local date to avoid timezone shifts
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);

    const monthName = date.toLocaleDateString('en-US', { month: 'short' });
    const dayNum = date.getDate();
    const yearNum = date.getFullYear();

    // Show month/day for recent dates, month/year for older ones
    const now = new Date();
    const yearDiff = now.getFullYear() - yearNum;

    if (yearDiff > 0) {
      return `${monthName} ${yearNum}`;
    }
    return `${monthName} ${dayNum}`;
  }

  formatCurrency(value) {
    if (Math.abs(value) >= 1000000) {
      return '$' + (value / 1000000).toFixed(1) + 'M';
    } else if (Math.abs(value) >= 1000) {
      return '$' + (value / 1000).toFixed(1) + 'k';
    }
    return '$' + value.toFixed(0);
  }

  formatCurrencyFull(value) {
    return '$' + value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  formatDateFull(dateStr) {
    // Parse YYYY-MM-DD as local date to avoid timezone shifts
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  handleMouseMove(e) {
    if (!this.chartData || !this.chartScales || !this.chartPadding) return;

    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Find closest data point
    const { scaleX, scaleY } = this.chartScales;
    let closestPoint = null;
    let minDistance = Infinity;

    for (const point of this.chartData) {
      const px = scaleX(point.date);
      const py = scaleY(point.balance);
      const distance = Math.sqrt((x - px) ** 2 + (y - py) ** 2);

      if (distance < minDistance) {
        minDistance = distance;
        closestPoint = { ...point, px, py };
      }
    }

    // Show tooltip if close enough (within 30px)
    if (closestPoint && minDistance < 30) {
      this.showTooltip(closestPoint, x, y);
      this.canvas.style.cursor = 'pointer';
    } else {
      this.hideTooltip();
      this.canvas.style.cursor = 'default';
    }
  }

  handleMouseLeave() {
    this.hideTooltip();
    this.canvas.style.cursor = 'default';
  }

  showTooltip(point, mouseX, mouseY) {
    if (!this.tooltip) {
      this.tooltip = document.createElement('div');
      this.tooltip.style.position = 'absolute';
      this.tooltip.style.background = this.getColors().tooltip;
      this.tooltip.style.color = 'white';
      this.tooltip.style.padding = '8px 12px';
      this.tooltip.style.borderRadius = '6px';
      this.tooltip.style.fontSize = '12px';
      this.tooltip.style.fontFamily = 'Inter, sans-serif';
      this.tooltip.style.pointerEvents = 'none';
      this.tooltip.style.zIndex = '1000';
      this.tooltip.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
      this.tooltip.style.whiteSpace = 'nowrap';
      this.container.appendChild(this.tooltip);
    }

    this.tooltip.innerHTML = `
      <div style="font-weight: 600; margin-bottom: 4px;">${this.formatCurrencyFull(point.balance)}</div>
      <div style="font-size: 11px; opacity: 0.9;">${this.formatDateFull(point.date)}</div>
    `;

    // Position tooltip
    const rect = this.container.getBoundingClientRect();
    const tooltipRect = this.tooltip.getBoundingClientRect();

    let left = mouseX + 15;
    let top = mouseY - tooltipRect.height / 2;

    // Keep tooltip within bounds
    if (left + tooltipRect.width > rect.width) {
      left = mouseX - tooltipRect.width - 15;
    }
    if (top < 0) {
      top = 0;
    }
    if (top + tooltipRect.height > rect.height) {
      top = rect.height - tooltipRect.height;
    }

    this.tooltip.style.left = left + 'px';
    this.tooltip.style.top = top + 'px';
    this.tooltip.style.display = 'block';
  }

  hideTooltip() {
    if (this.tooltip) {
      this.tooltip.style.display = 'none';
    }
  }

  showEmptyState(show) {
    if (this.emptyState) {
      this.emptyState.style.display = show ? 'flex' : 'none';
    }
    if (this.canvas) {
      this.canvas.style.display = show ? 'none' : 'block';
    }
  }
}

export const equityChart = new EquityChart();
export { EquityChart };
