// server/server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { getRandomWords, getWordDifficulty } = require('./words');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Serve static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// Game state storage
const rooms = new Map();

// Room structure
function createRoom(hostId, hostName, maxRounds = 5) {
  const roomCode = generateRoomCode();
  const room = {
    code: roomCode,
    hostId: hostId,
    players: new Map(),
    state: 'waiting', // waiting, choosing, drawing, roundEnd, gameEnd
    currentDrawer: null,
    currentWord: null,
    currentHint: '',
    roundNumber: 0,
    maxRounds: maxRounds,
    turnOrder: [],
    currentTurnIndex: 0,
    timer: null,
    timeLeft: 280,
    maxTime: 280,
    wordChoices: [],
    guessedPlayers: new Set(),
    drawingData: [],
    scores: new Map(),
    hintsRevealed: 0,
    hintTimer: null,
    createdAt: Date.now()
  };
  rooms.set(roomCode, room);
  return room;
}

function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  // Make sure code is unique
  if (rooms.has(code)) return generateRoomCode();
  return code;
}

function addPlayerToRoom(room, socketId, playerName, avatar) {
  const player = {
    id: socketId,
    name: playerName,
    avatar: avatar || getRandomAvatar(),
    score: 0,
    isHost: room.hostId === socketId,
    isDrawing: false,
    hasGuessed: false,
    joinedAt: Date.now()
  };
  room.players.set(socketId, player);
  room.scores.set(socketId, 0);
  return player;
}

function getRandomAvatar() {
  const avatars = ['🎨', '🖌️', '✏️', '🖍️', '🎭', '🎪', '🎯', '🎲', '🎮', '🏆',
    '🌟', '⭐', '🔥', '💎', '🎸', '🎺', '🎻', '🥁', '🎤', '🎧'];
  return avatars[Math.floor(Math.random() * avatars.length)];
}

function getPlayersArray(room) {
  return Array.from(room.players.values()).map(p => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    score: p.score,
    isHost: p.isHost,
    isDrawing: p.isDrawing,
    hasGuessed: p.hasGuessed
  }));
}

function generateHint(word) {
  return word.split('').map(char => char === ' ' ? '  ' : '_').join(' ');
}

function revealHintLetter(word, currentHint, revealCount) {
  const hintArray = currentHint.split(' ').filter((_, i) => i % 1 === 0);
  const wordChars = word.split('');
  const hiddenIndices = [];

  wordChars.forEach((char, i) => {
    if (char !== ' ') {
      // Check if already revealed
      const hintParts = currentHint.split(' ');
      let hintIndex = 0;
      for (let j = 0; j < i; j++) {
        if (word[j] === ' ') hintIndex += 1; // double space
        else hintIndex += 1;
      }
    }
  });

  // Simple approach: build hint with some letters revealed
  const totalLetters = wordChars.filter(c => c !== ' ').length;
  const lettersToReveal = Math.min(revealCount, Math.floor(totalLetters * 0.6));

  // Pick random indices to reveal
  const letterIndices = [];
  wordChars.forEach((char, i) => {
    if (char !== ' ') letterIndices.push(i);
  });

  const shuffledIndices = letterIndices.sort(() => Math.random() - 0.5);
  const revealIndices = new Set(shuffledIndices.slice(0, lettersToReveal));

  const hint = wordChars.map((char, i) => {
    if (char === ' ') return '  ';
    if (revealIndices.has(i)) return char;
    return '_';
  }).join(' ');

  return hint;
}

function calculateGuessPoints(timeLeft, maxTime, guessOrder) {
  // More time left = more points, first guesser gets most
  const timeBonus = Math.floor((timeLeft / maxTime) * 300);
  const orderPenalty = (guessOrder - 1) * 30;
  return Math.max(50, 400 + timeBonus - orderPenalty);
}

function calculateDrawerPoints(guessedCount, totalPlayers) {
  // Drawer gets points based on how many people guessed
  const ratio = guessedCount / Math.max(1, totalPlayers - 1);
  return Math.floor(ratio * 300);
}

