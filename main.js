import { Client, GatewayIntentBits, REST } from 'discord.js';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import passport from 'passport';
import { Strategy as DiscordStrategy } from 'passport-discord';
import session from 'express-session';
import Redis from 'ioredis';
import RedisStore from 'connect-redis';
import { fileURLToPath } from 'url';
import path from 'path';

import { initializeSalesListings } from './sales_listings.js';
import { verifyHolder, sendVerificationMessage, updateDiscordRoles } from './verify.js';
import { updateUserProfile } from './profile.js';

import { handleMainCommands, handleButtonInteraction, handleMainInteraction } from './main_commands.js';
import { handleVerifyCommands, handleVerifyInteraction } from './verify_commands.js';
import { handleProfileCommands, handleProfileInteraction } from './profile_commands.js';
import { handleSalesListingsCommands } from './sales_listings_commands.js';

// Add this near the top of the file, after the imports
global.userWallets = new Map();

console.log('Starting application...');

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
  ],
  partials: ['MESSAGE', 'CHANNEL', 'REACTION'],
});

// Add message event handler
client.on('messageCreate', async (message) => {
  // Ignore messages from bots
  if (message.author.bot) return;

  try {
    // Handle main commands
    if (message.content.startsWith('=')) {
      await handleMainCommands(message, client);
    }
  } catch (error) {
    console.error('Error handling message:', error);
    await message.reply('An error occurred while processing your command. Please try again later.');
  }
});

// Add interaction event handler
client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isButton()) {
      await handleButtonInteraction(interaction);
    } else if (interaction.isCommand()) {
      await handleMainInteraction(interaction);
    }
  } catch (error) {
    console.error('Error handling interaction:', error);
    await interaction.reply({
      content: 'An error occurred while processing your interaction. Please try again later.',
      ephemeral: true
    });
  }
});

// Add this after client creation
client.on('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  
  // Verify guild access and permissions
  const guild = client.guilds.cache.get(process.env.GUILD_ID);
  if (guild) {
    console.log(`Connected to guild: ${guild.name}`);
    
    // Check bot's permissions
    const botMember = guild.members.cache.get(client.user.id);
    if (botMember) {
      const permissions = botMember.permissions.toArray();
      console.log('Bot permissions:', permissions);
      
      const requiredPermissions = [
        'MANAGE_ROLES',
        'VIEW_CHANNEL',
        'SEND_MESSAGES'
      ];
      
      const missingPermissions = requiredPermissions.filter(perm => !permissions.includes(perm));
      if (missingPermissions.length > 0) {
        console.error('Missing required permissions:', missingPermissions);
      } else {
        console.log('Bot has all required permissions');
      }
    } else {
      console.error('Bot member not found in guild');
    }
  } else {
    console.error(`Could not find guild with ID: ${process.env.GUILD_ID}`);
  }
});

console.log('Discord client created');

const app = express();
console.log('Express app created');

// Redis setup
const redisClient = new Redis(process.env.REDIS_URL, {
  tls: {
    rejectUnauthorized: false
  }
});

const redisStore = new RedisStore({
  client: redisClient,
  prefix: "session:",
});

// CORS setup - before other middleware
app.use(cors({
  origin: 'https://buxdao-verify-d1faffc83da7.herokuapp.com',
  credentials: true,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie']
}));

// Trust proxy
app.set('trust proxy', 1);

// Session middleware setup
app.use(session({
  store: redisStore,
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  proxy: true,
  cookie: {
    secure: true,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'none',
    path: '/'
  }
}));

app.use(express.json());
app.use(passport.initialize());
app.use(passport.session());

// Passport setup
passport.use(new DiscordStrategy({
  clientID: process.env.DISCORD_CLIENT_ID,
  clientSecret: process.env.DISCORD_CLIENT_SECRET,
  callbackURL: 'https://buxdao-verify-d1faffc83da7.herokuapp.com/auth/discord/callback',
  scope: ['identify'],
  proxy: true
}, (accessToken, refreshToken, profile, done) => {
  return done(null, profile);
}));

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

// Static file serving
app.use(express.static(path.join(__dirname, 'public')));
app.use('/holder-verify', express.static(path.join(__dirname, 'public')));

// Auth routes
app.get('/auth/discord', passport.authenticate('discord'));

