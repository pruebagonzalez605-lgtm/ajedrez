import './style.css';
import { Chess } from 'chess.js';
import { io } from 'socket.io-client';
import { createBoard } from './board.js';
const $ = id => document.getElementById(id);
const storage = { get(key){try{return localStorage.getItem(key);}catch{return null;}}, set(key,value){try{localStorage.setItem(key,value);}catch{}} };
const game = new Chess();
let username = storage.get('enroque-name') || 'Invitado';
let kickProfile = storage.get('enroque-kick') === 'true';
let avatarUrl = storage.get('kick_avatar') || '';
function safeAvatar(value){try{const url=new URL(value);return url.protocol==='https:'?url.href:'';}catch{return '';}}
let selected = null, flipped = false, view = '3d', room = null, online = false, socket, board;
let pending = false, sound = false, audio, toastTimer, promotionMove = null, confirmAction;
const symbols = { w: {k:'♔',q:'♕',r:'♖',b:'♗',n:'♘',p:'♙'}, b:{k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'} };
const names = {p:'peón',n:'caballo',b:'alfil',r:'torre',q:'dama',k:'rey'};
let history = [];
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4500);}
function open(id){if(!$(id).open)$(id).showModal();}
function ask(title,copy,action){$('confirm-title').textContent=title;$('confirm-copy').textContent=copy;confirmAction=action;open('confirm-dialog');}
$('confirm-yes').onclick=()=>{ $('confirm-dialog').close();confirmAction?.(); };
document.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>button.closest('dialog').close());
function persist(){if(!online)storage.set('enroque-pgn',game.pgn());}
function restoreLocal(){game.reset();try{const pgn=storage.get('enroque-pgn');if(pgn)game.loadPgn(pgn);}catch{storage.set('enroque-pgn','');}history=game.history({verbose:true});}
restoreLocal();
function canMove(){return !game.isGameOver()&&!pending&&(!online||(socket?.connected&&room?.status==='playing'&&room.players[socket.id]?.color===game.turn()));}
function legalMoves(){return selected?game.moves({square:selected,verbose:true}):[];}
function clickSquare(square){
  if(!canMove())return;
  const moves=legalMoves().filter(m=>m.to===square);
  if(moves.length){const move={from:selected,to:square};if(moves.some(m=>m.promotion)){promotionMove=move;$('promotion-options').replaceChildren();for(const type of ['q','r','b','n']){const b=document.createElement('button');b.textContent=symbols[game.turn()][type];b.setAttribute('aria-label',names[type]);b.onclick=()=>{ $('promotion-dialog').close();sendMove({...promotionMove,promotion:type});promotionMove=null; };$('promotion-options').append(b);}open('promotion-dialog');return;}sendMove(move);return;}
  const p=game.get(square);selected=p?.color===game.turn()&&selected!==square?square:null;render();
}
function playSound(){if(!sound)return;try{audio ||= new (window.AudioContext||window.webkitAudioContext)();audio.resume();const osc=audio.createOscillator(),gain=audio.createGain();osc.type='sine';osc.frequency.setValueAtTime(520,audio.currentTime);osc.frequency.exponentialRampToValueAtTime(220,audio.currentTime+.09);gain.gain.setValueAtTime(.08,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.12);osc.connect(gain);gain.connect(audio.destination);osc.start();osc.stop(audio.currentTime+.13);}catch{}}
function sendMove(move){
  selected=null;
  if(online){pending=true;socket.emit('makeMove',room.id,move);render();return;}
  try{game.move(move);history=game.history({verbose:true});persist();playSound();render();}catch{toast('Ese movimiento no es legal.');}
}
function setView(next){view=next;board?.setVisible(next==='3d');$('board2d').hidden=next!=='2d';$('view3d').classList.toggle('active',next==='3d');$('view2d').classList.toggle('active',next==='2d');$('render-label').textContent=next==='3d'?'VISTA 3D INTERACTIVA':'VISTA 2D · ACCESIBLE';if(next==='2d')render2d();}
function fallback(){setView('2d');$('view3d').disabled=true;toast('WebGL no está disponible. Puedes seguir jugando en 2D.');}
try{board=createBoard($('board3d'),clickSquare,fallback);}catch(error){console.warn('WebGL unavailable',error.message);fallback();}
function render2d(){
  const active=document.activeElement?.dataset.square,legal=legalMoves().map(m=>m.to),last=history.at(-1);$('board2d').replaceChildren();
  const squares=Array.from({length:64},(_,i)=>'abcdefgh'[i%8]+(8-Math.floor(i/8)));if(flipped)squares.reverse();
  for(const square of squares){const p=game.get(square),button=document.createElement('button'),col=square.charCodeAt(0)-97,row=8-Number(square[1]);button.className='square'+((col+row)%2?' black-square':'')+(p?.color==='b'?' black-piece':'')+(square===selected?' selected':'')+(legal.includes(square)?' legal':'')+(last&&(last.from===square||last.to===square)?' last':'');button.dataset.square=square;button.textContent=p?symbols[p.color][p.type]:'';button.setAttribute('aria-label',square+(p?' '+names[p.type]+' '+(p.color==='w'?'blanco':'negro'):' vacía'));button.setAttribute('aria-pressed',String(selected===square));const label=document.createElement('small');label.textContent=square;button.append(label);button.onclick=()=>clickSquare(square);$('board2d').append(button);}
  if(active)$('board2d').querySelector(`[data-square="${active}"]`)?.focus({preventScroll:true});
}
function render(){
  const white=game.turn()==='w',over=game.isGameOver(),me=room?.players[socket?.id];
  $('turn-title').textContent=over?(game.isCheckmate()?'Jaque mate':'Tablas'):(white?'Juegan blancas':'Juegan negras');
  $('turn-icon').textContent=white?'♔':'♚';
  let status=history.length?'Selecciona una pieza y encuentra tu siguiente jugada.':'El tablero es tuyo. Haz tu primer movimiento.';
  if(game.isCheck())status='¡Jaque! Tu rey necesita protección.';
  if(over)status=game.isCheckmate()?`Victoria de ${white?'negras':'blancas'}. Una partida para recordar.`:game.isStalemate()?'Rey ahogado. La partida termina en tablas.':game.isThreefoldRepetition()?'Tablas por triple repetición.':game.isInsufficientMaterial()?'Tablas por material insuficiente.':'Tablas por la regla de los 50 movimientos.';
  if(online&&!over){if(!socket?.connected)status='Conexión perdida. Reconectando…';else if(room?.status==='waiting')status='Esperando a un rival. Comparte el enlace de la sala.';else if(!me)status='Estás viendo esta partida como espectador.';else if(me.color!==game.turn())status='Tu rival está pensando. Prepara tu siguiente jugada.';}
  $('game-status').textContent=status;$('turn-progress').style.transform=white?'translateX(0)':'translateX(100%)';
  $('move-number').textContent='Movimiento '+String(Math.floor(history.length/2)+1).padStart(2,'0');
  $('mode-label').textContent=online?(me?'Multijugador':'Espectador'):'Partida local';$('room-tag').textContent=online?'ONLINE':'LOCAL';
  for(const color of ['w','b']){const key=color==='w'?'white':'black',player=online?Object.values(room?.players||{}).find(p=>p.color===color):null;$(key+'-name').textContent=online?(player?.username||'Esperando rival…'):(color==='w'?'Blancas':'Negras');$(key+'-detail').textContent=online?(player?(player===me?'Tú · ':'')+(color==='w'?'Piezas blancas':'Piezas negras'):'Comparte tu sala para empezar'):(color==='w'?'Jugador 01':'Jugador 02');$(key+'-turn').classList.toggle('current',game.turn()===color&&!over);$(key+'-turn').textContent=game.turn()===color&&!over?'● EN TURNO':color==='w'?'BLANCAS':'NEGRAS';}
  $('undo').disabled=online||!history.length;$('new-game').disabled=online&&!me;$('new-game').innerHTML=online?'<span>↻</span> Pedir revancha <span>↗</span>':'<span>＋</span> Nueva partida <span>↗</span>';
  $('leave-room').hidden=!online;$('share-room').hidden=!online;
  $('history').replaceChildren();
  if(!history.length){const empty=document.createElement('div');empty.className='empty-history';empty.innerHTML='<span>♙</span><p>Toda gran partida<br>empieza con una jugada.</p>';$('history').append(empty);}
  for(let i=0;i<history.length;i+=2){const row=document.createElement('div');row.className='history-row';for(const text of [String(i/2+1).padStart(2,'0'),history[i].san,history[i+1]?.san||'—']){const cell=document.createElement('span');cell.textContent=text;row.append(cell);}$('history').append(row);}
  $('history').scrollTop=$('history').scrollHeight;
  $('captures').textContent=history.filter(m=>m.captured).map(m=>symbols[m.color==='w'?'b':'w'][m.captured]).join(' ')||'—';
  board?.update(game,selected,legalMoves().map(m=>m.to),history.at(-1));if(view==='2d')render2d();
}
$('view2d').onclick=()=>setView('2d');$('view3d').onclick=()=>setView('3d');
$('flip').onclick=()=>{flipped=!flipped;board?.reset(flipped);if(view==='2d')render2d();};$('camera').onclick=()=>board?.reset(flipped);
$('sound').onclick=()=>{sound=!sound;$('sound').classList.toggle('active',sound);$('sound').setAttribute('aria-pressed',String(sound));$('sound').setAttribute('aria-label',sound?'Silenciar sonido':'Activar sonido');if(sound)playSound();};
$('undo').onclick=()=>{if(online)return;game.undo();selected=null;history=game.history({verbose:true});persist();render();};
$('new-game').onclick=()=>{if(online){socket.emit('resetGame',room.id);return;}const reset=()=>{game.reset();history=[];selected=null;persist();render();};if(history.length)ask('¿Empezar otra partida?','Puedes descargar la partida actual desde el historial antes de reiniciarla.',reset);else reset();};
$('export').onclick=()=>{const blob=new Blob([game.pgn()||'[Event "Enroque"]\n\n*'],{type:'application/x-chess-pgn'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='enroque-partida.pgn';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Partida descargada en formato PGN.');};
function updateName(){
  $('profile-name').textContent=username;
  const avatar=$('profile').querySelector('.avatar');avatar.replaceChildren();avatar.textContent=username[0].toUpperCase();
  const url=kickProfile?safeAvatar(avatarUrl):'';
  if(url){const img=document.createElement('img');img.src=url;img.alt='';img.referrerPolicy='no-referrer';img.onerror=()=>{avatar.textContent=username[0].toUpperCase();};avatar.replaceChildren(img);}
  $('username').value=username==='Invitado'?'':username;
  $('kick-login').textContent=kickProfile?'Cambiar cuenta de Kick ↗':'Conectar con Kick ↗';
  $('profile-provider').textContent=kickProfile?'Perfil de Kick':'Perfil de invitado';
  $('logout').hidden=username==='Invitado'&&!kickProfile;
}
$('profile').onclick=()=>open('profile-dialog');$('name-form').onsubmit=e=>{e.preventDefault();username=$('username').value.trim().slice(0,28)||'Invitado';storage.set('enroque-name',username);kickProfile=false;storage.set('enroque-kick','false');updateName();if(socket?.connected)socket.emit('joinLobby',username);$('profile-dialog').close();};
const backend=window.APP_CONFIG?.backendUrl||location.origin;
$('kick-login').href=backend.replace(/\/$/,'')+'/auth/kick';
const params=new URLSearchParams(location.search);
const returnedFromKick=Boolean(params.get('kick_username'));
if(returnedFromKick){username=params.get('kick_username').slice(0,28);kickProfile=true;avatarUrl=safeAvatar(params.get('kick_avatar')||'');storage.set('enroque-name',username);storage.set('enroque-kick','true');storage.set('kick_avatar',avatarUrl);params.delete('kick_username');params.delete('kick_avatar');window.history.replaceState({},'',location.pathname+(params.size?'?'+params.toString():''));}
updateName();
let invite=params.get('room');
function connect(){
  if(socket)return;
  socket=io(backend,{autoConnect:false,timeout:15000,reconnectionDelay:1500});
  socket.on('connect',()=>{$('connection-state').textContent='● Conectado · Elige una sala o crea la tuya.';$('create-room').disabled=false;socket.emit('joinLobby',username);if(online){online=false;room=null;restoreLocal();render();toast('Conexión restablecida. Vuelve a entrar en tu sala.');open('lobby-dialog');}if(invite){socket.emit('joinRoom',invite,false);invite=null;}});
  socket.on('disconnect',()=>{$('connection-state').textContent='Sin conexión. Intentando reconectar…';$('create-room').disabled=true;pending=false;render();});
  socket.on('connect_error',()=>{$('connection-state').textContent='El servidor no responde todavía. Puede estar despertando; puedes seguir jugando en local.';$('create-room').disabled=true;});
  socket.on('error',message=>{pending=false;toast(String(message));render();});socket.on('notice',toast);
  socket.on('roomsUpdate',renderRooms);
  socket.on('roomUpdate',data=>{
    if(!data.room?.fen){toast('El servidor necesita actualizarse a la nueva versión.');return;}
    const wasOnline=online,changedRoom=room?.id!==data.room.id,oldLength=history.length;if(!wasOnline)persist();
    room=data.room;online=true;pending=false;selected=null;game.loadPgn(room.pgn);history=game.history({verbose:true});
    if(changedRoom){flipped=room.players[socket.id]?.color==='b';board?.reset(flipped);$('lobby-dialog').close();window.history.replaceState({},'',location.pathname+'?room='+encodeURIComponent(room.id));}
    if(wasOnline&&history.length>oldLength)playSound();render();
  });
  socket.on('rematchRequested',()=>ask('Tu rival quiere una revancha.','Si aceptas, el tablero volverá a su posición inicial.',()=>socket.emit('resetGame',room.id)));
  socket.connect();
}
function renderRooms(rooms){
  $('rooms-list').replaceChildren();
  if(!Object.keys(rooms).length){const p=document.createElement('p');p.className='room-empty';p.textContent='El próximo duelo puede ser el tuyo. Crea la primera sala.';$('rooms-list').append(p);}
  for(const r of Object.values(rooms)){const row=document.createElement('div');row.className='room';const description=document.createElement('div'),title=document.createElement('strong'),meta=document.createElement('small');title.textContent=r.players.join(' vs. ')||'Sala abierta';meta.textContent=`${r.playerCount}/2 jugadores · ${r.spectatorCount} espectadores · ${r.status==='waiting'?'Esperando':r.status==='finished'?'Finalizada':'En juego'}`;description.append(title,meta);row.append(description);if(r.playerCount<2&&r.status!=='finished'){const join=document.createElement('button');join.textContent='Jugar';join.onclick=()=>socket.emit('joinRoom',r.id,false);row.append(join);}const spectate=document.createElement('button');spectate.textContent='Ver';spectate.onclick=()=>socket.emit('joinRoom',r.id,true);row.append(spectate);$('rooms-list').append(row);}
  if(online){const share=document.createElement('button');share.textContent='↗ Copiar enlace de mi sala';share.onclick=async()=>{try{await navigator.clipboard.writeText(location.href);toast('Enlace de la sala copiado.');}catch{toast('Copia el enlace de esta página para invitar.');}};$('rooms-list').prepend(share);}
}
function showLobby(){open('lobby-dialog');$('create-room').disabled=!socket?.connected;connect();if(socket.connected)socket.emit('getRooms');}
for(const id of ['online-mode','nav-online','rooms-open'])$(id).onclick=showLobby;
function leave(){if(socket&&room)socket.emit('leaveRoom',room.id);online=false;room=null;pending=false;selected=null;flipped=false;window.history.replaceState({},'',location.pathname);restoreLocal();board?.reset(false);$('lobby-dialog').close();render();}
$('leave-room').onclick=leave;
$('share-room').onclick=async()=>{try{await navigator.clipboard.writeText(location.href);toast('Enlace de la sala copiado.');}catch{toast('Copia el enlace de esta página para invitar.');}};
for(const id of ['local-mode','nav-play'])$(id).onclick=()=>{if(online)ask('¿Volver a tu partida local?','Saldrás de la sala multijugador actual.',leave);};
$('nav-help').onclick=()=>open('help-dialog');$('refresh-rooms').onclick=()=>{connect();if(socket.connected)socket.emit('getRooms');else socket.connect();};$('create-room').onclick=()=>{if(socket?.connected)socket.emit('createRoom');};
$('logout').onclick=()=>{if(online)leave();username='Invitado';kickProfile=false;avatarUrl='';storage.set('enroque-name','');storage.set('enroque-kick','false');storage.set('kick_avatar','');if(socket){socket.disconnect();socket=null;}$('profile-dialog').close();updateName();render();toast('Has cerrado tu sesión en Enroque.');};
render();if(invite||returnedFromKick)showLobby();
