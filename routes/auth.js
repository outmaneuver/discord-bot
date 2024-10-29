import express from 'express';
import fetch from 'node-fetch';
import { config } from '../config/config.js';

const router = express.Router();

const DISCORD_API_URL = 'https://discord.com/api/v10';

router.get('/discord', (req, res) => {
  const params = new URLSearchParams({
    client_id: config.discord.clientId,
    redirect_uri: `${req.protocol}://${req.get('host')}/auth/callback`,
    response_type: 'code',
    scope: 'identify guilds'
  });

  res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

router.get('/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.redirect('/holder-verify?error=nocode');
  }

  try {
    const tokenResponse = await fetch(`${DISCORD_API_URL}/oauth2/token`, {
      method: 'POST',
      body: new URLSearchParams({
        client_id: config.discord.clientId,
        client_secret: config.discord.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: `${req.protocol}://${req.get('host')}/auth/callback`,
      }),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const tokenData = await tokenResponse.json();

    const userResponse = await fetch(`${DISCORD_API_URL}/users/@me`, {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    const userData = await userResponse.json();

    // Store user data in session
    req.session.user = {
      id: userData.id,
      username: userData.username,
      accessToken: tokenData.access_token
    };

    res.redirect('/holder-verify');
  } catch (error) {
    console.error('Auth error:', error);
    res.redirect('/holder-verify?error=auth');
  }
});

router.get('/status', (req, res) => {
  if (req.session?.user) {
    res.json({
      authenticated: true,
      username: req.session.user.username
    });
  } else {
    res.json({
      authenticated: false
    });
  }
});

export default router; 