function startNewTurn(room) {
  // Clear previous state
  if (room.timer) clearInterval(room.timer);
  if (room.hintTimer) clearInterval(room.hintTimer);

  room.guessedPlayers.clear();
  room.drawingData = [];
  room.hintsRevealed = 0;
  room.currentWord = null;
  room.currentHint = '';

  // Reset all players' hasGuessed
  room.players.forEach(p => {
    p.hasGuessed = false;
    p.isDrawing = false;
  });

  // Select next drawer
  if (room.turnOrder.length === 0) {
    room.turnOrder = Array.from(room.players.keys()).sort(() => Math.random() - 0.5);
    room.currentTurnIndex = 0;
    room.roundNumber++;
  }

  if (room.roundNumber > room.maxRounds) {
    endGame(room);
    return;
  }

  const drawerId = room.turnOrder[room.currentTurnIndex];
  room.currentDrawer = drawerId;

  const drawer = room.players.get(drawerId);
  if (!drawer) {
    // Drawer left, skip
    room.currentTurnIndex++;
    if (room.currentTurnIndex >= room.turnOrder.length) {
      room.turnOrder = [];
    }
    startNewTurn(room);
    return;
  }

  drawer.isDrawing = true;
  room.state = 'choosing';

  // Generate 3 word choices
  const wordChoices = getRandomWords(3);
  room.wordChoices = wordChoices;

  // Send word choices only to drawer
  io.to(drawerId).emit('wordChoices', {
    words: wordChoices,
    timeToChoose: 15
  });

  // Notify all players about new turn
  io.to(room.code).emit('newTurn', {
    drawer: {
      id: drawer.id,
      name: drawer.name,
      avatar: drawer.avatar
    },
    roundNumber: room.roundNumber,
    maxRounds: room.maxRounds,
    players: getPlayersArray(room)
  });

  // Auto-select word if drawer doesn't choose in 15 seconds
  room.chooseTimer = setTimeout(() => {
    if (room.state === 'choosing') {
      const randomWord = wordChoices[Math.floor(Math.random() * wordChoices.length)];
      selectWord(room, randomWord);
    }
  }, 15000);
}

function selectWord(room, word) {
  if (room.chooseTimer) clearTimeout(room.chooseTimer);

  room.currentWord = word.toLowerCase();
  room.currentHint = generateHint(room.currentWord);
  room.state = 'drawing';
  room.timeLeft = room.maxTime;

  // Send hint to all players (hidden word)
  io.to(room.code).emit('drawingStarted', {
    hint: room.currentHint,
    wordLength: room.currentWord.length,
    timeLeft: room.timeLeft,
    drawer: room.currentDrawer
  });

  // Send actual word to drawer
  io.to(room.currentDrawer).emit('yourWord', {
    word: room.currentWord
  });

  // Start countdown timer
  room.timer = setInterval(() => {
    room.timeLeft--;

    if (room.timeLeft <= 0) {
      endTurn(room);
      return;
    }

    io.to(room.code).emit('timerUpdate', {
      timeLeft: room.timeLeft
    });
  }, 1000);

  // Reveal hints at intervals
  const hintInterval = Math.floor(room.maxTime / 4);
  room.hintTimer = setInterval(() => {
    room.hintsRevealed++;
    room.currentHint = revealHintLetter(room.currentWord, room.currentHint, room.hintsRevealed);
    io.to(room.code).emit('hintUpdate', {
      hint: room.currentHint
    });
  }, hintInterval * 1000);
}

