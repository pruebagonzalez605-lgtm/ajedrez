const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(express.static(__dirname));

// Helper for PKCE base64-url encoding
function base64URLEncode(buffer) {
    return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

const fetch = require('node-fetch');

const OAUTH_CONFIG = {
    client_id: process.env.KICK_CLIENT_ID || process.env.CLIENT_ID || '',
    client_secret: process.env.KICK_CLIENT_SECRET || process.env.CLIENT_SECRET || '',
    redirect_uri: process.env.KICK_REDIRECT_URI || process.env.REDIRECT_URI || '',
    scope: process.env.KICK_SCOPE || 'user:read channel:read channel:write chat:write streamkey:read events:subscribe moderation:ban kicks:read',
    auth_url: process.env.KICK_AUTH_URL || 'https://id.kick.com/oauth/authorize',
    token_url: process.env.KICK_TOKEN_URL || 'https://id.kick.com/oauth/token',
    userinfo_url: process.env.KICK_USERINFO_URL || 'https://api.kick.com/public/v1/users'
};

const APP_ORIGIN = process.env.APP_ORIGIN || process.env.FRONTEND_URL || process.env.CLIENT_URL || '';

function normalizeBaseUrl(url) {
    if (!url) return '';
    return url.replace(/\/$/, '');
}

function getRedirectUri(req) {
    const explicit = normalizeBaseUrl(OAUTH_CONFIG.redirect_uri);
    if (explicit) return explicit;
    return `${req.protocol}://${req.get('host')}/auth/kick/callback`;
}

function getAppBaseUrl(req) {
    const explicit = normalizeBaseUrl(APP_ORIGIN);
    if (explicit) return explicit;
    return `${req.protocol}://${req.get('host')}`;
}

const oauthStates = {};

function getSafeUsername(raw, socketId) {
    const name = (raw || '').toString().trim();
    if (name) return name;
    const suffix = socketId ? socketId.slice(-4) : Math.random().toString(36).slice(2, 6);
    return `Guest-${suffix}`;
}

app.get('/auth/kick', (req, res) => {
    console.log('🔒 [OAuth] User initiated /auth/kick endpoint');
    
    const code_verifier = base64URLEncode(crypto.randomBytes(64));
    const code_challenge = base64URLEncode(crypto.createHash('sha256').update(code_verifier).digest());
    const state = Math.random().toString(36).substr(2, 12);

    oauthStates[state] = { code_verifier, createdAt: Date.now() };

    const redirectUri = getRedirectUri(req);
    const params = new URLSearchParams({
        response_type: 'code',
        client_id: OAUTH_CONFIG.client_id,
        redirect_uri: redirectUri,
        scope: OAUTH_CONFIG.scope,
        state,
        code_challenge: code_challenge,
        code_challenge_method: 'S256'
    });

    res.redirect(`${OAUTH_CONFIG.auth_url}?${params.toString()}`);
});

app.get('/auth/kick/callback', async (req, res) => {
    const { code, state } = req.query;
    
    if (!code) return res.status(400).send('Missing code');

    const record = oauthStates[state];
    if (!record) {
        return res.status(400).send('Invalid or expired state');
    }

    const code_verifier = record.code_verifier;
    delete oauthStates[state];

    try {
        const redirectUri = getRedirectUri(req);
        const bodyParams = new URLSearchParams({
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: redirectUri,
            client_id: OAUTH_CONFIG.client_id,
            code_verifier: code_verifier
        });

        if (OAUTH_CONFIG.client_secret) {
            bodyParams.append('client_secret', OAUTH_CONFIG.client_secret);
        }

        const tokenResp = await fetch(OAUTH_CONFIG.token_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: bodyParams
        });

        if (!tokenResp.ok) {
            return res.status(500).send('Token exchange failed');
        }

        const tokenData = await tokenResp.json();
        const accessToken = tokenData.access_token;

        const userResp = await fetch(OAUTH_CONFIG.userinfo_url, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json'
            }
        });

        if (!userResp.ok) {
            return res.status(500).send('User info fetch failed');
        }

        const userData = await userResp.json();
        
        let username = '';
        let avatar = '';

        if (userData.data && Array.isArray(userData.data) && userData.data.length > 0) {
            const user = userData.data[0];
            username = user.name || user.username || user.login || '';
            avatar = user.profile_picture || user.avatar_url || user.profile_pic || '';
        } else if (userData.name) {
            username = userData.name || userData.username || '';
            avatar = userData.profile_picture || userData.avatar_url || '';
        }

        username = getSafeUsername(username, '');

        const appBaseUrl = getAppBaseUrl(req);
        const redirectTo = `${appBaseUrl}/index.html?kick_username=${encodeURIComponent(username)}&kick_avatar=${encodeURIComponent(avatar)}`;
        res.redirect(redirectTo);
    } catch (err) {
        console.error('OAuth callback error', err);
        res.status(500).send('OAuth callback error');
    }
});

