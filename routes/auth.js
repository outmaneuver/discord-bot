import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import { config } from '../config/config.js';

const router = express.Router();

// Enable CORS for auth routes
router.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? 'https://buxdao-verify-d1faffc83da7.herokuapp.com'
    : 'http://localhost:3000',
  credentials: true
}));

const DISCORD_API_URL = 'https://discord.com/api/v10';

// Add error handling middleware
router.use((err, req, res, next) => {
  console.error('Auth route error:', err);
  res.status(500).json({
    error: 'Authentication error',
    message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
  });
});

router.get('/discord', (req, res) => {
  try {
    // Force https for production
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : req.protocol;
    const redirectUri = `${protocol}://${req.get('host')}/auth/callback`;
    
    // Fix scope format - use space-separated string instead of space in URL
    const params = new URLSearchParams({
      client_id: config.discord.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'identify guilds'.split(' ').join('%20')
    });

    const url = `https://discord.com/api/oauth2/authorize?${params}`;
    console.log('Redirecting to Discord OAuth:', url);
    res.redirect(url);
  } catch (error) {
    console.error('Discord auth redirect error:', error);
    res.redirect('/holder-verify?error=redirect');
  }
});

router.get('/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) {
    console.log('No code provided in callback');
    return res.redirect('/holder-verify?error=nocode');
  }

  try {
    console.log('Processing OAuth callback with code');
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : req.protocol;
    const redirectUri = `${protocol}://${req.get('host')}/auth/callback`;

    const tokenResponse = await fetch(`${DISCORD_API_URL}/oauth2/token`, {
      method: 'POST',
      body: new URLSearchParams({
        client_id: config.discord.clientId,
        client_secret: config.discord.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token response error:', errorText);
      throw new Error(`Failed to get access token: ${errorText}`);
    }

    const tokenData = await tokenResponse.json();
    console.log('Received token data');

    const userResponse = await fetch(`${DISCORD_API_URL}/users/@me`, {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    if (!userResponse.ok) {
      const errorText = await userResponse.text();
      console.error('User response error:', errorText);
      throw new Error(`Failed to get user data: ${errorText}`);
    }

    const userData = await userResponse.json();
    console.log('Received user data:', { id: userData.id, username: userData.username });

    // Store user data in session
    req.session.user = {
      id: userData.id,
      username: userData.username,
      accessToken: tokenData.access_token
    };

    // Save session explicitly
    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
        return res.redirect('/holder-verify?error=session');
      }
      res.redirect('/holder-verify');
    });

  } catch (error) {
    console.error('Auth callback error:', error);
    res.redirect('/holder-verify?error=auth');
  }
});

router.get('/status', (req, res) => {
  console.log('Auth status check:', {
    hasSession: !!req.session,
    hasUser: !!req.session?.user,
    username: req.session?.user?.username
  });

  res.json({
    authenticated: !!req.session?.user,
    username: req.session?.user?.username || null
  });
});

export default router; 