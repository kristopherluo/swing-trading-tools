/**
 * Achievements - Track and unlock achievements for trade logging
 * MVP: 3 achievements (First Steps, Day One, Hot Streak)
 */

import { state } from '../../core/state.js';
import { showToast } from './ui.js';
import { confetti } from './confetti.js';
import { soundFx } from './soundFx.js';

// Achievement definitions
const ACHIEVEMENTS = {
  first_steps: {
    id: 'first_steps',
    name: 'First Steps',
    description: 'Log your first trade',
    icon: '🎯',
    check: (progress) => progress.totalTrades >= 1
  },
  day_one: {
    id: 'day_one',
    name: 'Day One',
    description: 'Log a trade today',
    icon: '📅',
    check: (progress) => {
      const today = new Date().toDateString();
      const lastDate = progress.lastTradeDate ? new Date(progress.lastTradeDate).toDateString() : null;
      return lastDate === today;
    }
  },
  hot_streak: {
    id: 'hot_streak',
    name: 'Hot Streak',
    description: '3-day logging streak',
    icon: '🔥',
    check: (progress) => progress.currentStreak >= 3
  }
};

// Future achievements (not yet active)
const FUTURE_ACHIEVEMENTS = {
  getting_started: {
    id: 'getting_started',
    name: 'Getting Started',
    description: 'Log 5 trades',
    icon: '📈',
    check: (progress) => progress.totalTrades >= 5
  },
  first_win: {
    id: 'first_win',
    name: 'First Win',
    description: 'Close a trade in profit',
    icon: '💰',
    check: (progress) => false // Requires closed trade tracking
  },
  committed: {
    id: 'committed',
    name: 'Committed',
    description: 'Log 25 trades',
    icon: '🏆',
    check: (progress) => progress.totalTrades >= 25
  },
  on_fire: {
    id: 'on_fire',
    name: 'On Fire',
    description: '7-day logging streak',
    icon: '🌟',
    check: (progress) => progress.currentStreak >= 7
  }
};

class AchievementManager {
  constructor() {
    this.achievements = ACHIEVEMENTS;
    this.queue = []; // Queue for showing achievements
  }

  init() {
    // Listen for trade logged events
    state.on('tradeLogged', () => this.checkAchievements());
    state.on('streakUpdated', () => this.checkAchievements());
  }

  checkAchievements() {
    const progress = state.journalMeta.achievements.progress;

    // Check each achievement
    Object.values(this.achievements).forEach(achievement => {
      // Skip if already unlocked
      if (state.isAchievementUnlocked(achievement.id)) return;

      // Check condition
      if (achievement.check(progress)) {
        this.unlock(achievement);
      }
    });
  }

  unlock(achievement) {
    // Add to unlocked list
    const unlocked = state.unlockAchievement(achievement.id);

    if (unlocked) {
      // Queue the achievement notification
      this.queue.push(achievement);

      // Show immediately if first in queue
      if (this.queue.length === 1) {
        this.showNext();
      }

      // Trigger confetti and sound if celebrations enabled
      if (state.journalMeta.settings.celebrationsEnabled) {
        confetti.rain(30); // Achievement celebration
      }

      // Play achievement sound if sound enabled
      if (state.journalMeta.settings.soundEnabled) {
        soundFx.playAchievement();
      }
    }
  }

  showNext() {
    if (this.queue.length === 0) return;

    const achievement = this.queue[0];

    // Show achievement toast
    this.showAchievementToast(achievement);

    // Mark as notified
    state.markAchievementNotified(achievement.id);

    // Remove from queue and show next after delay
    setTimeout(() => {
      this.queue.shift();
      if (this.queue.length > 0) {
        this.showNext();
      }
    }, 3500);
  }

  showAchievementToast(achievement) {
    // Create custom achievement toast
    const container = document.getElementById('toastContainerTop') ||
                      document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast toast--achievement';
    toast.innerHTML = `
      <span class="toast__icon">${achievement.icon}</span>
      <div class="toast__content">
        <strong class="toast__title">Achievement Unlocked!</strong>
        <span class="toast__text">${achievement.name}</span>
      </div>
      <button class="toast__close" aria-label="Close">×</button>
    `;

    // Close button
    toast.querySelector('.toast__close')?.addEventListener('click', () => {
      toast.classList.add('toast--hiding');
      setTimeout(() => toast.remove(), 300);
    });

    container.appendChild(toast);

    // Auto remove
    setTimeout(() => {
      if (toast.parentElement) {
        toast.classList.add('toast--hiding');
        setTimeout(() => toast.remove(), 300);
      }
    }, 3000);
  }

  // Get all achievements with unlock status
  getAll() {
    return Object.values(this.achievements).map(achievement => ({
      ...achievement,
      unlocked: state.isAchievementUnlocked(achievement.id),
      unlockedAt: state.journalMeta.achievements.unlocked
        .find(a => a.id === achievement.id)?.unlockedAt
    }));
  }

  // Get unlocked count
  getUnlockedCount() {
    return state.journalMeta.achievements.unlocked.length;
  }

  // Get total count
  getTotalCount() {
    return Object.keys(this.achievements).length;
  }
}

export const achievements = new AchievementManager();
export { AchievementManager, ACHIEVEMENTS };
