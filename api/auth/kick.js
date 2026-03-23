const crypto = require('crypto');

const OAUTH_CONFIG = {
    client_id: process.env.KICK_CLIENT_ID || process.env.CLIENT_ID || '',
    client_secret: process.env.KICK_CLIENT_SECRET || process.env.CLIENT_SECRET || '',
    redirect_uri: process.env.KICK_REDIRECT_URI || process.env.REDIRECT_URI || '',
    scope: process.env.KICK_SCOPE || 'user:read channel:read channel:write chat:write streamkey:read events:subscribe moderation:ban kicks:read',
    auth_url: process.env.KICK_AUTH_URL || 'https://id.kick.com/oauth/authorize',
};

function base64URLEncode(buffer) {
    return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

module.exports = (req, res) => {
    console.log('🔒 [OAuth] User initiated /auth/kick endpoint');
    
    const code_verifier = base64URLEncode(crypto.randomBytes(64));
    const code_challenge = base64URLEncode(crypto.createHash('sha256').update(code_verifier).digest());
    const state = Math.random().toString(36).substr(2, 12);

    // Store code_verifier for callback (in production, use Redis or similar)
    // For now, we'll encode it in the state or store in a simple way
    
    const redirectUri = process.env.KICK_REDIRECT_URI || `https://${req.headers.host}/api/auth/callback`;
    const params = new URLSearchParams({
        response_type: 'code',
        client_id: OAUTH_CONFIG.client_id,
        redirect_uri: redirectUri,
        scope: OAUTH_CONFIG.scope,
        state: state + '|' + code_verifier, // Store verifier in state for simplicity
        code_challenge: code_challenge,
        code_challenge_method: 'S256'
    });

    res.redirect(`${OAUTH_CONFIG.auth_url}?${params.toString()}`);
};