// Chess game constants
const INITIAL_BOARD = [
    ['♜', '♞', '♝', '♛', '♚', '♝', '♞', '♜'],
    ['♟', '♟', '♟', '♟', '♟', '♟', '♟', '♟'],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['♙', '♙', '♙', '♙', '♙', '♙', '♙', '♙'],
    ['♖', '♘', '♗', '♕', '♔', '♗', '♘', '♖']
];

// Game rooms storage
const rooms = {};
const usernames = {};

// Helper function to create room ID
function generateRoomId() {
    return 'room_' + Math.random().toString(36).substr(2, 9);
}

// Helper function to get all rooms info
function getRoomsInfo() {
    const roomsInfo = {};
    for (const [roomId, room] of Object.entries(rooms)) {
        roomsInfo[roomId] = {
            id: roomId,
            playerCount: Object.keys(room.players).length,
            spectatorCount: Object.keys(room.spectators).length,
            players: Object.values(room.players).map(p => p.username),
            status: room.status
        };
    }
    return roomsInfo;
}

// Chess helper functions
function isWhitePiece(piece) {
    return '♔♕♖♗♘♙'.includes(piece);
}

function isBlackPiece(piece) {
    return '♚♛♜♝♞♟'.includes(piece);
}

function getPieceColor(piece) {
    if (isWhitePiece(piece)) return 'white';
    if (isBlackPiece(piece)) return 'black';
    return null;
}

function getPieceType(piece) {
    const pieces = {
        '♔': 'king', '♚': 'king',
        '♕': 'queen', '♛': 'queen',
        '♖': 'rook', '♜': 'rook',
        '♗': 'bishop', '♝': 'bishop',
        '♘': 'knight', '♞': 'knight',
        '♙': 'pawn', '♟': 'pawn'
    };
    return pieces[piece];
}

function findKing(board, color) {
    const kingSymbol = color === 'white' ? '♔' : '♚';
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            if (board[row][col] === kingSymbol) {
                return { row, col };
            }
        }
    }
    return null;
}

function isSquareAttacked(board, row, col, byColor) {
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = board[r][c];
            if (piece && getPieceColor(piece) === byColor) {
                const moves = getRawMoves(board, r, c, true);
                if (moves.some(m => m.row === row && m.col === col)) {
                    return true;
                }
            }
        }
    }
    return false;
}

function isInCheck(board, color) {
    const king = findKing(board, color);
    if (!king) return false;
    const opponentColor = color === 'white' ? 'black' : 'white';
    return isSquareAttacked(board, king.row, king.col, opponentColor);
}

