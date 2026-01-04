/**
 * SoundFX - Web Audio API sound effects for UI feedback
 */

import { state } from '../../core/state.js';

class SoundFX {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.warmedUp = false;
  }

  init() {
    this.enabled = state.journalMeta.settings.soundEnabled || false;

    // Listen for settings changes
    document.addEventListener('journalMetaSettingsChanged', () => {
      this.enabled = state.journalMeta.settings.soundEnabled || false;
    });

    // Warm up audio context on first user interaction
    const warmup = () => {
      if (this.warmedUp) return;
      this.warmup();
      document.removeEventListener('click', warmup);
      document.removeEventListener('touchstart', warmup);
      document.removeEventListener('keydown', warmup);
    };

    document.addEventListener('click', warmup, { once: false, passive: true });
    document.addEventListener('touchstart', warmup, { once: false, passive: true });
    document.addEventListener('keydown', warmup, { once: false, passive: true });
  }

  warmup() {
    if (this.warmedUp) return;

    // Create and resume context
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    // Play a silent sound to fully initialize the audio pipeline
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, this.ctx.currentTime); // Silent
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.001);

    this.warmedUp = true;
  }

  ensureContext() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  // Premium success chime - ascending major arpeggio with shimmer
  playSuccess() {
    if (!this.enabled) return;
    const ctx = this.ensureContext();
    const now = ctx.currentTime;

    // Base frequencies for C major arpeggio (C5, E5, G5, C6)
    const notes = [523.25, 659.25, 783.99, 1046.50];
    const baseGain = 0.12;

    notes.forEach((freq, i) => {
      const startTime = now + i * 0.08;

      // Main tone
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      // Subtle detune for richness
      osc.detune.setValueAtTime(Math.random() * 6 - 3, startTime);

      // Warm low-pass filter
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(freq * 3, startTime);
      filter.Q.setValueAtTime(1, startTime);

      // ADSR envelope
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(baseGain * (1 - i * 0.15), startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.6);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.7);

      // Add shimmer harmonic (octave above, quieter)
      const shimmer = ctx.createOscillator();
      const shimmerGain = ctx.createGain();

      shimmer.type = 'sine';
      shimmer.frequency.setValueAtTime(freq * 2, startTime);

      shimmerGain.gain.setValueAtTime(0, startTime);
      shimmerGain.gain.linearRampToValueAtTime(baseGain * 0.15, startTime + 0.02);
      shimmerGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.4);

      shimmer.connect(shimmerGain);
      shimmerGain.connect(ctx.destination);

      shimmer.start(startTime);
      shimmer.stop(startTime + 0.5);
    });
  }

  // Achievement unlock - triumphant fanfare with rich harmonics
  playAchievement() {
    if (!this.enabled) return;
    const ctx = this.ensureContext();
    const now = ctx.currentTime;

    // Triumphant interval: fifth then octave (G4 -> D5 -> G5)
    const sequence = [
      { freq: 392.00, time: 0, duration: 0.15 },      // G4
      { freq: 587.33, time: 0.12, duration: 0.15 },   // D5
      { freq: 783.99, time: 0.25, duration: 0.5 },    // G5 (held)
    ];

    const baseGain = 0.14;

    sequence.forEach(note => {
      const startTime = now + note.time;

      // Main tone with triangle for warmth
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(note.freq, startTime);

      // Second oscillator slightly detuned for chorus effect
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(note.freq * 1.002, startTime);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(note.freq * 4, startTime);
      filter.Q.setValueAtTime(0.5, startTime);

      // Envelope
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(baseGain, startTime + 0.015);
      gain.gain.setValueAtTime(baseGain * 0.8, startTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + note.duration + 0.3);

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(startTime);
      osc2.start(startTime);
      osc1.stop(startTime + note.duration + 0.4);
      osc2.stop(startTime + note.duration + 0.4);

      // Add fifth harmonic for richness on final note
      if (note.duration > 0.3) {
        const fifth = ctx.createOscillator();
        const fifthGain = ctx.createGain();

        fifth.type = 'sine';
        fifth.frequency.setValueAtTime(note.freq * 1.5, startTime);

        fifthGain.gain.setValueAtTime(0, startTime);
        fifthGain.gain.linearRampToValueAtTime(baseGain * 0.3, startTime + 0.05);
        fifthGain.gain.exponentialRampToValueAtTime(0.001, startTime + note.duration + 0.2);

        fifth.connect(fifthGain);
        fifthGain.connect(ctx.destination);

        fifth.start(startTime);
        fifth.stop(startTime + note.duration + 0.3);
      }
    });
  }

  // Subtle click for UI feedback
  playClick() {
    if (!this.enabled) return;
    const ctx = this.ensureContext();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1800, now);
    osc.frequency.exponentialRampToValueAtTime(1200, now + 0.03);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2000, now);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.06);
  }

  // Celebration sound - sparkly ascending run (pairs with confetti)
  playCelebration() {
    if (!this.enabled) return;
    const ctx = this.ensureContext();
    const now = ctx.currentTime;

    // Quick ascending sparkle run
    const notes = [659.25, 783.99, 987.77, 1174.66, 1318.51, 1567.98];
    const baseGain = 0.06;

    notes.forEach((freq, i) => {
      const startTime = now + i * 0.05;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(baseGain, startTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.3);
    });
  }
}

export const soundFx = new SoundFX();

// Debug functions for testing sounds
window.testSound = (type) => {
  const original = soundFx.enabled;
  soundFx.enabled = true;

  switch(type) {
    case 'success': soundFx.playSuccess(); break;
    case 'achievement': soundFx.playAchievement(); break;
    case 'click': soundFx.playClick(); break;
    case 'celebration': soundFx.playCelebration(); break;
    default:
      console.log('Usage: testSound("success" | "achievement" | "click" | "celebration")');
      soundFx.enabled = original;
      return;
  }

  soundFx.enabled = original;
  console.log(`Played: ${type}`);
};
