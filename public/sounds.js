// public/sounds.js
class SoundManager {
  constructor() {
    this.audioCtx = null;
    this.enabled = true;
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;
    try {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      this.initialized = true;
    } catch (e) {
      console.log('Audio not supported');
    }
  }

  playTone(frequency, duration, type = 'sine', volume = 0.2) {
    if (!this.audioCtx || !this.enabled) return;

    const oscillator = this.audioCtx.createOscillator();
    const gainNode = this.audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(this.audioCtx.destination);

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, this.audioCtx.currentTime);

    gainNode.gain.setValueAtTime(volume, this.audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + duration);

    oscillator.start(this.audioCtx.currentTime);
    oscillator.stop(this.audioCtx.currentTime + duration);
  }

  playJoin() {
    this.playTone(523.25, 0.15, 'sine', 0.15);
    setTimeout(() => this.playTone(659.25, 0.15, 'sine', 0.15), 100);
    setTimeout(() => this.playTone(783.99, 0.2, 'sine', 0.15), 200);
  }

  playCorrectGuess() {
    this.playTone(523.25, 0.1, 'sine', 0.2);
    setTimeout(() => this.playTone(659.25, 0.1, 'sine', 0.2), 80);
    setTimeout(() => this.playTone(783.99, 0.1, 'sine', 0.2), 160);
    setTimeout(() => this.playTone(1046.50, 0.3, 'sine', 0.2), 240);
  }

  playWrongGuess() {
    this.playTone(200, 0.15, 'sawtooth', 0.05);
  }

  playTimerTick() {
    this.playTone(800, 0.05, 'sine', 0.1);
  }

  playTimerWarning() {
    this.playTone(440, 0.1, 'square', 0.08);
    setTimeout(() => this.playTone(440, 0.1, 'square', 0.08), 200);
  }

  playTurnEnd() {
    this.playTone(600, 0.15, 'sine', 0.15);
    setTimeout(() => this.playTone(500, 0.15, 'sine', 0.15), 100);
    setTimeout(() => this.playTone(400, 0.3, 'sine', 0.15), 200);
  }

  playGameStart() {
    const notes = [523.25, 587.33, 659.25, 783.99, 1046.50];
    notes.forEach((note, i) => {
      setTimeout(() => this.playTone(note, 0.15, 'sine', 0.15), i * 100);
    });
  }

  playVictory() {
    const melody = [523, 523, 523, 659, 783, 783, 659, 523, 659, 783, 1046];
    melody.forEach((note, i) => {
      setTimeout(() => this.playTone(note, 0.2, 'sine', 0.12), i * 120);
    });
  }

  playMessage() {
    this.playTone(1200, 0.05, 'sine', 0.05);
  }

  playClose() {
    this.playTone(500, 0.1, 'triangle', 0.1);
    setTimeout(() => this.playTone(600, 0.15, 'triangle', 0.1), 100);
  }

  playCountdown() {
    this.playTone(1000, 0.08, 'sine', 0.15);
  }
}

const soundManager = new SoundManager();