function getRawMoves(board, row, col, forAttackCheck = false) {
    const piece = board[row][col];
    if (!piece) return [];
    
    const type = getPieceType(piece);
    const color = getPieceColor(piece);
    const moves = [];

    switch (type) {
        case 'pawn':
            const direction = color === 'white' ? -1 : 1;
            const startRow = color === 'white' ? 6 : 1;
            
            if (!forAttackCheck) {
                const newRow = row + direction;
                if (newRow >= 0 && newRow < 8 && !board[newRow][col]) {
                    moves.push({ row: newRow, col });
                    
                    if (row === startRow) {
                        const doubleRow = row + 2 * direction;
                        if (!board[doubleRow][col]) {
                            moves.push({ row: doubleRow, col });
                        }
                    }
                }
            }
            
            for (const dc of [-1, 1]) {
                const newRow = row + direction;
                const newCol = col + dc;
                if (newRow >= 0 && newRow < 8 && newCol >= 0 && newCol < 8) {
                    const targetPiece = board[newRow][newCol];
                    if (forAttackCheck || (targetPiece && getPieceColor(targetPiece) !== color)) {
                        moves.push({ row: newRow, col: newCol });
                    }
                }
            }
            break;

        case 'knight':
            const knightMoves = [
                [-2, -1], [-2, 1], [-1, -2], [-1, 2],
                [1, -2], [1, 2], [2, -1], [2, 1]
            ];
            for (const [dr, dc] of knightMoves) {
                const newRow = row + dr;
                const newCol = col + dc;
                if (newRow >= 0 && newRow < 8 && newCol >= 0 && newCol < 8) {
                    const targetPiece = board[newRow][newCol];
                    if (!targetPiece || getPieceColor(targetPiece) !== color) {
                        moves.push({ row: newRow, col: newCol });
                    }
                }
            }
            break;

        case 'bishop':
        case 'queen':
            const diagonalDirections = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
            for (const [dr, dc] of diagonalDirections) {
                for (let i = 1; i < 8; i++) {
                    const newRow = row + dr * i;
                    const newCol = col + dc * i;
                    if (newRow < 0 || newRow >= 8 || newCol < 0 || newCol >= 8) break;
                    const targetPiece = board[newRow][newCol];
                    if (!targetPiece) {
                        moves.push({ row: newRow, col: newCol });
                    } else {
                        if (getPieceColor(targetPiece) !== color) {
                            moves.push({ row: newRow, col: newCol });
                        }
                        break;
                    }
                }
            }
            if (type === 'bishop') break;

        case 'rook':
        case 'queen':
            const straightDirections = [[-1, 0], [1, 0], [0, -1], [0, 1]];
            for (const [dr, dc] of straightDirections) {
                for (let i = 1; i < 8; i++) {
                    const newRow = row + dr * i;
                    const newCol = col + dc * i;
                    if (newRow < 0 || newRow >= 8 || newCol < 0 || newCol >= 8) break;
                    const targetPiece = board[newRow][newCol];
                    if (!targetPiece) {
                        moves.push({ row: newRow, col: newCol });
                    } else {
                        if (getPieceColor(targetPiece) !== color) {
                            moves.push({ row: newRow, col: newCol });
                        }
                        break;
                    }
                }
            }
            break;

        case 'king':
            const kingMoves = [
                [-1, -1], [-1, 0], [-1, 1],
                [0, -1], [0, 1],
                [1, -1], [1, 0], [1, 1]
            ];
            for (const [dr, dc] of kingMoves) {
                const newRow = row + dr;
                const newCol = col + dc;
                if (newRow >= 0 && newRow < 8 && newCol >= 0 && newCol < 8) {
                    const targetPiece = board[newRow][newCol];
                    if (!targetPiece || getPieceColor(targetPiece) !== color) {
                        moves.push({ row: newRow, col: newCol });
                    }
                }
            }
            break;
    }

    return moves;
}

function getValidMoves(board, row, col) {
    const piece = board[row][col];
    if (!piece) return [];
    
    const color = getPieceColor(piece);
    const rawMoves = getRawMoves(board, row, col);
    const validMoves = [];

    for (const move of rawMoves) {
        // Save original board state
        const originalBoard = JSON.parse(JSON.stringify(board));
        
        // Apply move temporarily
        board[move.row][move.col] = piece;
        board[row][col] = '';
        
        if (!isInCheck(board, color)) {
            validMoves.push(move);
        }
        
        // Restore board
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                board[r][c] = originalBoard[r][c];
            }
        }
    }

    return validMoves;
}

function hasValidMoves(board, color) {
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const piece = board[row][col];
            if (piece && getPieceColor(piece) === color) {
                if (getValidMoves(board, row, col).length > 0) {
                    return true;
                }
            }
        }
    }
    return false;
}

function formatMove(moveRecord) {
    const { to, piece, promotion } = moveRecord;
    const type = getPieceType(piece);
    const colLetters = 'abcdefgh';
    const toSquare = colLetters[to.col] + (8 - to.row);
    
    let notation = '';
    if (type !== 'pawn' || promotion) {
        const pieceSymbol = type === 'knight' ? 'N' : type.charAt(0).toUpperCase();
        notation = pieceSymbol;
    }
    
    notation += toSquare;
    
    if (promotion) {
        const promoType = getPieceType(promotion);
        notation += '=' + (promoType === 'knight' ? 'N' : promoType.charAt(0).toUpperCase());
    }

    return notation;
}

