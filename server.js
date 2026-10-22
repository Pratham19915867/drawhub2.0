const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" },
    maxHttpBufferSize: 1e7
});

app.use(express.static('public'));

// ============ WORD DATABASE ============
const WORD_DATABASE = {
    animals: ['CAT', 'DOG', 'ELEPHANT', 'GIRAFFE', 'LION', 'TIGER', 'MONKEY', 'PENGUIN', 'DOLPHIN', 'RABBIT', 'SNAKE', 'EAGLE', 'BUTTERFLY', 'OCTOPUS', 'SHARK', 'WHALE', 'PARROT', 'FROG', 'TURTLE', 'BEAR', 'DEER', 'FOX', 'OWL', 'PEACOCK', 'ZEBRA', 'HORSE', 'COW', 'PIG', 'CHICKEN', 'DUCK'],
    objects: ['CAR', 'BICYCLE', 'AIRPLANE', 'HOUSE', 'TREE', 'FLOWER', 'SUN', 'MOON', 'STAR', 'UMBRELLA', 'GUITAR', 'PIANO', 'CAMERA', 'TELEVISION', 'PHONE', 'LAPTOP', 'BOOK', 'CLOCK', 'LAMP', 'CHAIR', 'TABLE', 'BED', 'DOOR', 'WINDOW', 'KEY', 'HAMMER', 'SCISSORS', 'BALLOON', 'CANDLE', 'ROBOT'],
    food: ['PIZZA', 'BURGER', 'ICE CREAM', 'CAKE', 'APPLE', 'BANANA', 'WATERMELON', 'COOKIE', 'DONUT', 'SANDWICH', 'PASTA', 'TACO', 'SUSHI', 'POPCORN', 'CHOCOLATE', 'MANGO', 'GRAPES', 'CHERRY', 'MUSHROOM', 'CARROT'],
    places: ['BEACH', 'MOUNTAIN', 'CASTLE', 'HOSPITAL', 'SCHOOL', 'CHURCH', 'BRIDGE', 'LIGHTHOUSE', 'VOLCANO', 'ISLAND', 'DESERT', 'FOREST', 'WATERFALL', 'PYRAMID', 'STADIUM'],
    actions: ['DANCING', 'SWIMMING', 'COOKING', 'SLEEPING', 'RUNNING', 'FISHING', 'PAINTING', 'SINGING', 'DRIVING', 'FLYING', 'CLIMBING', 'SURFING', 'SKIING', 'BOXING', 'CRYING'],
    things: ['RAINBOW', 'FIRE', 'LIGHTNING', 'TORNADO', 'SNOWMAN', 'ROCKET', 'DIAMOND', 'CROWN', 'SWORD', 'SHIELD', 'TREASURE', 'MAP', 'FLAG', 'MEDAL', 'TROPHY']
};

function getAllWords() {
    let all = [];
    Object.values(WORD_DATABASE).forEach(arr => all = all.concat(arr));
    return all;
}

function getRandomWords(count = 3) {
    const allWords = getAllWords();
    const shuffled = allWords.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
}

// ============ ROOM MANAGEMENT ============
const rooms = {};

function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

function getPlayerAvatars() {
    return ['🎨', '🦊', '🐱', '🐶', '🐼', '🦁', '🐸', '🦄', '🐧', '🐵', '🐰', '🐻', '🐲', '🦋', '🐢', '🦅'];
}

function createRoom(hostSocketId, hostName) {
    const code = generateRoomCode();
    rooms[code] = {
        code: code,
        hostId: hostSocketId,
        players: {},
        currentDrawer: null,
        currentWord: null,
        roundNumber: 0,
        totalRounds: 0,
        timerSeconds: 80,
        timerInterval: null,
        timeLeft: 0,
        gameStarted: false,
        gamePhase: 'waiting', // waiting, choosing, drawing, roundEnd, gameOver
        drawOrder: [],
        currentDrawerIndex: 0,
        usedWords: [],
        wordChoices: [],
        guessedPlayers: [],
        canvasHistory: [],
        maxPlayers: 10,
        roundTime: 80
    };
    return code;
}