function endTurn(room) {
  if (room.timer) clearInterval(room.timer);
  if (room.hintTimer) clearInterval(room.hintTimer);

  room.state = 'roundEnd';

  // Calculate drawer points
  const drawerPoints = calculateDrawerPoints(room.guessedPlayers.size, room.players.size);
  const drawer = room.players.get(room.currentDrawer);
  if (drawer) {
    drawer.score += drawerPoints;
    room.scores.set(room.currentDrawer, drawer.score);
  }

  // Prepare scoreboard
  const scoreboard = getPlayersArray(room).sort((a, b) => b.score - a.score);

  io.to(room.code).emit('turnEnd', {
    word: room.currentWord,
    drawerPoints: drawerPoints,
    drawerName: drawer ? drawer.name : 'Unknown',
    scoreboard: scoreboard,
    guessedCount: room.guessedPlayers.size,
    totalPlayers: room.players.size - 1
  });

  // Move to next turn
  room.currentTurnIndex++;
  if (room.currentTurnIndex >= room.turnOrder.length) {
    room.turnOrder = [];
  }

  // Wait 8 seconds then start next turn
  setTimeout(() => {
    if (room.state === 'roundEnd' && rooms.has(room.code)) {
      if (room.roundNumber >= room.maxRounds && room.turnOrder.length === 0) {
        endGame(room);
      } else {
        startNewTurn(room);
      }
    }
  }, 8000);
}

