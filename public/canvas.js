// public/canvas.js
class DrawingCanvas {
  constructor(canvasId, socket) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.socket = socket;

    this.isDrawing = false;
    this.isDrawer = false;
    this.currentTool = 'brush';
    this.currentColor = '#000000';
    this.brushSize = 5;
    this.lastX = 0;
    this.lastY = 0;

    this.strokes = [];
    this.currentStroke = [];

    this.resizeCanvas();
    this.setupEvents();

    window.addEventListener('resize', () => this.resizeCanvas());
  }

  resizeCanvas() {
    const wrapper = this.canvas.parentElement;
    const rect = wrapper.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';

    this.ctx.scale(dpr, dpr);
    this.displayWidth = rect.width;
    this.displayHeight = rect.height;

    // Redraw
    this.redraw();
  }

  setupEvents() {
    // Mouse events
    this.canvas.addEventListener('mousedown', (e) => this.onPointerDown(e));
    this.canvas.addEventListener('mousemove', (e) => this.onPointerMove(e));
    this.canvas.addEventListener('mouseup', () => this.onPointerUp());
    this.canvas.addEventListener('mouseleave', () => this.onPointerUp());

    // Touch events
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      this.onPointerDown(touch);
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      this.onPointerMove(touch);
    }, { passive: false });

    this.canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.onPointerUp();
    }, { passive: false });
  }

  getPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / this.displayWidth,
      y: (e.clientY - rect.top) / this.displayHeight
    };
  }

  onPointerDown(e) {
    if (!this.isDrawer) return;

    this.isDrawing = true;
    const pos = this.getPos(e);
    this.lastX = pos.x;
    this.lastY = pos.y;

    this.currentStroke = [];

    const data = {
      type: 'start',
      x: pos.x,
      y: pos.y,
      color: this.currentTool === 'eraser' ? '#FFFFFF' : this.currentColor,
      size: this.currentTool === 'eraser' ? this.brushSize * 3 : this.brushSize,
      tool: this.currentTool
    };

    this.currentStroke.push(data);
    this.drawPoint(data);
    this.socket.emit('draw', data);
  }

  onPointerMove(e) {
    if (!this.isDrawing || !this.isDrawer) return;

    const pos = this.getPos(e);

    const data = {
      type: 'move',
      x: pos.x,
      y: pos.y,
      lastX: this.lastX,
      lastY: this.lastY,
      color: this.currentTool === 'eraser' ? '#FFFFFF' : this.currentColor,
      size: this.currentTool === 'eraser' ? this.brushSize * 3 : this.brushSize,
      tool: this.currentTool
    };

    this.currentStroke.push(data);
    this.drawLine(data);
    this.socket.emit('draw', data);

    this.lastX = pos.x;
    this.lastY = pos.y;
  }

  onPointerUp() {
    if (!this.isDrawing) return;
    this.isDrawing = false;

    if (this.currentStroke.length > 0) {
      this.strokes.push([...this.currentStroke]);
      this.currentStroke = [];
    }

    const data = { type: 'end' };
    this.socket.emit('draw', data);
  }

  drawPoint(data) {
    const x = data.x * this.displayWidth;
    const y = data.y * this.displayHeight;

    this.ctx.beginPath();
    this.ctx.arc(x, y, data.size / 2, 0, Math.PI * 2);
    this.ctx.fillStyle = data.color;
    this.ctx.fill();
  }

  drawLine(data) {
    const x = data.x * this.displayWidth;
    const y = data.y * this.displayHeight;
    const lastX = data.lastX * this.displayWidth;
    const lastY = data.lastY * this.displayHeight;

    this.ctx.beginPath();
    this.ctx.moveTo(lastX, lastY);
    this.ctx.lineTo(x, y);
    this.ctx.strokeStyle = data.color;
    this.ctx.lineWidth = data.size;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.stroke();
  }

  // Handle incoming draw events from other players
  handleRemoteDraw(data) {
    switch (data.type) {
      case 'start':
        this.drawPoint(data);
        break;
      case 'move':
        this.drawLine(data);
        break;
      case 'end':
        break;
    }
  }

  clear() {
    this.ctx.clearRect(0, 0, this.displayWidth, this.displayHeight);
    this.ctx.fillStyle = '#FFFFFF';
    this.ctx.fillRect(0, 0, this.displayWidth, this.displayHeight);
    this.strokes = [];
    this.currentStroke = [];
  }

  clearAndEmit() {
    this.clear();
    this.socket.emit('clearCanvas');
  }

  undo() {
    if (this.strokes.length === 0) return;
    this.strokes.pop();
    this.redraw();
    this.socket.emit('undo');
  }

  redraw() {
    this.ctx.clearRect(0, 0, this.displayWidth, this.displayHeight);
    this.ctx.fillStyle = '#FFFFFF';
    this.ctx.fillRect(0, 0, this.displayWidth, this.displayHeight);

    for (const stroke of this.strokes) {
      for (const data of stroke) {
        if (data.type === 'start') {
          this.drawPoint(data);
        } else if (data.type === 'move') {
          this.drawLine(data);
        }
      }
    }
  }

  // Load drawing data from server (for late joiners)
  loadDrawingData(drawingData) {
    for (const data of drawingData) {
      this.handleRemoteDraw(data);
    }
  }

  setTool(tool) {
    this.currentTool = tool;
    this.canvas.style.cursor = tool === 'eraser' ? 'cell' : 'crosshair';
  }

  setColor(color) {
    this.currentColor = color;
    if (this.currentTool === 'eraser') {
      this.currentTool = 'brush';
    }
  }

  setBrushSize(size) {
    this.brushSize = parseInt(size);
  }

  setDrawer(isDrawer) {
    this.isDrawer = isDrawer;
    this.canvas.style.cursor = isDrawer ? 'crosshair' : 'default';
    this.canvas.style.pointerEvents = isDrawer ? 'auto' : 'none';
  }

  // Fill tool (flood fill)
  floodFill(startX, startY, fillColor) {
    // Simplified flood fill
    const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    const data = imageData.data;
    const width = this.canvas.width;
    const height = this.canvas.height;

    const dpr = window.devicePixelRatio || 1;
    const px = Math.floor(startX * dpr);
    const py = Math.floor(startY * dpr);

    const startIdx = (py * width + px) * 4;
    const startR = data[startIdx];
    const startG = data[startIdx + 1];
    const startB = data[startIdx + 2];

    // Parse fill color
    const tempDiv = document.createElement('div');
    tempDiv.style.color = fillColor;
    document.body.appendChild(tempDiv);
    const computedColor = getComputedStyle(tempDiv).color;
    document.body.removeChild(tempDiv);
    const match = computedColor.match(/(\d+)/g);
    const fillR = parseInt(match[0]);
    const fillG = parseInt(match[1]);
    const fillB = parseInt(match[2]);

    if (startR === fillR && startG === fillG && startB === fillB) return;

    const stack = [[px, py]];
    const visited = new Set();

    while (stack.length > 0) {
      const [x, y] = stack.pop();
      const idx = (y * width + x) * 4;

      if (x < 0 || x >= width || y < 0 || y >= height) continue;
      if (visited.has(idx)) continue;

      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      if (Math.abs(r - startR) > 30 || Math.abs(g - startG) > 30 || Math.abs(b - startB) > 30) continue;

      visited.add(idx);
      data[idx] = fillR;
      data[idx + 1] = fillG;
      data[idx + 2] = fillB;
      data[idx + 3] = 255;

      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);

      if (visited.size > 500000) break; // Safety limit
    }

    this.ctx.putImageData(imageData, 0, 0);
  }
}