function addPlayer(roomCode, socketId, playerName) {
    if (!rooms[roomCode]) return null;
    const room = rooms[roomCode];
    if (Object.keys(room.players).length >= room.maxPlayers) return null;

    const avatars = getPlayerAvatars();
    const usedAvatars = Object.values(room.players).map(p => p.avatar);
    const availableAvatars = avatars.filter(a => !usedAvatars.includes(a));
    const avatar = availableAvatars.length > 0 ? availableAvatars[Math.floor(Math.random() * availableAvatars.length)] : '🎮';

    room.players[socketId] = {
        id: socketId,
        name: playerName,
        avatar: avatar,
        score: 0,
        isHost: socketId === room.hostId,
        hasGuessed: false,
        isDrawing: false,
        isOnline: true
    };
    return room.players[socketId];
}

function removePlayer(roomCode, socketId) {
    if (!rooms[roomCode]) return;
    const room = rooms[roomCode];
    delete room.players[socketId];

    // If host left, assign new host
    const playerIds = Object.keys(room.players);
    if (playerIds.length > 0 && socketId === room.hostId) {
        room.hostId = playerIds[0];
        room.players[playerIds[0]].isHost = true;
    }

    // Remove from draw order
    room.drawOrder = room.drawOrder.filter(id => id !== socketId);

    // If no players, delete room
    if (playerIds.length === 0) {
        clearInterval(room.timerInterval);
        delete rooms[roomCode];
        return 'deleted';
    }

    // If drawer left during drawing
    if (room.currentDrawer === socketId && room.gamePhase === 'drawing') {
        clearInterval(room.timerInterval);
        nextTurn(roomCode);
    }

    return 'removed';
}

// ============ GAME LOGIC ============
function startGame(roomCode) {
    const room = rooms[roomCode];
    if (!room) return;

    const playerIds = Object.keys(room.players);
    if (playerIds.length < 2) return;

    room.gameStarted = true;
    room.drawOrder = [...playerIds].sort(() => Math.random() - 0.5);
    room.currentDrawerIndex = 0;
    room.roundNumber = 1;
    room.totalRounds = room.drawOrder.length;
    room.usedWords = [];

    // Reset all scores
    Object.values(room.players).forEach(p => p.score = 0);

    io.to(roomCode).emit('game_started', {
        totalRounds: room.totalRounds,
        players: room.players
    });

    // Start first turn
    startChoosingPhase(roomCode);
}

function startChoosingPhase(roomCode) {
    const room = rooms[roomCode];
    if (!room) return;

    const drawerId = room.drawOrder[room.currentDrawerIndex];
    if (!drawerId || !room.players[drawerId]) {
        nextTurn(roomCode);
        return;
    }

    room.currentDrawer = drawerId;
    room.gamePhase = 'choosing';
    room.guessedPlayers = [];
    room.canvasHistory = [];

    // Reset player states
    Object.values(room.players).forEach(p => {
        p.hasGuessed = false;
        p.isDrawing = false;
    });
    room.players[drawerId].isDrawing = true;

    // Generate 3 word choices
    let choices;
    do {
        choices = getRandomWords(3);
    } while (choices.some(w => room.usedWords.includes(w)));

    room.wordChoices = choices;

    // Send word choices ONLY to the drawer
    io.to(drawerId).emit('choose_word', {
        words: choices,
        timeToChoose: 15
    });

    // Tell everyone else who is choosing
    io.to(roomCode).emit('choosing_phase', {
        drawerId: drawerId,
        drawerName: room.players[drawerId].name,
        roundNumber: room.roundNumber,
        totalRounds: room.totalRounds,
        players: room.players
    });

    // Auto-choose after 15 seconds
    room.choosingTimeout = setTimeout(() => {
        if (room.gamePhase === 'choosing') {
            const randomWord = choices[Math.floor(Math.random() * choices.length)];
            wordChosen(roomCode, drawerId, randomWord);
        }
    }, 15000);
}

