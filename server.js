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

app.use(express.static(path.join(__dirname, 'dist')));
app.get('/health', (req, res) => res.json({ ok: true }));

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

const oauthStates = Object.create(null);

function getSafeUsername(raw, socketId) {
    const name = (raw || '').toString().trim();
    if (name) return name;
    const suffix = socketId ? socketId.slice(-4) : Math.random().toString(36).slice(2, 6);
    return `Guest-${suffix}`;
}

app.get('/auth/kick', (req, res) => {
    if (!OAUTH_CONFIG.client_id) return res.status(503).send('Kick no está configurado en este servidor.');
    
    const code_verifier = base64URLEncode(crypto.randomBytes(64));
    const code_challenge = base64URLEncode(crypto.createHash('sha256').update(code_verifier).digest());
    const state = crypto.randomBytes(24).toString('hex');
    for (const [key, value] of Object.entries(oauthStates)) if (Date.now() - value.createdAt > 600000) delete oauthStates[key];

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
    if (!record || Date.now() - record.createdAt > 600000) {
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

require('./chess-server')(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Chess server running on port ${PORT}`));
