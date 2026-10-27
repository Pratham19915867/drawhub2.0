// public/confetti.js
class ConfettiManager {
  constructor() {
    this.canvas = document.getElementById('confettiCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.particles = [];
    this.animating = false;

    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
  }

  resizeCanvas() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  createParticle(x, y) {
    const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff',
      '#ff6b00', '#6c5ce7', '#00cec9', '#fd79a8', '#fdcb6e', '#e17055'];

    return {
      x: x || Math.random() * this.canvas.width,
      y: y || -10,
      size: Math.random() * 8 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      speedX: (Math.random() - 0.5) * 10,
      speedY: Math.random() * 3 + 2,
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 10,
      opacity: 1,
      shape: Math.random() > 0.5 ? 'rect' : 'circle'
    };
  }

  burst(x, y, count = 50) {
    for (let i = 0; i < count; i++) {
      const p = this.createParticle(x, y);
      p.speedX = (Math.random() - 0.5) * 20;
      p.speedY = (Math.random() - 0.5) * 20;
      this.particles.push(p);
    }
    if (!this.animating) this.animate();
  }

  rain(duration = 3000) {
    const interval = setInterval(() => {
      for (let i = 0; i < 5; i++) {
        this.particles.push(this.createParticle());
      }
    }, 50);

    setTimeout(() => clearInterval(interval), duration);
    if (!this.animating) this.animate();
  }

  celebrate() {
    // Big celebration for game end
    this.rain(5000);
    setTimeout(() => this.burst(this.canvas.width / 2, this.canvas.height / 3, 100), 500);
    setTimeout(() => this.burst(this.canvas.width / 4, this.canvas.height / 2, 80), 1000);
    setTimeout(() => this.burst(this.canvas.width * 3 / 4, this.canvas.height / 2, 80), 1500);
  }

  animate() {
    this.animating = true;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];

      p.x += p.speedX;
      p.y += p.speedY;
      p.speedY += 0.1; // gravity
      p.rotation += p.rotationSpeed;
      p.opacity -= 0.005;
      p.speedX *= 0.99;

      if (p.opacity <= 0 || p.y > this.canvas.height + 20) {
        this.particles.splice(i, 1);
        continue;
      }

      this.ctx.save();
      this.ctx.translate(p.x, p.y);
      this.ctx.rotate((p.rotation * Math.PI) / 180);
      this.ctx.globalAlpha = p.opacity;
      this.ctx.fillStyle = p.color;

      if (p.shape === 'rect') {
        this.ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      } else {
        this.ctx.beginPath();
        this.ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        this.ctx.fill();
      }

      this.ctx.restore();
    }

    if (this.particles.length > 0) {
      requestAnimationFrame(() => this.animate());
    } else {
      this.animating = false;
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }
}

const confettiManager = new ConfettiManager();