function endGame(room) {
  room.state = 'gameEnd';
  if (room.timer) clearInterval(room.timer);
  if (room.hintTimer) clearInterval(room.hintTimer);

  const finalScoreboard = getPlayersArray(room).sort((a, b) => b.score - a.score);

  io.to(room.code).emit('gameEnd', {
    scoreboard: finalScoreboard,
    winner: finalScoreboard[0]
  });
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  let currentRoom = null;
  let playerName = null;

  // Create room
  socket.on('createRoom', (data) => {
    const { name, avatar, maxRounds } = data;
    playerName = name;
    const room = createRoom(socket.id, name, maxRounds || 5);
    const player = addPlayerToRoom(room, socket.id, name, avatar);
    currentRoom = room.code;

    socket.join(room.code);

    socket.emit('roomCreated', {
      roomCode: room.code,
      player: player,
      players: getPlayersArray(room)
    });

    console.log(`Room ${room.code} created by ${name}`);
  });

  // Join room
  socket.on('joinRoom', (data) => {
    const { name, avatar, roomCode } = data;
    playerName = name;
    const code = roomCode.toUpperCase();
    const room = rooms.get(code);

    if (!room) {
      socket.emit('error', { message: 'Room not found! Check the code and try again.' });
      return;
    }

    if (room.state !== 'waiting') {
      // Allow joining mid-game
      const player = addPlayerToRoom(room, socket.id, name, avatar);
      currentRoom = code;
      socket.join(code);

      socket.emit('roomJoined', {
        roomCode: code,
        player: player,
        players: getPlayersArray(room),
        gameInProgress: true,
        state: room.state,
        currentDrawer: room.currentDrawer,
        hint: room.currentHint,
        timeLeft: room.timeLeft,
        roundNumber: room.roundNumber,
        maxRounds: room.maxRounds,
        drawingData: room.drawingData
      });

      io.to(code).emit('playerJoined', {
        player: player,
        players: getPlayersArray(room),
        message: `${name} joined the game!`
      });
      return;
    }

    if (room.players.size >= 12) {
      socket.emit('error', { message: 'Room is full! Maximum 12 players.' });
      return;
    }

    const player = addPlayerToRoom(room, socket.id, name, avatar);
    currentRoom = code;
    socket.join(code);

    socket.emit('roomJoined', {
      roomCode: code,
      player: player,
      players: getPlayersArray(room),
      gameInProgress: false
    });

    io.to(code).emit('playerJoined', {
      player: player,
      players: getPlayersArray(room),
      message: `${name} joined the room!`
    });

    console.log(`${name} joined room ${code}`);
  });

  // Start game (host only)
  socket.on('startGame', () => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;

    if (room.hostId !== socket.id) {
      socket.emit('error', { message: 'Only the host can start the game!' });
      return;
    }

    if (room.players.size < 2) {
      socket.emit('error', { message: 'Need at least 2 players to start!' });
      return;
    }

    room.state = 'playing';
    io.to(room.code).emit('gameStarted', {
      message: 'Game is starting! 🎨',
      players: getPlayersArray(room)
    });

    // Start first turn after a short delay
    setTimeout(() => {
      startNewTurn(room);
    }, 3000);
  });

  // Word selection by drawer
  socket.on('selectWord', (data) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room || room.currentDrawer !== socket.id) return;
    if (room.state !== 'choosing') return;

    selectWord(room, data.word);
  });

  // Drawing events
  socket.on('draw', (data) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room || room.currentDrawer !== socket.id) return;
    if (room.state !== 'drawing') return;

    room.drawingData.push(data);
    socket.to(currentRoom).emit('draw', data);
  });

  socket.on('clearCanvas', () => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room || room.currentDrawer !== socket.id) return;

    room.drawingData = [];
    socket.to(currentRoom).emit('clearCanvas');
  });

  socket.on('undo', () => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room || room.currentDrawer !== socket.id) return;

    // Remove last stroke
    const lastStrokeEnd = room.drawingData.length - 1;
    let lastStrokeStart = lastStrokeEnd;
    for (let i = lastStrokeEnd; i >= 0; i--) {
      if (room.drawingData[i].type === 'start') {
        lastStrokeStart = i;
        break;
      }
    }
    room.drawingData = room.drawingData.slice(0, lastStrokeStart);

    io.to(currentRoom).emit('redrawCanvas', {
      drawingData: room.drawingData
    });
  });

  // Chat / Guess messages
  socket.on('chatMessage', (data) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;

    const player = room.players.get(socket.id);
    if (!player) return;

    // Drawer can't guess
    if (socket.id === room.currentDrawer) {
      // Drawer can send non-guess messages but word is filtered
      if (room.currentWord && data.message.toLowerCase().includes(room.currentWord.toLowerCase())) {
        socket.emit('systemMessage', {
          message: "Don't reveal the word! 🤫",
          type: 'warning'
        });
        return;
      }
      io.to(currentRoom).emit('chatMessage', {
        playerId: socket.id,
        playerName: player.name,
        avatar: player.avatar,
        message: data.message,
        type: 'chat'
      });
      return;
    }

    // Already guessed players can chat among themselves
    if (player.hasGuessed) {
      // Filter word from message
      if (room.currentWord && data.message.toLowerCase().includes(room.currentWord.toLowerCase())) {
        socket.emit('systemMessage', {
          message: "Don't spoil the answer! 🤫",
          type: 'warning'
        });
        return;
      }
      io.to(currentRoom).emit('chatMessage', {
        playerId: socket.id,
        playerName: player.name,
        avatar: player.avatar,
        message: data.message,
        type: 'chat'
      });
      return;
    }

    // Check if guess is correct
    if (room.state === 'drawing' && room.currentWord) {
      const guess = data.message.trim().toLowerCase();
      const word = room.currentWord.toLowerCase();

      if (guess === word) {
        // Correct guess!
        player.hasGuessed = true;
        room.guessedPlayers.add(socket.id);

        const guessOrder = room.guessedPlayers.size;
        const points = calculateGuessPoints(room.timeLeft, room.maxTime, guessOrder);
        player.score += points;
        room.scores.set(socket.id, player.score);

        // Notify the guesser
        socket.emit('correctGuess', {
          word: room.currentWord,
          points: points,
          guessOrder: guessOrder
        });

        // Notify everyone else
        io.to(currentRoom).emit('playerGuessed', {
          playerId: socket.id,
          playerName: player.name,
          avatar: player.avatar,
          guessOrder: guessOrder,
          players: getPlayersArray(room)
        });

        // Check if everyone has guessed
        const nonDrawerCount = room.players.size - 1;
        if (room.guessedPlayers.size >= nonDrawerCount) {
          // Everyone guessed! End turn early
          setTimeout(() => endTurn(room), 2000);
        }

        return;
      }

      // Check for close guess
      if (isCloseGuess(guess, word)) {
        socket.emit('closeGuess', {
          message: `"${data.message}" is very close! 🔥`
        });
      }
    }

    // Regular chat message (wrong guess shown as normal message)
    io.to(currentRoom).emit('chatMessage', {
      playerId: socket.id,
      playerName: player.name,
      avatar: player.avatar,
      message: data.message,
      type: 'guess'
    });
  });

  // Disconnect handling
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);

    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;

    const player = room.players.get(socket.id);
    const wasDrawer = room.currentDrawer === socket.id;

    room.players.delete(socket.id);
    room.scores.delete(socket.id);
    room.turnOrder = room.turnOrder.filter(id => id !== socket.id);

    if (room.players.size === 0) {
      // Room empty, clean up
      if (room.timer) clearInterval(room.timer);
      if (room.hintTimer) clearInterval(room.hintTimer);
      if (room.chooseTimer) clearTimeout(room.chooseTimer);
      rooms.delete(currentRoom);
      console.log(`Room ${currentRoom} deleted (empty)`);
      return;
    }

    // Transfer host if needed
    if (room.hostId === socket.id) {
      const newHost = room.players.values().next().value;
      room.hostId = newHost.id;
      newHost.isHost = true;
      io.to(newHost.id).emit('youAreHost', { message: 'You are now the host!' });
    }

    io.to(currentRoom).emit('playerLeft', {
      playerId: socket.id,
      playerName: player ? player.name : 'Unknown',
      players: getPlayersArray(room),
      message: `${player ? player.name : 'A player'} left the game`
    });

    // If drawer left, end the turn
    if (wasDrawer && (room.state === 'drawing' || room.state === 'choosing')) {
      io.to(currentRoom).emit('systemMessage', {
        message: 'The drawer left! Moving to next turn...',
        type: 'info'
      });
      setTimeout(() => {
        if (room.players.size >= 2) {
          endTurn(room);
        }
      }, 2000);
    }

    // If only 1 player left during game
    if (room.players.size < 2 && room.state !== 'waiting') {
      room.state = 'waiting';
      if (room.timer) clearInterval(room.timer);
      if (room.hintTimer) clearInterval(room.hintTimer);
      io.to(currentRoom).emit('systemMessage', {
        message: 'Not enough players. Waiting for more players to join...',
        type: 'warning'
      });
    }
  });

  // Kick player (host only)
  socket.on('kickPlayer', (data) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room || room.hostId !== socket.id) return;

    const targetSocket = io.sockets.sockets.get(data.playerId);
    if (targetSocket) {
      targetSocket.emit('kicked', { message: 'You have been kicked from the room!' });
      targetSocket.leave(currentRoom);
    }
  });

  // Change settings (host only)
  socket.on('updateSettings', (data) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room || room.hostId !== socket.id) return;

    if (data.maxRounds) room.maxRounds = Math.min(10, Math.max(1, data.maxRounds));
    if (data.maxTime) room.maxTime = Math.min(300, Math.max(30, data.maxTime));

    io.to(currentRoom).emit('settingsUpdated', {
      maxRounds: room.maxRounds,
      maxTime: room.maxTime
    });
  });
});

function isCloseGuess(guess, word) {
  if (guess.length < 2 || word.length < 2) return false;

  // Levenshtein distance
  const matrix = [];
  for (let i = 0; i <= word.length; i++) {
    matrix[i] = [i];
    for (let j = 1; j <= guess.length; j++) {
      if (i === 0) {
        matrix[i][j] = j;
      } else {
        const cost = word[i - 1] === guess[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }
  }

  const distance = matrix[word.length][guess.length];
  const maxLen = Math.max(word.length, guess.length);
  return distance <= Math.max(1, Math.floor(maxLen * 0.25));
}

// Cleanup stale rooms every 30 minutes
setInterval(() => {
  const now = Date.now();
  rooms.forEach((room, code) => {
    if (now - room.createdAt > 3 * 60 * 60 * 1000) { // 3 hours
      if (room.timer) clearInterval(room.timer);
      if (room.hintTimer) clearInterval(room.hintTimer);
      rooms.delete(code);
      console.log(`Cleaned up stale room: ${code}`);
    }
  });
}, 30 * 60 * 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🎨 DrawTogether server running on port ${PORT}`);
  console.log(`   Open http://localhost:${PORT} in your browser`);
});