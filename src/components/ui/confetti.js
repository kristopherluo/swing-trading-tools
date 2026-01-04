/**
 * Confetti - Celebration rain effect
 * Duolingo-inspired full-width gentle raindown
 */

import { state } from '../../core/state.js';

class Confetti {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.particles = [];
    this.animationId = null;
    this.spawnQueue = 0;
    this.colors = [
      '#22c55e', // success green
      '#3b82f6', // primary blue
      '#f59e0b', // warning amber
      '#ec4899', // pink
      '#8b5cf6', // purple
      '#06b6d4', // cyan
      '#f97316'  // orange
    ];
  }

  init() {
    this.canvas = document.getElementById('confettiCanvas');
    if (this.canvas) {
      this.ctx = this.canvas.getContext('2d');
      this.resize();
      window.addEventListener('resize', () => this.resize());
    }

    // Listen for confetti trigger
    state.on('triggerConfetti', (data) => {
      const particleCount = data?.particleCount || 60;
      this.rain(particleCount);
    });
  }

  resize() {
    if (!this.canvas) return;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  rain(particleCount = 60) {
    if (!this.canvas || !this.ctx) return;

    // Check if reduced motion is preferred
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    // Queue particles to spawn over time for staggered effect
    this.spawnQueue += particleCount;

    // Start animation if not already running
    if (!this.animationId) {
      this.animate();
    }
  }

  createParticle() {
    const width = this.canvas.width;

    // Spawn across full width with some padding
    const x = Math.random() * width;
    const y = -20 - Math.random() * 40; // Start above viewport, staggered

    // Gentle downward drift with slight horizontal sway
    const vy = 2 + Math.random() * 2;
    const vx = (Math.random() - 0.5) * 1.5;

    // Varied sizes - mix of small and medium pieces
    const size = 5 + Math.random() * 6;

    // Confetti shapes: rectangles (streamers) and circles (dots)
    const shapeRoll = Math.random();
    let shape;
    if (shapeRoll < 0.6) {
      shape = 'streamer'; // Elongated rectangle
    } else if (shapeRoll < 0.85) {
      shape = 'square';
    } else {
      shape = 'circle';
    }

    return {
      x,
      y,
      vx,
      vy,
      size,
      color: this.colors[Math.floor(Math.random() * this.colors.length)],
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 6,
      wobble: Math.random() * Math.PI * 2, // Phase for sine wave wobble
      wobbleSpeed: 0.03 + Math.random() * 0.02,
      opacity: 0.9 + Math.random() * 0.1,
      shape
    };
  }

  animate() {
    if (!this.ctx || !this.canvas) return;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Spawn queued particles gradually (staggered rain effect)
    const spawnRate = Math.min(this.spawnQueue, 4); // Max 4 per frame
    for (let i = 0; i < spawnRate; i++) {
      this.particles.push(this.createParticle());
      this.spawnQueue--;
    }

    // Update and draw particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];

      // Gentle physics - no gravity acceleration, just drift
      p.wobble += p.wobbleSpeed;
      p.x += p.vx + Math.sin(p.wobble) * 0.5; // Gentle side-to-side sway
      p.y += p.vy;
      p.rotation += p.rotationSpeed;

      // Fade out as it falls past 70% of screen
      const fadeStart = this.canvas.height * 0.6;
      const fadeEnd = this.canvas.height * 0.95;
      if (p.y > fadeStart) {
        const fadeProgress = (p.y - fadeStart) / (fadeEnd - fadeStart);
        p.opacity = Math.max(0, 0.9 - fadeProgress);
      }

      // Draw if visible
      if (p.opacity > 0 && p.y < this.canvas.height) {
        this.ctx.save();
        this.ctx.translate(p.x, p.y);
        this.ctx.rotate((p.rotation * Math.PI) / 180);
        this.ctx.globalAlpha = p.opacity;
        this.ctx.fillStyle = p.color;

        if (p.shape === 'streamer') {
          // Elongated rectangle (classic confetti streamer)
          this.ctx.fillRect(-p.size / 2, -p.size / 6, p.size, p.size / 3);
        } else if (p.shape === 'square') {
          this.ctx.fillRect(-p.size / 3, -p.size / 3, p.size * 0.66, p.size * 0.66);
        } else {
          // Circle
          this.ctx.beginPath();
          this.ctx.arc(0, 0, p.size / 3, 0, Math.PI * 2);
          this.ctx.fill();
        }

        this.ctx.restore();
      } else {
        // Remove particle when faded or off screen
        this.particles.splice(i, 1);
      }
    }

    // Continue animation if particles remain or more to spawn
    if (this.particles.length > 0 || this.spawnQueue > 0) {
      this.animationId = requestAnimationFrame(() => this.animate());
    } else {
      this.animationId = null;
    }
  }
}

export const confetti = new Confetti();
export { Confetti };
