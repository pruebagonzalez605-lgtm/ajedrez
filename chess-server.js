const { Chess } = require('chess.js');

// The server owns the complete game, including repetition and castling rights.
module.exports = function registerChess(io) {
  const rooms = new Map();
  const info = () => Object.fromEntries([...rooms].map(([id, r]) => [id, {
    id, players: Object.values(r.players).map(p => p.username),
    playerCount: Object.keys(r.players).length, spectatorCount: Object.keys(r.spectators).length, status: r.status
  }]));
  const snapshot = r => ({ id: r.id, players: r.players, spectators: r.spectators,
    fen: r.game.fen(), pgn: r.game.pgn(), history: r.game.history({ verbose: true }),
    status: r.status, gameOver: r.game.isGameOver(), inCheck: r.game.isCheck() });
  const publish = r => { io.to(r.id).emit('roomUpdate', { roomId: r.id, room: snapshot(r) }); io.emit('roomsUpdate', info()); };
  io.on('connection', socket => {
    let username = 'Invitado';
    let current = null;
    const fail = message => socket.emit('error', message);
    function leave() {
      const r = rooms.get(current);
      if (!r) return;
      delete r.players[socket.id]; delete r.spectators[socket.id];
      socket.leave(r.id); current = null; r.resetRequest = null;
      if (!Object.keys(r.players).length && !Object.keys(r.spectators).length) rooms.delete(r.id);
      else { r.status = r.game.isGameOver() ? 'finished' : Object.keys(r.players).length === 2 ? 'playing' : 'waiting'; publish(r); }
      io.emit('roomsUpdate', info());
    }
    socket.on('joinLobby', name => { username = typeof name === 'string' ? name.trim().slice(0, 28) || 'Invitado' : 'Invitado'; socket.emit('roomsUpdate', info()); });
    socket.on('getRooms', () => socket.emit('roomsUpdate', info()));
    socket.on('createRoom', () => {
      leave();
      const id = 'room_' + require('crypto').randomBytes(5).toString('hex');
      const r = { id, game: new Chess(), players: { [socket.id]: { username, color: 'w' } }, spectators: {}, status: 'waiting', resetRequest: null };
      rooms.set(id, r); current = id; socket.join(id); publish(r);
    });
    socket.on('joinRoom', (id, spectate = false) => {
      if (typeof id !== 'string' || !rooms.has(id)) return fail('La sala ya no existe.');
      if (current === id) return publish(rooms.get(id));
      leave(); const r = rooms.get(id); current = id; socket.join(id);
      if (spectate || Object.keys(r.players).length === 2) r.spectators[socket.id] = username;
      else r.players[socket.id] = { username, color: Object.values(r.players).some(p => p.color === 'w') ? 'b' : 'w' };
      r.status = r.game.isGameOver() ? 'finished' : Object.keys(r.players).length === 2 ? 'playing' : 'waiting'; publish(r);
    });
    socket.on('makeMove', (id, move) => {
      const r = rooms.get(id);
      if (!r || current !== id || !r.players[socket.id]) return fail('No eres jugador de esta sala.');
      if (r.status !== 'playing' || r.game.isGameOver()) return fail('La partida no está activa.');
      if (r.players[socket.id].color !== r.game.turn()) return fail('Es el turno de tu rival.');
      if (!move || !/^[a-h][1-8]$/.test(move.from) || !/^[a-h][1-8]$/.test(move.to) || (move.promotion && !/^[qrbn]$/.test(move.promotion))) return fail('Movimiento inválido.');
      try { r.game.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' }); }
      catch { return fail('Movimiento ilegal.'); }
      r.resetRequest = null;
      if (r.game.isGameOver()) r.status = 'finished';
      publish(r);
    });
    socket.on('resetGame', id => {
      const r = rooms.get(id);
      if (!r || !r.players[socket.id]) return fail('Solo los jugadores pueden pedir una revancha.');
      const opponent = Object.keys(r.players).find(key => key !== socket.id);
      if (opponent && r.resetRequest !== opponent) { r.resetRequest = socket.id; io.to(opponent).emit('rematchRequested'); socket.emit('notice', 'Solicitud enviada. Esperando a tu rival.'); return; }
      r.game.reset(); r.resetRequest = null; r.status = opponent ? 'playing' : 'waiting'; publish(r);
    });
    socket.on('leaveRoom', leave); socket.on('disconnect', leave);
    socket.emit('roomsUpdate', info());
  });
};
