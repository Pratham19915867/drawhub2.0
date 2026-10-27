// public/app.js
(function () {
  'use strict';

  // ===== SOCKET CONNECTION =====
  const socket = io();

  // ===== STATE =====
  let myId = null;
  let myName = '';
  let myAvatar = '🎨';
  let currentRoomCode = '';
  let isHost = false;
  let isDrawer = false;
  let gameState = 'home';
  let maxRounds = 5;
  let maxTime = 280;
  let chooseTimerInterval = null;

  // ===== CANVAS =====
  let drawCanvas = null;

  // ===== DOM ELEMENTS =====
  const screens = {
    home: document.getElementById('screen-home'),
    lobby: document.getElementById('screen-lobby'),
    game: document.getElementById('screen-game')
  };

  // Home
  const playerNameInput = document.getElementById('playerName');
  const roomCodeInput = document.getElementById('roomCodeInput');
  const btnCreateRoom = document.getElementById('btnCreateRoom');
  const btnJoinRoom = document.getElementById('btnJoinRoom');
  const avatarGrid = document.getElementById('avatarGrid');

  // Lobby
  const lobbyRoomCode = document.getElementById('lobbyRoomCode');
  const btnCopyCode = document.getElementById('btnCopyCode');
  const lobbyPlayersList = document.getElementById('lobbyPlayersList');
  const playerCount = document.getElementById('playerCount');
  const btnStartGame = document.getElementById('btnStartGame');
  const waitingText = document.getElementById('waitingText');
  const lobbySettings = document.getElementById('lobbySettings');
  const roundsValue = document.getElementById('roundsValue');
  const timeValue = document.getElementById('timeValue');

  // Game
  const currentRound = document.getElementById('currentRound');
  const totalRounds = document.getElementById('totalRounds');
  const wordHint = document.getElementById('wordHint');
  const timerText = document.getElementById('timerText');
  const timerProgress = document.getElementById('timerProgress');
  const gamePlayersList = document.getElementById('gamePlayersList');
  const drawingTools = document.getElementById('drawingTools');
  const chatMessages = document.getElementById('chatMessages');
  const chatInput = document.getElementById('chatInput');
  const btnSend = document.getElementById('btnSend');

  // Overlays
  const overlayChoosing = document.getElementById('overlayChoosing');
  const overlayWordSelect = document.getElementById('overlayWordSelect');
  const drawerNameChoosing = document.getElementById('drawerNameChoosing');
  const wordOptions = document.getElementById('wordOptions');
  const chooseTimerText = document.getElementById('chooseTimerText');

  // Popups
  const popupTurnEnd = document.getElementById('popupTurnEnd');
  const popupGameEnd = document.getElementById('popupGameEnd');
  const popupCorrectGuess = document.getElementById('popupCorrectGuess');

  // ===== PARTICLES =====
  function createParticles() {
    const container = document.getElementById('particles');
    const colors = ['#6c5ce7', '#00cec9', '#fd79a8', '#fdcb6e', '#a29bfe'];

    for (let i = 0; i < 30; i++) {
      const particle = document.createElement('div');
      particle.className = 'particle';
      const size = Math.random() * 6 + 2;
      particle.style.width = size + 'px';
      particle.style.height = size + 'px';
      particle.style.background = colors[Math.floor(Math.random() * colors.length)];
      particle.style.left = Math.random() * 100 + '%';
      particle.style.animationDuration = (Math.random() * 20 + 10) + 's';
      particle.style.animationDelay = (Math.random() * 20) + 's';
      container.appendChild(particle);
    }
  }
  createParticles();

  // ===== SCREEN MANAGEMENT =====
  function showScreen(screenName) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[screenName].classList.add('active');
    gameState = screenName;
  }

  // ===== AVATAR SELECTION =====
  avatarGrid.addEventListener('click', (e) => {
    const option = e.target.closest('.avatar-option');
    if (!option) return;

    avatarGrid.querySelectorAll('.avatar-option').forEach(o => o.classList.remove('selected'));
    option.classList.add('selected');
    myAvatar = option.dataset.avatar;
  });

  // ===== HOME SCREEN ACTIONS =====
  btnCreateRoom.addEventListener('click', () => {
    const name = playerNameInput.value.trim();
    if (!name) {
      shakeElement(playerNameInput);
      return;
    }
    myName = name;
    soundManager.init();
    socket.emit('createRoom', { name: myName, avatar: myAvatar, maxRounds });
  });

  btnJoinRoom.addEventListener('click', () => {
    const name = playerNameInput.value.trim();
    const code = roomCodeInput.value.trim().toUpperCase();
    if (!name) {
      shakeElement(playerNameInput);
      return;
    }
    if (!code || code.length < 4) {
      shakeElement(roomCodeInput);
      return;
    }
    myName = name;
    soundManager.init();
    socket.emit('joinRoom', { name: myName, avatar: myAvatar, roomCode: code });
  });

  // Enter key handling
  playerNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      if (roomCodeInput.value.trim()) {
        btnJoinRoom.click();
      } else {
        btnCreateRoom.click();
      }
    }
  });

  roomCodeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnJoinRoom.click();
  });

  function shakeElement(el) {
    el.style.animation = 'none';
    el.offsetHeight; // trigger reflow
    el.style.animation = 'shake 0.4s ease';
    setTimeout(() => el.style.animation = '', 400);

    // Add temporary red border
    el.style.borderColor = '#e17055';
    setTimeout(() => el.style.borderColor = '', 1000);
  }

  // Add shake animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-8px); }
      50% { transform: translateX(8px); }
      75% { transform: translateX(-8px); }
    }
  `;
  document.head.appendChild(style);

  // ===== LOBBY =====
  btnCopyCode.addEventListener('click', () => {
    navigator.clipboard.writeText(currentRoomCode).then(() => {
      btnCopyCode.textContent = '✅';
      setTimeout(() => btnCopyCode.textContent = '📋', 2000);
    }).catch(() => {
      // Fallback
      const textArea = document.createElement('textarea');
      textArea.value = currentRoomCode;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      btnCopyCode.textContent = '✅';
      setTimeout(() => btnCopyCode.textContent = '📋', 2000);
    });
  });

  btnStartGame.addEventListener('click', () => {
    socket.emit('startGame');
  });

  // Settings controls
  document.getElementById('roundsMinus').addEventListener('click', () => {
    if (maxRounds > 1) {
      maxRounds--;
      roundsValue.textContent = maxRounds;
      socket.emit('updateSettings', { maxRounds });
    }
  });

  document.getElementById('roundsPlus').addEventListener('click', () => {
    if (maxRounds < 10) {
      maxRounds++;
      roundsValue.textContent = maxRounds;
      socket.emit('updateSettings', { maxRounds });
    }
  });

  document.getElementById('timeMinus').addEventListener('click', () => {
    if (maxTime > 30) {
      maxTime -= 30;
      timeValue.textContent = maxTime + 's';
      socket.emit('updateSettings', { maxTime });
    }
  });

  document.getElementById('timePlus').addEventListener('click', () => {
    if (maxTime < 300) {
      maxTime += 30;
      timeValue.textContent = maxTime + 's';
      socket.emit('updateSettings', { maxTime });
    }
  });

  function renderLobbyPlayers(players) {
    lobbyPlayersList.innerHTML = '';
    playerCount.textContent = players.length;

    players.forEach(p => {
      const card = document.createElement('div');
      card.className = 'player-card-lobby';
      card.innerHTML = `
        <div class="player-avatar">${p.avatar}</div>
        <div class="player-name">${escapeHtml(p.name)}</div>
        ${p.isHost ? '<span class="host-badge">👑 HOST</span>' : ''}
      `;
      lobbyPlayersList.appendChild(card);
    });
  }

  // ===== GAME SCREEN =====
  function renderGamePlayers(players) {
    gamePlayersList.innerHTML = '';

    const sorted = [...players].sort((a, b) => b.score - a.score);

    sorted.forEach((p, i) => {
      const item = document.createElement('div');
      item.className = 'player-item';
      if (p.isDrawing) item.classList.add('drawing');
      if (p.hasGuessed) item.classList.add('guessed');

      let status = '';
      if (p.isDrawing) status = '🖌️';
      else if (p.hasGuessed) status = '✅';

      item.innerHTML = `
        <span class="player-avatar-sm">${p.avatar}</span>
        <div class="player-info">
          <div class="player-name-sm">${escapeHtml(p.name)}</div>
          <div class="player-score-sm">${p.score} pts</div>
        </div>
        <span class="player-status">${status}</span>
      `;
      gamePlayersList.appendChild(item);
    });
  }

  // ===== CHAT =====
  function addChatMessage(data) {
    const msg = document.createElement('div');
    msg.className = `chat-msg ${data.type || ''}`;

    if (data.type === 'system' || data.type === 'correct' || data.type === 'info' || data.type === 'warning') {
      msg.textContent = data.message;
    } else {
      msg.innerHTML = `<span class="msg-name" style="color: ${getNameColor(data.playerName)}">${escapeHtml(data.playerName)}:</span> ${escapeHtml(data.message)}`;
    }

    chatMessages.appendChild(msg);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    if (data.type !== 'system') {
      soundManager.playMessage();
    }
  }

  function getNameColor(name) {
    const colors = ['#ff6b6b', '#48dbfb', '#feca57', '#ff9ff3', '#54a0ff',
      '#5f27cd', '#01a3a4', '#f368e0', '#ff6348', '#7bed9f'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  // Send chat message
  function sendMessage() {
    const msg = chatInput.value.trim();
    if (!msg) return;

    socket.emit('chatMessage', { message: msg });
    chatInput.value = '';
  }

  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendMessage();
  });
  btnSend.addEventListener('click', sendMessage);

  // ===== DRAWING TOOLS =====
  function setupDrawingTools() {
    // Color palette
    document.getElementById('colorPalette').addEventListener('click', (e) => {
      const swatch = e.target.closest('.color-swatch');
      if (!swatch) return;

      document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
      swatch.classList.add('selected');
      drawCanvas.setColor(swatch.dataset.color);

      // Switch to brush
      document.getElementById('btnBrush').classList.add('active');
      document.getElementById('btnEraser').classList.remove('active');
      drawCanvas.setTool('brush');
    });

    // Brush size
    document.getElementById('brushSize').addEventListener('input', (e) => {
      drawCanvas.setBrushSize(e.target.value);
      document.getElementById('brushSizeLabel').textContent = e.target.value;
    });

    // Tool buttons
    document.getElementById('btnBrush').addEventListener('click', () => {
      drawCanvas.setTool('brush');
      document.getElementById('btnBrush').classList.add('active');
      document.getElementById('btnEraser').classList.remove('active');
      document.getElementById('btnFill').classList.remove('active');
    });

    document.getElementById('btnEraser').addEventListener('click', () => {
      drawCanvas.setTool('eraser');
      document.getElementById('btnEraser').classList.add('active');
      document.getElementById('btnBrush').classList.remove('active');
      document.getElementById('btnFill').classList.remove('active');
    });

    document.getElementById('btnFill').addEventListener('click', () => {
      drawCanvas.setTool('fill');
      document.getElementById('btnFill').classList.add('active');
      document.getElementById('btnBrush').classList.remove('active');
      document.getElementById('btnEraser').classList.remove('active');
    });

    document.getElementById('btnUndo').addEventListener('click', () => {
      drawCanvas.undo();
    });

    document.getElementById('btnClear').addEventListener('click', () => {
      drawCanvas.clearAndEmit();
    });
  }

  // ===== TIMER UPDATE =====
  function updateTimerDisplay(timeLeft, maxTimeVal) {
    timerText.textContent = timeLeft;

    const percent = (timeLeft / maxTimeVal) * 100;
    timerProgress.style.strokeDasharray = `${percent}, 100`;

    timerProgress.classList.remove('warning', 'danger');
    if (timeLeft <= 30) {
      timerProgress.classList.add('danger');
      if (timeLeft <= 10) soundManager.playCountdown();
    } else if (timeLeft <= 60) {
      timerProgress.classList.add('warning');
    }
  }

  // ===== SOCKET EVENT HANDLERS =====

  // Room created
  socket.on('roomCreated', (data) => {
    myId = socket.id;
    currentRoomCode = data.roomCode;
    isHost = true;

    lobbyRoomCode.textContent = currentRoomCode;
    btnStartGame.style.display = 'block';
    waitingText.style.display = 'none';
    lobbySettings.style.display = 'block';

    renderLobbyPlayers(data.players);
    showScreen('lobby');
    soundManager.playJoin();
  });

  // Room joined
  socket.on('roomJoined', (data) => {
    myId = socket.id;
    currentRoomCode = data.roomCode;
    isHost = data.player.isHost;

    if (data.gameInProgress) {
      // Join mid-game
      showScreen('game');
      initGameCanvas();

      if (data.drawingData && data.drawingData.length > 0) {
        drawCanvas.loadDrawingData(data.drawingData);
      }

      updateTimerDisplay(data.timeLeft, maxTime);
      currentRound.textContent = data.roundNumber;
      totalRounds.textContent = data.maxRounds;
      wordHint.textContent = data.hint || 'Waiting...';
      renderGamePlayers(data.players);

      drawCanvas.setDrawer(false);
      drawingTools.style.display = 'none';
    } else {
      lobbyRoomCode.textContent = currentRoomCode;
      btnStartGame.style.display = isHost ? 'block' : 'none';
      waitingText.style.display = isHost ? 'none' : 'block';
      lobbySettings.style.display = isHost ? 'block' : 'none';

      renderLobbyPlayers(data.players);
      showScreen('lobby');
    }

    soundManager.playJoin();
  });

  // Player joined
  socket.on('playerJoined', (data) => {
    if (gameState === 'lobby') {
      renderLobbyPlayers(data.players);
    }
    renderGamePlayers(data.players);

    addChatMessage({
      type: 'info',
      message: data.message
    });

    soundManager.playJoin();
  });

  // Player left
  socket.on('playerLeft', (data) => {
    if (gameState === 'lobby') {
      renderLobbyPlayers(data.players);
    }
    renderGamePlayers(data.players);

    addChatMessage({
      type: 'warning',
      message: data.message
    });
  });

  // You are host
  socket.on('youAreHost', (data) => {
    isHost = true;
    if (gameState === 'lobby') {
      btnStartGame.style.display = 'block';
      waitingText.style.display = 'none';
      lobbySettings.style.display = 'block';
    }
    addChatMessage({ type: 'system', message: data.message });
  });

  // Settings updated
  socket.on('settingsUpdated', (data) => {
    maxRounds = data.maxRounds;
    maxTime = data.maxTime;
    roundsValue.textContent = maxRounds;
    timeValue.textContent = maxTime + 's';
    totalRounds.textContent = maxRounds;
  });

  // Game started
  socket.on('gameStarted', (data) => {
    showScreen('game');
    initGameCanvas();
    soundManager.playGameStart();

    addChatMessage({
      type: 'system',
      message: '🎮 Game Started!'
    });

    renderGamePlayers(data.players);
  });

  function initGameCanvas() {
    if (!drawCanvas) {
      drawCanvas = new DrawingCanvas('gameCanvas', socket);
      setupDrawingTools();
    }
    drawCanvas.clear();
    drawCanvas.setDrawer(false);
    drawingTools.style.display = 'none';
  }

  // New turn
  socket.on('newTurn', (data) => {
    drawCanvas.clear();
    drawCanvas.strokes = [];

    currentRound.textContent = data.roundNumber;
    totalRounds.textContent = data.maxRounds;
    renderGamePlayers(data.players);

    wordHint.textContent = 'Waiting...';
    updateTimerDisplay(maxTime, maxTime);

    isDrawer = data.drawer.id === myId;

    if (isDrawer) {
      // Show word selection overlay
      overlayChoosing.style.display = 'none';
      drawCanvas.setDrawer(false); // Not yet
      drawingTools.style.display = 'none';
    } else {
      // Show "player is choosing" overlay
      drawerNameChoosing.textContent = data.drawer.name;
      overlayChoosing.style.display = 'flex';
      overlayWordSelect.style.display = 'none';
      drawCanvas.setDrawer(false);
      drawingTools.style.display = 'none';
    }

    addChatMessage({
      type: 'system',
      message: `🖌️ ${data.drawer.name} is choosing a word...`
    });

    // Hide previous popups
    popupTurnEnd.style.display = 'none';
    popupCorrectGuess.style.display = 'none';
  });

  // Word choices (for drawer)
  socket.on('wordChoices', (data) => {
    overlayWordSelect.style.display = 'flex';
    overlayChoosing.style.display = 'none';

    wordOptions.innerHTML = '';
    data.words.forEach(word => {
      const btn = document.createElement('button');
      btn.className = 'word-option-btn';
      btn.textContent = word;
      btn.addEventListener('click', () => {
        socket.emit('selectWord', { word });
        overlayWordSelect.style.display = 'none';
        if (chooseTimerInterval) clearInterval(chooseTimerInterval);
      });
      wordOptions.appendChild(btn);
    });

    // Choose countdown
    let chooseTime = data.timeToChoose;
    chooseTimerText.textContent = chooseTime;
    if (chooseTimerInterval) clearInterval(chooseTimerInterval);
    chooseTimerInterval = setInterval(() => {
      chooseTime--;
      chooseTimerText.textContent = chooseTime;
      if (chooseTime <= 0) clearInterval(chooseTimerInterval);
    }, 1000);
  });

  // Drawing started
  socket.on('drawingStarted', (data) => {
    overlayChoosing.style.display = 'none';
    overlayWordSelect.style.display = 'none';

    wordHint.textContent = data.hint;
    updateTimerDisplay(data.timeLeft, maxTime);

    isDrawer = data.drawer === myId;

    if (isDrawer) {
      drawCanvas.setDrawer(true);
      drawingTools.style.display = 'block';
      chatInput.disabled = false;
      chatInput.placeholder = "You're drawing! Chat here...";
    } else {
      drawCanvas.setDrawer(false);
      drawingTools.style.display = 'none';
      chatInput.disabled = false;
      chatInput.placeholder = "Type your guess here...";
    }

    chatInput.focus();
  });

  // Your word (drawer only)
  socket.on('yourWord', (data) => {
    wordHint.textContent = data.word.toUpperCase();
    wordHint.style.color = '#00b894';

    addChatMessage({
      type: 'system',
      message: `Your word is: ${data.word.toUpperCase()}`
    });
  });

  // Timer update
  socket.on('timerUpdate', (data) => {
    updateTimerDisplay(data.timeLeft, maxTime);
  });

  // Hint update
  socket.on('hintUpdate', (data) => {
    if (!isDrawer) {
      wordHint.textContent = data.hint;
    }
  });

  // Draw event from other player
  socket.on('draw', (data) => {
    if (drawCanvas) {
      drawCanvas.handleRemoteDraw(data);
    }
  });

  // Clear canvas
  socket.on('clearCanvas', () => {
    if (drawCanvas) {
      drawCanvas.clear();
    }
  });

  // Redraw canvas (undo)
  socket.on('redrawCanvas', (data) => {
    if (drawCanvas) {
      drawCanvas.clear();
      drawCanvas.loadDrawingData(data.drawingData);
    }
  });

  // Chat message
  socket.on('chatMessage', (data) => {
    addChatMessage(data);
  });

  // System message
  socket.on('systemMessage', (data) => {
    addChatMessage(data);
  });

  // Close guess
  socket.on('closeGuess', (data) => {
    addChatMessage({
      type: 'close-guess',
      message: data.message
    });
    soundManager.playClose();
  });

  // Correct guess
  socket.on('correctGuess', (data) => {
    // Show toast
    document.getElementById('guessPoints').textContent = data.points;
    popupCorrectGuess.style.display = 'flex';
    setTimeout(() => {
      popupCorrectGuess.style.display = 'none';
    }, 3000);

    soundManager.playCorrectGuess();
    confettiManager.burst(window.innerWidth / 2, window.innerHeight / 3, 30);

    chatInput.disabled = true;
    chatInput.placeholder = "You guessed it! 🎉";
  });

  // Player guessed
  socket.on('playerGuessed', (data) => {
    addChatMessage({
      type: 'correct',
      message: `🎉 ${data.playerName} guessed the word!${data.guessOrder === 1 ? ' (First!)' : ''}`
    });

    renderGamePlayers(data.players);

    if (data.playerId !== myId) {
      soundManager.playCorrectGuess();
    }
  });

  // Turn end
  socket.on('turnEnd', (data) => {
    document.getElementById('revealedWord').textContent = data.word.toUpperCase();
    document.getElementById('guessedCountDisplay').textContent = data.guessedCount;
    document.getElementById('totalPlayersDisplay').textContent = data.totalPlayers;
    document.getElementById('drawerNameDisplay').textContent = data.drawerName;
    document.getElementById('drawerPointsDisplay').textContent = data.drawerPoints;

    // Mini scoreboard
    const miniScoreboard = document.getElementById('miniScoreboard');
    miniScoreboard.innerHTML = '';
    data.scoreboard.forEach((p, i) => {
      const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
      const row = document.createElement('div');
      row.className = 'score-row';
      row.innerHTML = `
        <span class="rank ${rankClass}">#${i + 1}</span>
        <span class="score-avatar">${p.avatar}</span>
        <span class="score-name">${escapeHtml(p.name)}</span>
        <span class="score-points">${p.score} pts</span>
      `;
      miniScoreboard.appendChild(row);
    });

    popupTurnEnd.style.display = 'flex';
    soundManager.playTurnEnd();

    // Reset states
    isDrawer = false;
    drawCanvas.setDrawer(false);
    drawingTools.style.display = 'none';
    wordHint.textContent = data.word.toUpperCase();
    wordHint.style.color = '#00cec9';
    chatInput.disabled = false;
    chatInput.placeholder = "Type your guess here...";

    // Auto-hide popup
    setTimeout(() => {
      popupTurnEnd.style.display = 'none';
    }, 7500);
  });

  // Game end
  socket.on('gameEnd', (data) => {
    popupTurnEnd.style.display = 'none';

    document.getElementById('winnerAvatar').textContent = data.winner.avatar;
    document.getElementById('winnerName').textContent = data.winner.name;
    document.getElementById('winnerScore').textContent = data.winner.score + ' points';

    const finalScoreboard = document.getElementById('finalScoreboard');
    finalScoreboard.innerHTML = '';
    data.scoreboard.forEach((p, i) => {
      const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
      const row = document.createElement('div');
      row.className = 'score-row';
      row.innerHTML = `
        <span class="rank ${rankClass}">#${i + 1}</span>
        <span class="score-avatar">${p.avatar}</span>
        <span class="score-name">${escapeHtml(p.name)}</span>
        <span class="score-points">${p.score} pts</span>
      `;
      finalScoreboard.appendChild(row);
    });

    popupGameEnd.style.display = 'flex';
    soundManager.playVictory();
    confettiManager.celebrate();
  });

  // Play again
  document.getElementById('btnPlayAgain').addEventListener('click', () => {
    popupGameEnd.style.display = 'none';
    if (isHost) {
      socket.emit('startGame');
    } else {
      addChatMessage({
        type: 'system',
        message: 'Waiting for host to start a new game...'
      });
    }
  });

  // Error handling
  socket.on('error', (data) => {
    alert(data.message);
  });

  socket.on('kicked', (data) => {
    alert(data.message);
    window.location.reload();
  });

  // Connection handlers
  socket.on('connect', () => {
    console.log('Connected to server');
  });

  socket.on('disconnect', () => {
    console.log('Disconnected from server');
    addChatMessage({
      type: 'warning',
      message: '⚠️ Connection lost. Trying to reconnect...'
    });
  });

  socket.on('reconnect', () => {
    addChatMessage({
      type: 'info',
      message: '✅ Reconnected!'
    });
  });

  // ===== UTILITY =====
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ===== KEYBOARD SHORTCUTS =====
  document.addEventListener('keydown', (e) => {
    if (gameState !== 'game') return;

    // Ctrl+Z for undo (when drawing)
    if (e.ctrlKey && e.key === 'z' && isDrawer) {
      e.preventDefault();
      drawCanvas.undo();
    }
  });

  // Focus management
  chatInput.addEventListener('focus', () => {
    if (isDrawer && drawCanvas) {
      // Keep drawing ability while typing
    }
  });

})();