const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const OAUTH_CONFIG = {
    client_id: process.env.KICK_CLIENT_ID || process.env.CLIENT_ID || '',
    client_secret: process.env.KICK_CLIENT_SECRET || process.env.CLIENT_SECRET || '',
    redirect_uri: process.env.KICK_REDIRECT_URI || process.env.REDIRECT_URI || '',
    token_url: process.env.KICK_TOKEN_URL || 'https://id.kick.com/oauth/token',
    userinfo_url: process.env.KICK_USERINFO_URL || 'https://api.kick.com/public/v1/users'
};

module.exports = async (req, res) => {
    const { code, state } = req.query;
    
    console.log('🔒 [OAuth Callback] Received callback from Kick');
    
    if (!code) {
        return res.status(400).send('Missing code');
    }

    if (!state) {
        return res.status(400).send('Missing state');
    }

    // Extract code_verifier from state
    const [stateValue, code_verifier] = state.split('|');
    
    if (!code_verifier) {
        return res.status(400).send('Invalid state - missing code verifier');
    }

    const redirectUri = process.env.KICK_REDIRECT_URI || `https://ajedrez-weld.vercel.app/api/auth/callback`;

    try {
        const params = new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: OAUTH_CONFIG.client_id,
            client_secret: OAUTH_CONFIG.client_secret,
            code,
            redirect_uri: redirectUri,
            code_verifier
        });

        const tokenResponse = await fetch(OAUTH_CONFIG.token_url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params.toString()
        });

        const tokenData = await tokenResponse.json();
        
        if (!tokenData.access_token) {
            console.error('❌ No access token received:', tokenData);
            return res.status(400).send('Failed to obtain access token');
        }

        // Get user info
        const userResponse = await fetch(`${OAUTH_CONFIG.userinfo_url}?token=${tokenData.access_token}`);
        const userData = await userResponse.json();

        console.log('✅ User authenticated:', userData);

        // Redirect back to the frontend with token
        const frontendUrl = process.env.APP_ORIGIN || process.env.FRONTEND_URL || 'https://ajedrez-weld.vercel.app';
        const redirectUrl = `${frontendUrl}?authenticated=true&username=${encodeURIComponent(userData.username || 'User')}&user_id=${userData.id}`;
        
        res.redirect(redirectUrl);

    } catch (error) {
        console.error('❌ OAuth Error:', error);
        res.status(500).send('Authentication failed');
    }
};