function wordChosen(roomCode, drawerId, word) {
    const room = rooms[roomCode];
    if (!room) return;

    clearTimeout(room.choosingTimeout);

    room.currentWord = word;
    room.usedWords.push(word);
    room.gamePhase = 'drawing';
    room.timeLeft = room.roundTime;

    // Create hint (show first and last letter, rest underscores)
    let hint = '';
    for (let i = 0; i < word.length; i++) {
        if (word[i] === ' ') hint += '  ';
        else if (i === 0 || i === word.length - 1) hint += word[i];
        else hint += ' _ ';
    }

    // Tell drawer to start drawing
    io.to(drawerId).emit('start_drawing', {
        word: word,
        time: room.roundTime
    });

    // Tell everyone the round started
    io.to(roomCode).emit('round_started', {
        drawerId: drawerId,
        drawerName: room.players[drawerId].name,
        hint: hint,
        wordLength: word.length,
        time: room.roundTime,
        roundNumber: room.roundNumber,
        totalRounds: room.totalRounds,
        players: room.players
    });

    // Start countdown timer
    room.timerInterval = setInterval(() => {
        room.timeLeft--;

        io.to(roomCode).emit('timer_update', {
            timeLeft: room.timeLeft,
            totalTime: room.roundTime
        });

        // Reveal more hints at certain times
        if (room.timeLeft === Math.floor(room.roundTime * 0.5)) {
            let midHint = '';
            const revealIndices = new Set([0, word.length - 1]);
            const middleIndex = Math.floor(word.length / 2);
            revealIndices.add(middleIndex);

            for (let i = 0; i < word.length; i++) {
                if (word[i] === ' ') midHint += '  ';
                else if (revealIndices.has(i)) midHint += word[i];
                else midHint += ' _ ';
            }

            // Send updated hint to non-drawers only
            Object.keys(room.players).forEach(pid => {
                if (pid !== drawerId) {
                    io.to(pid).emit('hint_update', { hint: midHint });
                }
            });
        }

        if (room.timeLeft <= 0) {
            clearInterval(room.timerInterval);
            endRound(roomCode, false);
        }
    }, 1000);
}

function checkGuess(roomCode, socketId, guess) {
    const room = rooms[roomCode];
    if (!room || room.gamePhase !== 'drawing') return;
    if (socketId === room.currentDrawer) return;
    if (room.players[socketId] && room.players[socketId].hasGuessed) return;

    const normalizedGuess = guess.trim().toUpperCase();
    const normalizedWord = room.currentWord.trim().toUpperCase();

    if (normalizedGuess === normalizedWord) {
        // Correct guess!
        const player = room.players[socketId];
        player.hasGuessed = true;
        room.guessedPlayers.push(socketId);

        // Calculate points based on time and guess order
        const timeBonus = Math.floor((room.timeLeft / room.roundTime) * 100);
        const orderBonus = Math.max(0, 50 - (room.guessedPlayers.length - 1) * 15);
        const points = Math.max(10, timeBonus + orderBonus);

        player.score += points;

        // Drawer also gets points
        room.players[room.currentDrawer].score += Math.floor(points * 0.5);

        // Notify everyone
        io.to(roomCode).emit('correct_guess', {
            playerId: socketId,
            playerName: player.name,
            points: points,
            guessOrder: room.guessedPlayers.length,
            players: room.players
        });

        // Tell the guesser privately
        io.to(socketId).emit('you_guessed_correct', {
            word: room.currentWord,
            points: points
        });

        // Check if all non-drawer players have guessed
        const nonDrawerPlayers = Object.keys(room.players).filter(id => id !== room.currentDrawer);
        const allGuessed = nonDrawerPlayers.every(id => room.players[id].hasGuessed);

        if (allGuessed) {
            clearInterval(room.timerInterval);
            endRound(roomCode, true);
        }
    } else {
        // Check for close guess
        const isClose = isCloseGuess(normalizedGuess, normalizedWord);

        // Broadcast the message to everyone
        io.to(roomCode).emit('chat_message', {
            senderId: socketId,
            senderName: room.players[socketId].name,
            senderAvatar: room.players[socketId].avatar,
            message: guess,
            isClose: isClose,
            timestamp: Date.now()
        });

        if (isClose) {
            io.to(socketId).emit('close_guess', { message: "You're very close!" });
        }
    }
}

