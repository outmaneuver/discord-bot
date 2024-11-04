import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import { config } from '../config/config.js';
import { verifyWallet } from '../services/verify.js';
import session from 'express-session';
import RedisStore from 'connect-redis';
import { redis } from '../config/redis.js';
import helmet from 'helmet';
import csrf from 'csurf';

const router = express.Router();

// Enable CORS for auth routes
router.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Initialize Redis store properly
const redisStore = new RedisStore({
  client: redis,
  prefix: 'session:'
});

// Update session configuration
router.use(session({
  store: redisStore,
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: true,
  saveUninitialized: true,
  name: 'buxdao.sid',
  proxy: true,
  cookie: {
    secure: true,
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    sameSite: 'none',
    path: '/',
    domain: process.env.NODE_ENV === 'production' ? '.herokuapp.com' : undefined
  }
}));

// Add trust proxy setting
router.use((req, res, next) => {
  req.app.set('trust proxy', 1);
  next();
});

// Add security headers middleware
router.use(helmet());

// Add CSRF protection
router.use(csrf({ cookie: true }));

const DISCORD_API_URL = 'https://discord.com/api/v10';

router.get('/discord', (req, res) => {
  try {
    // Generate and store state parameter for CSRF protection
    const state = Math.random().toString(36).substring(7);
    req.session.oauthState = state;

    // Simple, direct Discord OAuth URL
    const url = 'https://discord.com/oauth2/authorize' +
      `?client_id=${config.discord.clientId}` +
      '&redirect_uri=https%3A%2F%2Fbuxdao-verify-d1faffc83da7.herokuapp.com%2Fauth%2Fcallback' +
      '&response_type=code' +
      '&scope=identify%20guilds' +
      `&state=${state}`;

    console.log('Redirecting to Discord OAuth:', url);
    res.redirect(url);
  } catch (error) {
    console.error('Discord auth redirect error:', error);
    res.redirect('/holder-verify?error=redirect');
  }
});

router.get('/callback', async (req, res) => {
  try {
    const { code } = req.query;
    console.log('Processing OAuth callback with code');

    const tokenData = await getOAuthToken(code);
    const userData = await getDiscordUser(tokenData.access_token);
    console.log('Received user data:', userData);

    // Create new session if it doesn't exist
    if (!req.session) {
      req.session = {};
    }

    // Set user data in session
    req.session.user = {
      id: userData.id,
      username: userData.username,
      accessToken: tokenData.access_token
    };

    // Force session save
    await new Promise((resolve, reject) => {
      req.session.save((err) => {
        if (err) {
          console.error('Session save error:', err);
          reject(err);
        }
        resolve();
      });
    });

    // Set secure cookies
    res.cookie('discord_id', userData.id, {
      maxAge: 24 * 60 * 60 * 1000,
      httpOnly: true,
      secure: true,
      sameSite: 'lax'
    });

    res.cookie('discord_user', userData.username, {
      maxAge: 24 * 60 * 60 * 1000,
      httpOnly: true,
      secure: true,
      sameSite: 'lax'
    });

    // Log session state
    console.log('Session after save:', {
      id: req.sessionID,
      user: req.session.user,
      cookie: req.session.cookie
    });

    res.redirect('/holder-verify/');

  } catch (error) {
    console.error('Error in callback:', error);
    res.redirect('/holder-verify/?error=auth_failed');
  }
});

router.get('/status', (req, res) => {
  try {
    // Log full session data for debugging
    console.log('Full session data:', {
      sessionID: req.sessionID,
      session: req.session,
      cookies: req.cookies
    });

    // Check session first
    const authenticated = !!req.session?.user;
    const username = req.session?.user?.username;

    // If session auth fails, check cookies as backup
    const discordUser = req.cookies?.discord_user;
    const discordId = req.cookies?.discord_id;

    res.json({
      authenticated: authenticated || !!discordUser,
      username: username || discordUser || null
    });

  } catch (error) {
    console.error('Error in status check:', error);
    res.json({
      authenticated: false,
      username: null
    });
  }
});

// Add OAuth token function
async function getOAuthToken(code) {
  const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    body: new URLSearchParams({
      client_id: config.discord.clientId,
      client_secret: config.discord.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: 'https://buxdao-verify-d1faffc83da7.herokuapp.com/auth/callback',
      scope: 'identify guilds',
    }),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  if (!tokenResponse.ok) {
    throw new Error(`Failed to get token: ${await tokenResponse.text()}`);
  }

  return tokenResponse.json();
}

// Add user data function
async function getDiscordUser(accessToken) {
  const userResponse = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!userResponse.ok) {
    throw new Error(`Failed to get user data: ${await userResponse.text()}`);
  }

  return userResponse.json();
}

// Update the verify endpoint
router.post('/verify', async (req, res) => {
  try {
    // Get auth from cookies
    const discordId = req.cookies?.discord_id;
    const discordUser = req.cookies?.discord_user;
    const authStatus = req.cookies?.auth_status;

    // Recreate session if needed
    if (!req.session.user && discordId && discordUser && authStatus === 'logged_in') {
      req.session.user = {
        id: discordId,
        username: discordUser
      };
      await new Promise(resolve => req.session.save(resolve));
      
      console.log('Session recreated:', {
        id: req.sessionID,
        user: req.session.user
      });
    }

    // Check auth after session recreation
    if (!req.session?.user?.id) {
      return res.status(401).json({ 
        success: false, 
        error: 'Not authenticated',
        session: req.session,
        cookies: req.cookies 
      });
    }

    const { walletAddress } = req.body;
    if (!walletAddress) {
      return res.status(400).json({ 
        success: false, 
        error: 'Wallet address required' 
      });
    }

    console.log('Verifying wallet:', {
      userId: req.session.user.id,
      walletAddress,
    });

    // Set timeout for the request
    const timeoutId = setTimeout(() => {
      if (!res.headersSent) {
        res.status(503).json({
          success: false,
          error: 'Request timed out due to rate limits. Please try again in a few minutes.'
        });
      }
    }, 20000); // 20 second timeout

    try {
      // Verify the wallet with shorter timeout
      const result = await Promise.race([
        verifyWallet(req.session.user.id, walletAddress),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Verification timeout')), 15000)
        )
      ]);

      // Clear timeout since request completed
      clearTimeout(timeoutId);

      if (result.success) {
        // Store wallet in Redis
        await redis.sadd(`wallets:${req.session.user.id}`, walletAddress);
      }

      // Return success response
      if (!res.headersSent) {
        res.json({
          success: true,
          message: 'Wallet verified successfully',
          data: result
        });
      }

    } catch (error) {
      // Clear timeout since request errored
      clearTimeout(timeoutId);

      if (!res.headersSent) {
        if (error.message === 'Verification timeout') {
          res.status(503).json({
            success: false,
            error: 'Verification timed out. Please try again.'
          });
        } else {
          throw error;
        }
      }
    }

  } catch (error) {
    console.error('Error in verify endpoint:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: 'Failed to verify wallet',
        details: error.message
      });
    }
  }
});

export default router; 