/**
 * FilterPopup - Shared filter popup UI logic for Stats, Journal, and Positions pages
 * Handles open/close, backdrop, click-outside, and common interactions
 */

export class FilterPopup {
  constructor(options) {
    this.elements = options.elements; // { filterBtn, filterPanel, filterBackdrop, filterClose, applyBtn, resetBtn, filterCount }
    this.callbacks = {
      onOpen: options.onOpen || (() => {}),
      onClose: options.onClose || (() => {}),
      onApply: options.onApply || (() => {}),
      onReset: options.onReset || (() => {})
    };

    this.isOpen = false;
    this.bindEvents();
  }

  bindEvents() {
    // Filter button - toggle panel
    this.elements.filterBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle();
    });

    // Close button
    this.elements.filterClose?.addEventListener('click', () => {
      this.close();
    });

    // Backdrop click
    this.elements.filterBackdrop?.addEventListener('click', () => {
      this.close();
    });

    // Apply button
    this.elements.applyBtn?.addEventListener('click', () => {
      this.callbacks.onApply();
      this.close();
    });

    // Reset button (clear/selectAllTypes)
    this.elements.resetBtn?.addEventListener('click', () => {
      this.callbacks.onReset();
      // Don't close - let user continue adjusting filters
    });

    // Close when clicking outside
    document.addEventListener('click', (e) => {
      if (this.isOpen) {
        const isClickInside =
          this.elements.filterBtn?.contains(e.target) ||
          this.elements.filterPanel?.contains(e.target) ||
          e.target.closest('.flatpickr-calendar'); // Don't close when clicking date picker

        if (!isClickInside) {
          this.close();
        }
      }
    });

    // ESC key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  open() {
    this.elements.filterPanel?.classList.add('open');
    this.elements.filterBtn?.classList.add('open');
    this.elements.filterBackdrop?.classList.add('open');
    this.isOpen = true;
    this.callbacks.onOpen();
  }

  close() {
    this.elements.filterPanel?.classList.remove('open');
    this.elements.filterBtn?.classList.remove('open');
    this.elements.filterBackdrop?.classList.remove('open');
    this.isOpen = false;
    this.callbacks.onClose();
  }

  /**
   * Update the filter count badge
   * @param {number} count - Number of active filters (0 to hide badge)
   */
  updateFilterCount(count) {
    if (!this.elements.filterCount) return;

    if (count > 0) {
      this.elements.filterCount.textContent = count;
      this.elements.filterCount.style.display = 'inline-flex';
      this.elements.filterCount.classList.add('filter-count--active');
    } else {
      this.elements.filterCount.textContent = '';
      this.elements.filterCount.style.display = 'none';
      this.elements.filterCount.classList.remove('filter-count--active');
    }
  }
}
