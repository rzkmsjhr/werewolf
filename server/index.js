const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { GameEngine, PHASES, ROLES } = require('./game');
const { getLeaderboard } = require('./db');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const game = new GameEngine(io);

app.get('/api/metrics', async (req, res) => {
    try {
        const metrics = await getLeaderboard();
        res.json(metrics);
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch metrics' });
    }
});

io.on('connection', (socket) => {
    socket.emit('game_state', game.getPublicState());

    socket.on('join_game', (username) => {
        const ipAddress = socket.handshake.address;
        const success = game.addPlayer(socket.id, username, ipAddress);
        if (success) {
            socket.emit('joined', true);
            io.emit('chat_message', { system: true, text: `${username} joined the game.` });
        } else {
            socket.emit('join_error', 'Cannot join right now, username taken, or you have already joined from this device (IP).');
        }
    });

    socket.on('chat_message', (msg) => {
        const player = game.players[socket.id];
        if (!player) return;

        // Chat restrictions
        if (game.phase === PHASES.NIGHT) {
            // Silently block chat at night
        } else if (game.phase === PHASES.DAY_CHAT || game.phase === PHASES.LOBBY || game.phase === PHASES.END) {
            if (player.isAlive) {
                io.emit('chat_message', { username: player.username, text: msg });
            } else {
                 Object.values(game.players).forEach(p => {
                     if (!p.isAlive) {
                          io.to(p.socketId).emit('chat_message', { username: player.username, text: msg, team: 'Dead' });
                     }
                 });
            }
        } else {
             socket.emit('chat_message', { system: true, text: 'Chat is disabled during voting/reveals.' });
        }
    });

    socket.on('start_game', () => {
        if (game.phase === PHASES.LOBBY) {
            game.startGame();
        }
    });

    socket.on('player_action', (actionData) => {
        // actionData = { type: 'vote' | 'target' | 'witch', target: 'username', save: bool, killTarget: 'username' }
        game.handleAction(socket.id, actionData);
    });

    socket.on('disconnect', () => {
        const player = game.players[socket.id];
        if (player) {
            io.emit('chat_message', { system: true, text: `${player.username} has disconnected.` });
            game.removePlayer(socket.id);
        }
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Werewolf Server listening on port ${PORT}`);
});
