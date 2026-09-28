const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { Server } = require('socket.io');
const { io: connect } = require('socket.io-client');
let server, io, url;const clients=[];
function event(socket,name){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{socket.off(name,done);reject(new Error('Timeout: '+name));},2500);function done(data){clearTimeout(timer);resolve(data);}socket.once(name,done);});}
async function client(){const s=connect(url,{forceNew:true});clients.push(s);await event(s,'connect');s.emit('joinLobby','Test');return s;}
async function update(s,action){const promise=event(s,'roomUpdate');action();return (await promise).room;}
async function pair(){const a=await client(),b=await client();let r=await update(a,()=>a.emit('createRoom'));r=await update(b,()=>b.emit('joinRoom',r.id));return {a,b,r};}
async function move(s,id,from,to,promotion){const promise=new Promise((resolve,reject)=>{const timer=setTimeout(()=>{s.off('roomUpdate',done);reject(new Error('Move timeout '+from+to));},2500);function done({room}){const last=room.history.at(-1);if(last?.from!==from||last?.to!==to)return;clearTimeout(timer);s.off('roomUpdate',done);resolve(room);}s.on('roomUpdate',done);});s.emit('makeMove',id,{from,to,promotion});return promise;}
before(async()=>{server=http.createServer();io=new Server(server);require('../chess-server')(io);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));url='http://127.0.0.1:'+server.address().port;});
after(async()=>{clients.forEach(s=>s.disconnect());await new Promise(resolve=>io.close(resolve));});
test('server rejects malformed, out-of-turn and spectator moves and spectator resets',async()=>{
  const {a,b,r}=await pair();
  for(const [s,payload] of [[a,null],[a,{from:{row:999},to:null}],[a,{from:'e2',to:'e5'}],[b,{from:'e7',to:'e5'}]]){const error=event(s,'error');s.emit('makeMove',r.id,payload);assert.ok(await error);}
  const c=await client();await update(c,()=>c.emit('joinRoom',r.id,true));
  for(const command of ['resetGame','makeMove']){const error=event(c,'error');c.emit(command,r.id,{from:'e2',to:'e4'});assert.ok(await error);}
  const after=await move(a,r.id,'e2','e4');assert.equal(after.history.length,1);
});
test('castling moves both king and rook, en passant removes captured pawn',async()=>{
  const {a,b,r}=await pair();let state;
  for(const [index,from,to] of [[0,'e2','e4'],[1,'a7','a6'],[0,'e4','e5'],[1,'d7','d5'],[0,'e5','d6'],[1,'e7','e6'],[0,'g1','f3'],[1,'b7','b6'],[0,'f1','e2'],[1,'c7','c6'],[0,'e1','g1']])state=await move(index?b:a,r.id,from,to);
  const {Chess}=require('chess.js'),g=new Chess(state.fen);assert.equal(g.get('d5'),undefined);assert.equal(g.get('d6').type,'p');assert.equal(g.get('f1').type,'r');assert.equal(g.get('g1').type,'k');assert.equal(state.history.at(-1).san,'O-O');
});
test('mate ends a room and rematch requires both players',async()=>{
  const {a,b,r}=await pair();await move(a,r.id,'f2','f3');await move(b,r.id,'e7','e5');await move(a,r.id,'g2','g4');let state=await move(b,r.id,'d8','h4');assert.equal(state.gameOver,true);assert.equal(state.status,'finished');
  const request=event(b,'rematchRequested');a.emit('resetGame',r.id);await request;state=await update(b,()=>b.emit('resetGame',r.id));assert.equal(state.history.length,0);assert.equal(state.status,'playing');
});
test('departure pauses game and replacement receives vacant white color',async()=>{
  const {a,b,r}=await pair();let state=await update(b,()=>a.emit('leaveRoom',r.id));assert.equal(state.status,'waiting');const c=await client();state=await update(c,()=>c.emit('joinRoom',r.id));assert.equal(state.players[c.id].color,'w');assert.equal(state.players[b.id].color,'b');
  const next=await update(c,()=>c.emit('joinRoom',r.id));assert.equal(Object.keys(next.players).length,2);assert.equal(Object.keys(next.spectators).length,0);
});
test('threefold repetition survives full history and ends as draw',async()=>{
  const {a,b,r}=await pair();let state;for(let i=0;i<2;i++)for(const [s,from,to] of [[a,'g1','f3'],[b,'g8','f6'],[a,'f3','g1'],[b,'f6','g8']])state=await move(s,r.id,from,to);assert.equal(state.gameOver,true);assert.equal(state.status,'finished');
});
test('underpromotion is atomic and invalid promotion is rejected',async()=>{
  const {a,b,r}=await pair();for(const [s,from,to] of [[a,'a2','a4'],[b,'h7','h5'],[a,'a4','a5'],[b,'h5','h4'],[a,'a5','a6'],[b,'h4','h3'],[a,'a6','b7'],[b,'h3','g2']])await move(s,r.id,from,to);
  const error=event(a,'error');a.emit('makeMove',r.id,{from:'b7',to:'a8',promotion:'k'});assert.ok(await error);
  const state=await move(a,r.id,'b7','a8','n');assert.equal(state.history.at(-1).promotion,'n');assert.equal(state.fen[0],'N');
});
