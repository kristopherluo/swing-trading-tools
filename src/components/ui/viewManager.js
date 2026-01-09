/**
 * View Manager - Handles view swapping between 4 views
 */

import { state } from '../../core/state.js';

class ViewManager {
  constructor() {
    this.currentView = 'positions';
    this.views = {
      positions: null,
      journal: null,
      stats: null
    };
    this.navElement = null;
    this.navButtons = null;
    this.mobileBreakpoint = 800;
    this.mobileNavBackdrop = null;
    this.resizeTimeout = null;
  }

  init() {
    // Get DOM elements for all views
    this.views.positions = document.getElementById('positionsView');
    this.views.journal = document.getElementById('journalView');
    this.views.stats = document.getElementById('statsView');
    this.navElement = document.getElementById('viewNav');
    this.navButtons = document.querySelectorAll('.view-nav__btn');
    this.mobileNavTrigger = document.getElementById('mobileNavTrigger');
    this.mobileNavBackdrop = document.getElementById('mobileNavBackdrop');

    if (!this.views.positions) {
      console.warn('ViewManager: Positions element not found');
      return;
    }

    // Set initial state - positions visible, others hidden
    Object.entries(this.views).forEach(([name, el]) => {
      if (!el) return;
      if (name === 'positions') {
        el.classList.add('view--active');
        el.classList.remove('view--hidden');
      } else {
        el.classList.remove('view--active');
        el.classList.add('view--hidden');
      }
    });

    // Mobile trigger click handler
    if (this.mobileNavTrigger) {
      this.mobileNavTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.isNavExpanded()) {
          this.collapseNav();
        } else {
          this.expandNav();
        }
      });
      // Set initial trigger icon
      this.updateMobileTriggerIcon();
    }

    // Bind navigation buttons
    this.navButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const view = e.currentTarget.dataset.view;
        const isActive = e.currentTarget.classList.contains('view-nav__btn--active');

        if (this.isMobile()) {
          // Mobile: switch view and collapse
          if (view && !isActive) {
            this.switchTo(view);
          }
          this.collapseNav();
        } else {
          // Desktop: just switch view
          if (view) this.switchTo(view);
        }
      });
    });

    // Close expanded nav when clicking outside or on backdrop
    if (this.mobileNavBackdrop) {
      this.mobileNavBackdrop.addEventListener('click', () => {
        if (this.isNavExpanded()) {
          this.collapseNav();
        }
      });
    }

    document.addEventListener('click', (e) => {
      if (this.isMobile() && this.isNavExpanded()) {
        // Close if clicking outside nav and trigger (but not on backdrop, which has its own handler)
        if (!this.navElement.contains(e.target) && 
            !this.mobileNavTrigger?.contains(e.target) &&
            !this.mobileNavBackdrop?.contains(e.target)) {
          this.collapseNav();
        }
      }
    });

    // Handle window resize - collapse nav if switching from mobile to desktop
    window.addEventListener('resize', () => {
      // Debounce resize events
      if (this.resizeTimeout) {
        clearTimeout(this.resizeTimeout);
      }
      this.resizeTimeout = setTimeout(() => {
        if (!this.isMobile() && this.isNavExpanded()) {
          this.collapseNav();
        }
        // Update mobile trigger icon on resize
        this.updateMobileTriggerIcon();
      }, 150);
    });

    // Handle URL hash on load
    this.initDeepLink();

    // Keyboard shortcuts: Cmd/Ctrl + 1-3 for direct navigation
    document.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey) {
        const viewMap = { '1': 'positions', '2': 'journal', '3': 'stats' };
        if (viewMap[e.key]) {
          e.preventDefault();
          this.switchTo(viewMap[e.key]);
          if (this.isMobile()) this.collapseNav();
        }
      }
    });
  }

  // Mobile nav helpers
  isMobile() {
    return window.innerWidth <= this.mobileBreakpoint;
  }

  isNavExpanded() {
    return this.navElement?.classList.contains('view-nav--expanded');
  }

  expandNav() {
    if (!this.isMobile()) return;
    this.navElement?.classList.add('view-nav--expanded');
    this.mobileNavTrigger?.classList.add('mobile-nav-trigger--active');
    this.mobileNavBackdrop?.classList.add('mobile-nav-backdrop--active');
    // Prevent body scroll when nav is open
    document.body.style.overflow = 'hidden';
  }

  collapseNav() {
    this.navElement?.classList.remove('view-nav--expanded');
    this.mobileNavTrigger?.classList.remove('mobile-nav-trigger--active');
    this.mobileNavBackdrop?.classList.remove('mobile-nav-backdrop--active');
    // Restore body scroll
    document.body.style.overflow = '';
  }

  updateMobileTriggerIcon() {
    if (!this.mobileNavTrigger) return;
    const activeBtn = document.querySelector('.view-nav__btn--active');
    if (!activeBtn) return;

    const iconContainer = this.mobileNavTrigger.querySelector('.mobile-nav-trigger__icon');
    if (!iconContainer) return;

    const svg = activeBtn.querySelector('.view-nav__icon')?.cloneNode(true);
    if (svg) {
      iconContainer.innerHTML = '';
      iconContainer.appendChild(svg);
    }
  }

  initDeepLink() {
    const hash = window.location.hash.slice(1);
    if (hash && this.views[hash]) {
      this.switchTo(hash, { animate: false });
    }
  }

  switchTo(view, options = { animate: true }) {
    if (view === this.currentView) return;
    if (!this.views[view]) return;

    const previousView = this.currentView;
    const fromView = this.views[previousView];
    const toView = this.views[view];

    if (!fromView || !toView) return;

    // Update button states
    this.navButtons.forEach(btn => {
      const isActive = btn.dataset.view === view;
      btn.classList.toggle('view-nav__btn--active', isActive);
    });

    // Update mobile trigger icon
    this.updateMobileTriggerIcon();

    // Update URL hash
    window.history.replaceState(null, '', `#${view}`);

    if (options.animate) {
      // Animate out current view
      fromView.classList.add('view--hiding');
      fromView.classList.remove('view--active');

      // Short delay for animation, then hide and show new view
      setTimeout(() => {
        fromView.classList.remove('view--hiding');
        fromView.classList.add('view--hidden');

        // Show and animate in new view
        toView.classList.remove('view--hidden');
        toView.classList.add('view--entering');
        toView.classList.add('view--active');

        setTimeout(() => {
          toView.classList.remove('view--entering');
        }, 300);
      }, 200);
    } else {
      // Instant switch (no animation)
      fromView.classList.remove('view--active');
      fromView.classList.add('view--hidden');
      toView.classList.remove('view--hidden');
      toView.classList.add('view--active');
    }

    this.currentView = view;

    // Emit event for other modules to react
    state.emit('viewChanged', { from: previousView, to: view });
  }

  toggle() {
    // Cycle through views: positions → journal → stats
    const viewOrder = ['positions', 'journal', 'stats'];
    const currentIndex = viewOrder.indexOf(this.currentView);
    const nextIndex = (currentIndex + 1) % viewOrder.length;
    this.switchTo(viewOrder[nextIndex]);
  }

  isStatsView() {
    return this.currentView === 'stats';
  }

  isPositionsView() {
    return this.currentView === 'positions';
  }

  isJournalView() {
    return this.currentView === 'journal';
  }

  // Navigate to a specific view (for use by other modules)
  navigateTo(view) {
    if (this.views[view] !== undefined) {
      this.switchTo(view);
    }
  }
}

export const viewManager = new ViewManager();
export { ViewManager };