function applyMove(room, from, to) {
    const piece = room.board[from.row][from.col];
    const color = getPieceColor(piece);
    const type = getPieceType(piece);
    const capturedPiece = room.board[to.row][to.col];
    
    const moveData = {
        from,
        to,
        piece,
        capturedPiece: null,
        promotion: null,
        castling: null,
        enPassantCapture: null
    };

    // Handle capture
    if (capturedPiece) {
        moveData.capturedPiece = capturedPiece;
        room.capturedPieces[color === 'white' ? 'black' : 'white'].push(capturedPiece);
    }

    // Move piece
    room.board[to.row][to.col] = piece;
    room.board[from.row][from.col] = '';

    // Handle pawn promotion
    if (type === 'pawn' && (to.row === 0 || to.row === 7)) {
        // Default promotion to queen (client will handle UI for selection)
        const promotionPiece = color === 'white' ? '♕' : '♛';
        room.board[to.row][to.col] = promotionPiece;
        moveData.promotion = promotionPiece;
        room.pendingPromotion = { row: to.row, col: to.col, color };
    }

    // Update move history
    room.moveHistory.push(formatMove(moveData));
    room.lastMove = { from, to };

    // Switch turn
    room.currentTurn = color === 'white' ? 'black' : 'white';
    room.inCheck = isInCheck(room.board, room.currentTurn);

    // Check for game over
    if (!hasValidMoves(room.board, room.currentTurn)) {
        room.gameOver = true;
        if (room.inCheck) {
            const winner = color === 'white' ? 'White' : 'Black';
            io.to(room.id).emit('gameOver', {
                winner,
                reason: 'checkmate'
            });
        } else {
            io.to(room.id).emit('gameOver', {
                winner: null,
                reason: 'stalemate'
            });
        }
    }

    return moveData;
}