function isCloseGuess(guess, word) {
    if (guess.length < 2 || word.length < 2) return false;
    // Simple Levenshtein-like check
    let matches = 0;
    const shorter = Math.min(guess.length, word.length);
    const longer = Math.max(guess.length, word.length);

    for (let i = 0; i < shorter; i++) {
        if (guess[i] === word[i]) matches++;
    }

    return (matches / longer) >= 0.6 && guess !== word;
}

function endRound(roomCode, allGuessed) {
    const room = rooms[roomCode];
    if (!room) return;

    room.gamePhase = 'roundEnd';
    clearInterval(room.timerInterval);

    // Sort players by score
    const sortedPlayers = Object.values(room.players).sort((a, b) => b.score - a.score);

    io.to(roomCode).emit('round_ended', {
        word: room.currentWord,
        allGuessed: allGuessed,
        guessedCount: room.guessedPlayers.length,
        totalPlayers: Object.keys(room.players).length - 1,
        players: room.players,
        sortedPlayers: sortedPlayers,
        roundNumber: room.roundNumber,
        totalRounds: room.totalRounds
    });

    // Wait 5 seconds then move to next turn
    setTimeout(() => {
        nextTurn(roomCode);
    }, 6000);
}

function nextTurn(roomCode) {
    const room = rooms[roomCode];
    if (!room) return;

    room.currentDrawerIndex++;

    if (room.currentDrawerIndex >= room.drawOrder.length) {
        // All players have drawn = round complete
        room.roundNumber++;

        if (room.roundNumber > 3) {
            // Game Over after 3 full rounds
            endGame(roomCode);
            return;
        }

        // Reshuffle draw order for next round
        room.drawOrder = Object.keys(room.players).sort(() => Math.random() - 0.5);
        room.currentDrawerIndex = 0;
        room.totalRounds = room.drawOrder.length;
    }

    // Validate next drawer exists
    while (room.currentDrawerIndex < room.drawOrder.length &&
           !room.players[room.drawOrder[room.currentDrawerIndex]]) {
        room.currentDrawerIndex++;
    }

    if (room.currentDrawerIndex >= room.drawOrder.length) {
        endGame(roomCode);
        return;
    }

    startChoosingPhase(roomCode);
}

function endGame(roomCode) {
    const room = rooms[roomCode];
    if (!room) return;

    room.gamePhase = 'gameOver';
    room.gameStarted = false;

    const sortedPlayers = Object.values(room.players).sort((a, b) => b.score - a.score);

    io.to(roomCode).emit('game_over', {
        sortedPlayers: sortedPlayers,
        winner: sortedPlayers[0]
    });
}

