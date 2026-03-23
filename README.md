# 🎮 Rock Paper Scissors - Multiplayer Game con OAuth Kick

Un juego web multijugador de Piedra, Papel o Tijera con autenticación OAuth2 de Kick, soporte para espectadores y formato Best of 3.

## 🎯 Características

✅ **Autenticación OAuth2 Kick** - Integración completa con OAuth2 + PKCE
✅ **Lobbies Multijugador** - Crear y unirse a salas de juego
✅ **Comunicación en Tiempo Real** - Socket.IO para actualizaciones instantáneas
✅ **Formato Best of 3** - Primer jugador en ganar 2 rondas gana el partida
✅ **Modo Espectador** - Ver juegos en directo sin participar
✅ **Elecciones Ocultas** - Los espectadores ven "?" hasta que se revelen
✅ **Puntuación en Vivo** - Actualizaciones de puntuación en tiempo real
✅ **Gestión de Salas** - Crear, unirse y salir de salas dinámicamente

## 📋 Requisitos Previos

- Node.js (v14 o superior)
- npm
- Una aplicación registrada en Kick OAuth

## 🔐 Configuración de OAuth Kick

### Registro en Kick
1. Accede a [Kick Developer Console](https://id.kick.com/)
2. Registra una nueva aplicación OAuth2
3. Obtén tu `CLIENT_ID` y `CLIENT_SECRET`
4. Configura el URI de redirección:
   - Producción: `https://TU_BACKEND/auth/kick/callback`
   - Local: `http://localhost:3000/auth/kick/callback`

### Variables de Entorno

Crea un archivo `.env` o establece las siguientes variables de entorno:

```bash
# Credenciales OAuth
KICK_CLIENT_ID="tu_client_id"
KICK_CLIENT_SECRET="tu_client_secret"
# Debe coincidir con lo registrado en Kick (backend)
KICK_REDIRECT_URI="https://TU_BACKEND/auth/kick/callback"

# Frontend (Vercel) para redirigir al usuario luego del login
APP_ORIGIN="https://TU_FRONTEND.vercel.app"

# Scopes (opcional - por defecto)
KICK_SCOPE="user:read channel:read channel:write chat:write streamkey:read events:subscribe moderation:ban kicks:read"

# Endpoints OAuth (opcional - por defecto)
KICK_AUTH_URL="https://id.kick.com/oauth/authorize"
KICK_TOKEN_URL="https://id.kick.com/oauth/token"
KICK_USERINFO_URL="https://api.kick.com/public/v1/users"
```

**Nota**: El servidor usa PKCE (Proof Key for Code Exchange) para máxima seguridad.

## 🚀 Instalación y Ejecución

1. Navega al directorio del proyecto:
```bash
cd "JUEGO KICK"
```

2. Instala las dependencias:
```bash
npm install
```

3. Inicia el servidor:
```bash
npm start
```
o
```bash
node server.js
```

4. Abre tu navegador en:
```
http://localhost:3000
```

## 🚀 Despliegue Online (Vercel + Backend)

Para ejecutar en una URL pública, usa Vercel solo para el frontend y un host Node para el backend (Socket.IO).
Lee `DEPLOYMENT.md` y configura `config.js` + variables de entorno.

## 🎮 Cómo Jugar

### Para Jugadores:
1. **Inicia Sesión** - Haz clic en "Login with Kick" o ingresa un nombre de usuario
2. **Únete al Lobby** - Ve las salas disponibles o crea una nueva
3. **Elige** - Selecciona Piedra (🪨), Papel (📄) o Tijeras (✂️)
4. **Revela** - Ambos jugadores deben elegir antes de revelar
5. **Gana** - ¡Sé el primero en ganar 2 rondas!

### Para Espectadores:
1. **Inicia Sesión** - Igual que los jugadores
2. **Únete como Espectador** - Accede a una sala en modo espectador
3. **Observa** - Las elecciones aparecen como "?" hasta que se revelen
4. **Sigue el Juego** - Ve en tiempo real los puntos y el progreso

## 📏 Reglas del Juego

- **Piedra** vence a **Tijeras**
- **Papel** vence a **Piedra**
- **Tijeras** vence a **Papel**
- **Empate** si ambos eligen lo mismo

## 📁 Estructura de Archivos

```
JUEGO KICK/
├── server.js               # Servidor Express con Socket.IO
├── index.html              # Cliente principal de la aplicación
├── rock_paper_scissors.html # Cliente alternativo de R.P.S
├── config.js               # Configuración de frontend (backend URL)
├── package.json            # Dependencias del proyecto
├── package-lock.json       # Lock file de dependencias
├── .env.example            # Variables de entorno de ejemplo
├── vercel.json             # Configuración de deploy estático en Vercel
├── DEPLOYMENT.md           # Guía de despliegue
└── README.md               # Este archivo
```

## 🛠 Tecnologías Utilizadas

- **Backend**: Node.js, Express.js, Socket.IO
- **Frontend**: HTML5, CSS3, JavaScript Vanilla
- **Autenticación**: OAuth2 + PKCE (Kick)
- **Comunicación**: WebSockets (Socket.IO)
- **Criptografía**: Node.js crypto module

## 📡 API de Socket.IO

### Client → Server (Eventos Emitidos)

| Evento | Parámetros | Descripción |
|--------|-----------|-------------|
| `joinLobby` | `username` | Unirse al lobby con un nombre de usuario |
| `createRoom` | ninguno | Crear una nueva sala de juego |
| `joinRoom` | `roomId`, `isSpectator` | Unirse a una sala existente como jugador o espectador |
| `makeChoice` | `roomId`, `choice` | Enviar tu elección (rock, paper, scissors) |
| `revealChoices` | `roomId` | Revelar y procesar resultados |
| `nextRound` | `roomId` | Iniciar la siguiente ronda |
| `resetGame` | `roomId` | Resetear puntuaciones y empezar de nuevo |
| `leaveRoom` | `roomId` | Salir de la sala |
| `getRooms` | ninguno | Solicitar lista de salas disponibles |

### Server → Client (Eventos Recibidos)

| Evento | Datos | Descripción |
|--------|-------|-------------|
| `roomsUpdate` | `{roomId: {...}}` | Lista actualizada de salas disponibles |
| `roomUpdate` | `{roomId, room, yourRole}` | Estado de la sala ha cambiado |
| `userJoined` | `{userId, username}` | Un nuevo usuario se unió al lobby |
| `gameStart` | `room` | El juego comienza con 2 jugadores |
| `playerReady` | `{roomId, readyCount, totalPlayers}` | Un jugador ha hecho su elección |
| `bothPlayersReady` | `room` | Ambos jugadores están listos |
| `roundResult` | `{result, winner, scores, matchWinner}` | Resultado de la ronda |
| `nextRoundStarted` | `{roomId, room}` | Nueva ronda iniciada |
| `gameReset` | `{roomId, room}` | El juego ha sido reseteado |
| `error` | `mensaje` | Error en la operación |

## 🔄 Flujo de Juego

1. **Conexión**: Usuario se conecta y entra al lobby
2. **Creación/Unión**: Crea una sala nueva o se une a una existente
3. **Espera**: Si la sala tiene 1 jugador, espera al segundo
4. **Juego Iniciado**: Cuando hay 2 jugadores, el juego comienza
5. **Elecciones**: Cada jugador elige Rock, Paper o Scissors
6. **Reveal**: Se revelan las elecciones y se determina el ganador
7. **Puntuación**: Se actualiza la puntuación (Best of 3)
8. **Siguiente Ronda/Fin**: Si alguien llega a 2 victorias, termina; si no, nueva ronda

## 📊 Estructura de Datos

### Room (Sala)
```javascript
{
  id: string,                    // ID único de la sala
  players: {
    socketId: {
      username: string,          // Nombre del jugador
      choice: string | null,     // 'rock' | 'paper' | 'scissors' | null
      ready: boolean             // ¿Ha hecho su elección?
    }
  },
  spectators: { socketId: username },  // Espectadores de la sala
  roundsPlayed: number,          // Rondas jugadas
  scores: { socketId: number },  // Puntuación de cada jugador
  status: string,                // 'waiting' | 'playing' | 'finished'
  roundRevealed: boolean         // ¿Fue revelada esta ronda?
}
```

## 🎯 Ejemplo de Sesión

1. **Alex** se conecta y crea una sala
   - Sala: `room_abc123`, Status: `waiting`
   - Alex es el único jugador

2. **Jordan** se une a la misma sala
   - Sala: `room_abc123`, Status: `playing` (2 jugadores)
   - Se envía `gameStart` a todos

3. **Taylor** se une como espectador
   - Jordan ya está "full", Taylor se une automáticamente como espectador
   - `yourRole: 'spectator'`

4. **Ronda 1**:
   - Alex elige Rock 🪨
   - Jordan elige Scissors ✂️
   - Resultado: Alex gana (1-0)

5. Continúa hasta que alguien llegue a 2 victorias

## 🎨 Personalización

Puedes personalizar:
- **Puerto del servidor**: Modifica `PORT` en `server.js` (por defecto 3000)
- **Formato de juego**: Cambia `maxWins` en la lógica de `revealChoices` en `server.js`
- **Estilos**: Edita CSS en `index.html`
- **Mensajes**: Localiza y traduce strings en el cliente

## 🐛 Solución de Problemas

**El puerto 3000 ya está en uso:**
```bash
PORT=3001 npm start
```

**OAuth connection failed:**
- Verifica que `KICK_CLIENT_ID` y `KICK_CLIENT_SECRET` sean correctos
- Confirma que el `KICK_REDIRECT_URI` coincida con tu registro en Kick
- Revisa los logs del servidor para más detalles

**Socket.IO connection issues:**
- Asegúrate de que el servidor está ejecutándose: `npm start`
- Verifica la consola del navegador para errores
- Comprueba que CORS está correctamente configurado

## 📝 Notas Importantes

- Las elecciones se ocultan hasta que ambos jugadores estén listos
- Los espectadores ven "?" en lugar de las elecciones reales
- El servidor usa PKCE para máxima seguridad en OAuth
- Las salas se eliminan automáticamente cuando están vacías
- Best of 3 significa: primero en ganar 2 rondas gana el partida

## � Licencia

ISC

**Can't connect to server:**
- Make sure server is running
- Check `http://localhost:3000` in browser
- Verify firewall settings

**Real-time updates not working:**
- Check browser console for errors
- Ensure Socket.IO is loaded (check Network tab)

## License

Free to use and modify!

## Author

Created with ❤️ for multiplayer gaming

---

**Enjoy the game! 🎮🪨📄✂️**