app.get('/auth/discord/callback', 
  passport.authenticate('discord', { 
    failureRedirect: '/holder-verify/',
    successRedirect: '/holder-verify/'
  })
);

app.get('/auth/status', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({
      authenticated: true,
      username: req.user.username,
      id: req.user.id
    });
  } else {
    res.json({
      authenticated: false
    });
  }
});

// Verify endpoint
app.post('/holder-verify/verify', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ success: false, error: 'Not authenticated' });
  }

  try {
    console.log('Received verification request:', req.body);
    
    if (!req.body || !req.body.walletAddress) {
      return res.status(400).json({ 
        success: false, 
        error: 'No wallet address provided',
        details: 'Request body must include walletAddress'
      });
    }

    const walletData = {
      walletAddress: req.body.walletAddress
    };

    console.log('Processing wallet verification for:', walletData);
    
    const result = await verifyHolder(walletData, req.user.id, client);
    res.json(result);
  } catch (error) {
    console.error('Error during wallet verification:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message,
      requestBody: req.body // Add this for debugging
    });
  }
});

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

let redis;
try {
  redis = new Redis(process.env.REDIS_URL, {
    tls: {
      rejectUnauthorized: false
    }
  });
  console.log('Connected to Redis');
} catch (error) {
  console.warn('Failed to connect to Redis. Using in-memory storage instead.');
  console.warn('Warning: Data will be lost on server restarts.');
  redis = {
    set: (key, value) => {
      if (!global.inMemoryStorage) global.inMemoryStorage = new Map();
      global.inMemoryStorage.set(key, value);
      return Promise.resolve('OK');
    },
    get: (key) => {
      if (!global.inMemoryStorage) return Promise.resolve(null);
      return Promise.resolve(global.inMemoryStorage.get(key));
    }
  };
}

app.post('/store-wallet', async (req, res) => {
  if (!req.isAuthenticated()) {
    console.log('User not authenticated when trying to store wallet');
    return res.status(401).json({ success: false, error: 'Not authenticated' });
  }

  const { walletAddress } = req.body;
  const userId = req.user.id;

  try {
    await storeWalletAddress(userId, walletAddress);
    console.log(`Stored wallet address ${walletAddress} for user ${userId}`);
    res.json({ success: true });
  } catch (error) {
    console.error('Error storing wallet address:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

async function storeWalletAddress(userId, walletAddress) {
  const key = `wallets:${userId}`;
  await redis.sadd(key, walletAddress);
}

// Catch-all route for 404 errors
app.use((req, res) => {
  res.status(404).send('404 - Not Found');
});

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`Server is starting on port ${PORT}`);
})
.on('error', (err) => {
  console.error('Error starting server:', err);
  process.exit(1);
});

// Set a timeout to exit if the server hasn't started within 55 seconds
const startTimeout = setTimeout(() => {
  console.error('Server failed to start within 55 seconds');
  process.exit(1);
}, 55000);

server.on('listening', () => {
  clearTimeout(startTimeout);
  console.log(`Server is running on port ${PORT}`);
});

const commands = [
  {
    name: 'help',
    description: 'Show help message'
  },
  {
    name: 'profile',
    description: 'View your profile or another user\'s profile',
    options: [
      {
        name: 'user',
        type: 6, // USER type
        description: 'The user whose profile to view (Admin only)',
        required: false
      }
    ]
  },
  {
    name: 'update',
    description: 'Update your profile or another user\'s profile',
    options: [
      {
        name: 'user',
        type: 6, // USER type
        description: 'The user whose profile to update (Admin only)',
        required: false
      }
    ]
  },
  {
    name: 'verify',
    description: 'Get a link to verify your wallet'
  },
  // ... (add other commands)
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

client.login(process.env.DISCORD_TOKEN)
  .then(() => console.log('Discord bot logged in'))
  .catch(err => {
    console.error('Error logging in to Discord:', err);
    process.exit(1);
  });

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

console.log('Application setup complete');

// Add structured error logging
const logError = (context, error) => {
  console.error({
    timestamp: new Date().toISOString(),
    context,
    error: error.message,
    stack: error.stack
  });
};

// Example usage in a try-catch block
try {
  // Your code here
} catch (error) {
  logError('verifyHolder', error);
  throw error;
}
