# ENROQUE — Ajedrez en otra dimensión

Ajedrez local y multijugador con tablero 3D WebGL, construido con Three.js, chess.js, Express y Socket.IO. Interfaz en español, adaptable a móvil, sin modelos ni CDN externos.

## Ejecutar

Requiere Node.js 20 o superior.

```sh
npm ci
npm run dev
```

Abre http://localhost:3000. `npm start` también genera los recursos antes de arrancar. No abras index.html directamente: los recursos se generan en `dist/`.

## Funciones

- Tablero 3D con piezas procedurales, sombras, rotación, zoom y cambio de orientación.
- Renderizado bajo demanda, geometrías compartidas y resolución limitada a 1.7× para reducir consumo de GPU.
- Vista 2D accesible con teclado y cambio automático si WebGL falla.
- Reglas completas: jaque, mate, ahogado, enroque, captura al paso, promoción a elección, repetición y tablas por material o 50 movimientos.
- Partida local para dos personas, guardado automático en el navegador, deshacer, historial SAN y descarga PGN.
- Salas online, invitaciones por enlace, espectadores y revancha de mutuo acuerdo. El servidor valida todas las jugadas y permisos.
- Sonido opcional generado localmente.
- Entrada como invitado e integración de Kick conservada.

## Despliegue existente: Vercel + Render

**Actualiza ambos servicios con la misma revisión.** El protocolo multijugador ahora intercambia FEN y PGN; el cliente nuevo necesita el servidor nuevo.

### Vercel (interfaz)

`vercel.json` ejecuta `npm run build` y publica únicamente `dist/`. El directorio contiene la página principal y `/ajedrez.html` como acceso alternativo. No publica el código del servidor ni las credenciales.

### Render (servidor)

- Build command: `npm ci && npm run build`
- Start command: `node server.js`
- Health check: `/health`
- `PORT`: proporcionado por Render.
- `APP_ORIGIN`: URL de la interfaz de Vercel.

`config.js` usa el servidor local en localhost y el backend existente `https://ajedrez-backend-7tdh.onrender.com` en producción. Si cambia el dominio del servidor, actualiza este archivo y vuelve a construir.

### Kick

Configura `KICK_CLIENT_ID`, `KICK_CLIENT_SECRET`, `KICK_REDIRECT_URI` y `APP_ORIGIN` en Render, siguiendo `.env.example`. Registra el callback `https://TU_BACKEND/auth/kick/callback` en Kick. La interfaz utiliza las rutas OAuth del servidor; los archivos históricos en `api/auth/` no forman parte del despliegue estático.

Kick usa PKCE y estados de un solo uso con caducidad de 10 minutos. El nombre recibido se usa como nombre visible, no como autorización para acceder a datos privados. Las pruebas verifican el intercambio OAuth con un proveedor simulado, PKCE, callback, perfil, avatar, entrada al lobby y cierre de sesión local. La autorización real en Kick requiere credenciales del servicio y sigue pendiente de verificación en producción.

## Pruebas

```sh
npm test
npm run test:e2e
npm audit
```

Las pruebas de servidor levantan una instancia independiente y verifican permisos, entradas malformadas, enroque, captura al paso, mate, repetición, promoción, abandono y revancha. Las de navegador arrancan el servidor si hace falta y verifican WebGL, movimientos con raycasting, local, teclado, persistencia, móvil, promoción, fallback 2D y sincronización entre tres navegadores.

Playwright usa Edge instalado en Windows; en otros equipos ejecuta `npx playwright install chromium` una vez. Las capturas se guardan en `artifacts/` y no se suben al repositorio.

## Límites actuales

Las salas se guardan en memoria: se pierden al reiniciar el servidor y requieren una única instancia Node. Una desconexión libera el asiento y pausa la partida hasta que se vuelva a ocupar; al reconectar se puede volver a entrar desde la lista de salas. No hay cuentas persistentes, reloj competitivo ni motor de IA. El modo local se guarda aparte en el navegador.

## Referencias

- [Three.js WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html)
- [chess.js](https://github.com/jhlywa/chess.js)
