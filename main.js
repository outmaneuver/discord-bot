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
  ],
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
  origin: process.env.CLIENT_URL || 'https://buxdao-verify-d1faffc83da7.herokuapp.com',
  credentials: true,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie']
}));

// Session middleware setup
app.use(session({
  store: redisStore,
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'none',
    domain: 'buxdao-verify-d1faffc83da7.herokuapp.com'
  }
}));

app.use(express.json());
app.use(passport.initialize());
app.use(passport.session());

// Passport setup
passport.use(new DiscordStrategy({
  clientID: process.env.DISCORD_CLIENT_ID,
  clientSecret: process.env.DISCORD_CLIENT_SECRET,
  callbackURL: process.env.DISCORD_CALLBACK_URL,
  scope: ['identify']
}, (accessToken, refreshToken, profile, done) => {
  // Store the profile in the session
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
    const { walletAddress } = req.body;
    if (!walletAddress) {
      return res.status(400).json({ success: false, error: 'No wallet address provided' });
    }

    const result = await verifyHolder(walletAddress, req.user.id, client);
    res.json(result);
  } catch (error) {
    console.error('Error during wallet verification:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
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

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
  initializeSalesListings(client);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  await handleMainCommands(message, client);
  await handleVerifyCommands(message, client);
  await handleProfileCommands(message, client);
  await handleSalesListingsCommands(message, client);
});

client.on('interactionCreate', async interaction => {
  // Handle button interactions
  if (interaction.isButton()) {
    if (interaction.customId === 'verify_wallet') {
      try {
        await interaction.reply({
          content: 'Please visit this link to verify your wallet: https://buxdao-verify-d1faffc83da7.herokuapp.com/holder-verify/',
          ephemeral: true
        });
      } catch (error) {
        console.error('Error handling verify_wallet button:', error);
      }
    }
    return;
  }

  if (!interaction.isCommand()) {
    console.log('Interaction is not a command');
    return;
  }

  const { commandName } = interaction;
  console.log('Command name:', commandName);

  try {
    if (commandName === 'help') {
      await handleMainInteraction(interaction);
    } else if (commandName === 'profile') {
      await handleProfileInteraction(interaction);
    } else if (commandName === 'update') {
      await handleMainInteraction(interaction);
    } else if (commandName === 'verify') {
      await handleVerifyInteraction(interaction);
    } else {
      console.log('Unknown command:', commandName);
    }
  } catch (error) {
    console.error('Error handling interaction:', error);
    await interaction.reply({ content: 'An error occurred while processing the command.', ephemeral: true });
  }
});

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