io.on('connection', (socket) => {
    console.log('New user connected:', socket.id);

    socket.on('joinLobby', (username) => {
        const safeUsername = getSafeUsername(username, socket.id);
        usernames[socket.id] = safeUsername;
        
        io.emit('roomsUpdate', getRoomsInfo());
        
        console.log(`${safeUsername} (${socket.id}) joined lobby`);
    });

    socket.on('createRoom', () => {
        const roomId = generateRoomId();
        const username = getSafeUsername(usernames[socket.id], socket.id);
        usernames[socket.id] = username;

        rooms[roomId] = {
            id: roomId,
            players: {
                [socket.id]: {
                    username,
                    color: 'white'
                }
            },
            spectators: {},
            board: JSON.parse(JSON.stringify(INITIAL_BOARD)),
            currentTurn: 'white',
            capturedPieces: { white: [], black: [] },
            moveHistory: [],
            inCheck: false,
            gameOver: false,
            lastMove: null,
            pendingPromotion: null,
            status: 'waiting'
        };

        socket.join(roomId);

        io.emit('roomsUpdate', getRoomsInfo());
        socket.emit('roomUpdate', {
            roomId,
            room: rooms[roomId],
            yourRole: 'player'
        });

        console.log(`${username} created room ${roomId}`);
    });

    socket.on('joinRoom', (roomId, isSpectator = false) => {
        if (!rooms[roomId]) {
            socket.emit('error', 'Room not found');
            return;
        }

        const username = getSafeUsername(usernames[socket.id], socket.id);
        usernames[socket.id] = username;
        const room = rooms[roomId];

        if (isSpectator) {
            room.spectators[socket.id] = username;
            socket.join(roomId);
            io.emit('roomsUpdate', getRoomsInfo());
            socket.emit('roomUpdate', {
                roomId,
                room,
                yourRole: 'spectator'
            });
            socket.to(roomId).emit('roomUpdate', {
                roomId,
                room
            });
            console.log(`${username} joined room ${roomId} as spectator`);
        } else {
            if (Object.keys(room.players).length >= 2) {
                room.spectators[socket.id] = username;
                socket.join(roomId);
                io.emit('roomsUpdate', getRoomsInfo());
                socket.emit('roomUpdate', {
                    roomId,
                    room,
                    yourRole: 'spectator',
                    message: 'Room full — joined as spectator'
                });
                console.log(`${username} joined room ${roomId} as spectator (room was full)`);
                return;
            }

            // Assign black to second player
            const playerColor = Object.keys(room.players).length === 0 ? 'white' : 'black';
            console.log('Assigning color to', username, ':', playerColor, 'total players:', Object.keys(room.players).length);
            room.players[socket.id] = {
                username,
                color: playerColor
            };
            socket.join(roomId);

            io.emit('roomsUpdate', getRoomsInfo());
            socket.emit('roomUpdate', {
                roomId,
                room,
                yourRole: 'player'
            });
            socket.to(roomId).emit('roomUpdate', {
                roomId,
                room
            });

            // If room now has 2 players, start game
            if (Object.keys(room.players).length === 2) {
                room.status = 'playing';
                io.to(roomId).emit('gameStart', room);
            }

            console.log(`${username} joined room ${roomId} as player (${playerColor})`);
        }
    });

    socket.on('makeMove', (roomId, move) => {
        console.log('Received makeMove from', socket.id, 'room:', roomId, 'move:', move);
        
        if (!rooms[roomId]) {
            socket.emit('error', 'Room not found');
            return;
        }

        const room = rooms[roomId];
        const player = room.players[socket.id];
        
        if (!player) {
            socket.emit('error', 'You are not a player in this room');
            return;
        }

        if (room.gameOver) {
            socket.emit('error', 'Game is over');
            return;
        }

        // Check if it's this player's turn
        const playerColor = player.color;
        if (room.currentTurn !== playerColor) {
            socket.emit('error', 'Not your turn');
            return;
        }

        const { from, to } = move;
        const piece = room.board[from.row][from.col];
        
        if (!piece) {
            socket.emit('error', 'No piece at starting position');
            return;
        }

        const color = getPieceColor(piece);
        if (color !== playerColor) {
            socket.emit('error', 'Cannot move opponent\'s piece');
            return;
        }

        // Get valid moves
        const validMoves = getValidMoves(room.board, from.row, from.col);
        console.log('Valid moves for piece at', from.row, from.col + ':', validMoves);
        const isValidMove = validMoves.some(m => m.row === to.row && m.col === to.col);

        if (!isValidMove) {
            console.log('Invalid move rejected');
            socket.emit('error', 'Invalid move');
            return;
        }

        // Apply the move
        const moveData = applyMove(room, from, to);

        // Broadcast move to all in room
        io.to(roomId).emit('chessMove', moveData);
        io.to(roomId).emit('roomUpdate', {
            roomId,
            room
        });

        // Handle promotion if needed
        if (room.pendingPromotion) {
            io.to(roomId).emit('chessPromotion', {
                row: room.pendingPromotion.row,
                col: room.pendingPromotion.col,
                color: room.pendingPromotion.color
            });
        }
    });

    socket.on('promotionChoice', (roomId, promotion) => {
        if (!rooms[roomId]) {
            socket.emit('error', 'Room not found');
            return;
        }

        const room = rooms[roomId];
        
        if (!room.pendingPromotion) {
            socket.emit('error', 'No pending promotion');
            return;
        }

        const { row, col, piece } = promotion;
        room.board[row][col] = piece;
        room.pendingPromotion = null;

        io.to(roomId).emit('roomUpdate', {
            roomId,
            room
        });
    });

    socket.on('resetGame', (roomId) => {
        if (!rooms[roomId]) {
            socket.emit('error', 'Room not found');
            return;
        }

        const room = rooms[roomId];
        
        // Reset chess game state
        room.board = JSON.parse(JSON.stringify(INITIAL_BOARD));
        room.currentTurn = 'white';
        room.capturedPieces = { white: [], black: [] };
        room.moveHistory = [];
        room.inCheck = false;
        room.gameOver = false;
        room.lastMove = null;
        room.pendingPromotion = null;
        room.status = Object.keys(room.players).length >= 2 ? 'playing' : 'waiting';

        io.to(roomId).emit('gameReset', {
            roomId,
            room
        });
    });

    socket.on('leaveRoom', (roomId) => {
        if (!rooms[roomId]) return;

        const username = usernames[socket.id];
        const room = rooms[roomId];

        if (room.players[socket.id]) {
            delete room.players[socket.id];
        }
        if (room.spectators[socket.id]) {
            delete room.spectators[socket.id];
        }

        socket.leave(roomId);

        if (Object.keys(room.players).length === 0 && Object.keys(room.spectators).length === 0) {
            delete rooms[roomId];
            console.log(`Room ${roomId} deleted (empty)`);
        } else {
            io.to(roomId).emit('roomUpdate', {
                roomId,
                room
            });
        }

        io.emit('roomsUpdate', getRoomsInfo());
        console.log(`${username} left room ${roomId}`);
    });

    socket.on('disconnect', () => {
        const username = usernames[socket.id];
        console.log(`${username} (${socket.id}) disconnected`);

        for (const roomId of Object.keys(rooms)) {
            const room = rooms[roomId];
            if (room.players[socket.id]) {
                delete room.players[socket.id];
            }
            if (room.spectators[socket.id]) {
                delete room.spectators[socket.id];
            }

            if (Object.keys(room.players).length === 0 && Object.keys(room.spectators).length === 0) {
                delete rooms[roomId];
            } else {
                io.to(roomId).emit('roomUpdate', { roomId, room });
            }
        }

        delete usernames[socket.id];
        io.emit('roomsUpdate', getRoomsInfo());
    });

    socket.on('getRooms', () => {
        socket.emit('roomsUpdate', getRoomsInfo());
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