// ============ SOCKET.IO EVENTS ============
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    let currentRoom = null;

    // Create Room
    socket.on('create_room', (data) => {
        const roomCode = createRoom(socket.id, data.playerName);
        const player = addPlayer(roomCode, socket.id, data.playerName);
        currentRoom = roomCode;
        socket.join(roomCode);

        socket.emit('room_created', {
            roomCode: roomCode,
            player: player,
            players: rooms[roomCode].players
        });

        console.log(`Room ${roomCode} created by ${data.playerName}`);
    });

    // Join Room
    socket.on('join_room', (data) => {
        const roomCode = data.roomCode.toUpperCase();

        if (!rooms[roomCode]) {
            socket.emit('join_error', { message: 'Room not found! Check the code and try again.' });
            return;
        }

        if (rooms[roomCode].gameStarted) {
            socket.emit('join_error', { message: 'Game already in progress! Wait for next round.' });
            return;
        }

        if (Object.keys(rooms[roomCode].players).length >= rooms[roomCode].maxPlayers) {
            socket.emit('join_error', { message: 'Room is full!' });
            return;
        }

        const player = addPlayer(roomCode, socket.id, data.playerName);
        currentRoom = roomCode;
        socket.join(roomCode);

        socket.emit('room_joined', {
            roomCode: roomCode,
            player: player,
            players: rooms[roomCode].players
        });

        // Notify others
        socket.to(roomCode).emit('player_joined', {
            player: player,
            players: rooms[roomCode].players,
            playerCount: Object.keys(rooms[roomCode].players).length
        });

        console.log(`${data.playerName} joined room ${roomCode}`);
    });

    // Start Game (Host only)
    socket.on('start_game', () => {
        if (!currentRoom || !rooms[currentRoom]) return;
        if (rooms[currentRoom].hostId !== socket.id) return;
        if (Object.keys(rooms[currentRoom].players).length < 2) {
            socket.emit('game_error', { message: 'Need at least 2 players to start!' });
            return;
        }
        startGame(currentRoom);
    });

    // Word Chosen by drawer
    socket.on('word_chosen', (data) => {
        if (!currentRoom || !rooms[currentRoom]) return;
        if (rooms[currentRoom].currentDrawer !== socket.id) return;
        wordChosen(currentRoom, socket.id, data.word);
    });

    // Drawing events
    socket.on('draw_data', (data) => {
        if (!currentRoom || !rooms[currentRoom]) return;
        if (rooms[currentRoom].currentDrawer !== socket.id) return;
        socket.to(currentRoom).emit('draw_data', data);
    });

    socket.on('canvas_clear', () => {
        if (!currentRoom || !rooms[currentRoom]) return;
        if (rooms[currentRoom].currentDrawer !== socket.id) return;
        socket.to(currentRoom).emit('canvas_clear');
    });

    socket.on('undo_action', () => {
        if (!currentRoom || !rooms[currentRoom]) return;
        if (rooms[currentRoom].currentDrawer !== socket.id) return;
        socket.to(currentRoom).emit('undo_action');
    });

    // Chat / Guess
    socket.on('send_guess', (data) => {
        if (!currentRoom || !rooms[currentRoom]) return;
        checkGuess(currentRoom, socket.id, data.message);
    });

    // Chat message (when not in drawing phase or from drawer)
    socket.on('send_chat', (data) => {
        if (!currentRoom || !rooms[currentRoom]) return;
        const room = rooms[currentRoom];

        if (room.gamePhase === 'drawing' && socket.id !== room.currentDrawer) {
            // Treat as guess
            checkGuess(currentRoom, socket.id, data.message);
        } else {
            io.to(currentRoom).emit('chat_message', {
                senderId: socket.id,
                senderName: room.players[socket.id] ? room.players[socket.id].name : 'Unknown',
                senderAvatar: room.players[socket.id] ? room.players[socket.id].avatar : '🎮',
                message: data.message,
                isClose: false,
                timestamp: Date.now()
            });
        }
    });

    // Disconnect
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        if (currentRoom && rooms[currentRoom]) {
            const playerName = rooms[currentRoom].players[socket.id]?.name || 'Unknown';
            const result = removePlayer(currentRoom, socket.id);

            if (result !== 'deleted') {
                io.to(currentRoom).emit('player_left', {
                    playerName: playerName,
                    players: rooms[currentRoom].players,
                    playerCount: Object.keys(rooms[currentRoom].players).length,
                    newHostId: rooms[currentRoom].hostId
                });
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`
    ╔══════════════════════════════════════╗
    ║   🎨 DrawTogether Server Running!   ║
    ║   http://localhost:${PORT}             ║
    ╚══════════════════════════════════════╝
    `);
});