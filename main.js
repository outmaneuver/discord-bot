import { Client, GatewayIntentBits, REST, PermissionsBitField } from 'discord.js';
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
import { WebSocket, WebSocketServer } from 'ws';

import { initializeSalesListings } from './services/sales.js';  // Changed from './sales_listings.js'
import { verifyHolder, sendVerificationMessage, updateDiscordRoles } from './services/verify.js';
import { updateUserProfile } from './services/profile.js';

import { handleMainCommands, handleButtonInteraction, handleMainInteraction } from './commands/main.js';
import { handleVerifyCommands, handleVerifyInteraction } from './commands/verify.js';
import { handleProfileCommands, handleProfileInteraction } from './commands/profile.js';
import { handleSalesListingsCommands } from './commands/sales.js';

// Add this near the top of the file, after the imports
global.userWallets = new Map();

console.log('Starting application...');

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Fix the client initialization with proper intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
    // Remove undefined intents and use proper ones
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.DirectMessageReactions
  ],
  partials: ['MESSAGE', 'CHANNEL', 'REACTION'],
});

// Update the message event handler
client.on('messageCreate', async (message) => {
  // Ignore messages from bots
  if (message.author.bot) return;

  try {
    // Handle different command types based on prefix
    if (message.content.startsWith('=profile')) {
      await handleProfileCommands(message, client);
    } else if (message.content.startsWith('=verify')) {
      await handleVerifyCommands(message, client);
    } else if (message.content.startsWith('=test')) {
      await handleSalesListingsCommands(message);
    } else if (message.content.startsWith('=')) {
      await handleMainCommands(message, client);
    }
  } catch (error) {
    console.error('Error handling message:', error);
    await message.reply('An error occurred while processing your command. Please try again later.');
  }
});

// Update the interaction event handler
client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isButton()) {
      if (interaction.customId === 'verify_wallet') {
        await handleVerifyInteraction(interaction);
      } else if (interaction.customId === 'claim_bux') {
        await handleProfileInteraction(interaction);
      } else {
        await handleButtonInteraction(interaction);
      }
    } else if (interaction.isCommand()) {
      const commandName = interaction.commandName;
      if (commandName === 'profile') {
        await handleProfileInteraction(interaction);
      } else if (commandName === 'verify') {
        await handleVerifyInteraction(interaction);
      } else {
        await handleMainInteraction(interaction);
      }
    }
  } catch (error) {
    console.error('Error handling interaction:', error);
    const reply = {
      content: 'An error occurred while processing your interaction. Please try again later.',
      ephemeral: true
    };
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(reply);
    } else {
      await interaction.reply(reply);
    }
  }
});

// Add this after client creation
client.on('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  
  const guild = client.guilds.cache.get(process.env.GUILD_ID);
  if (!guild) {
    console.error(`Could not find guild with ID: ${process.env.GUILD_ID}`);
    process.exit(1);
  }

  console.log(`Connected to guild: ${guild.name}`);
  
  const botMember = guild.members.cache.get(client.user.id);
  if (!botMember) {
    console.error('Bot member not found in guild');
    process.exit(1);
  }

  const permissions = botMember.permissions.toArray();
  console.log('Bot permissions:', permissions);
  
  const requiredPermissions = [
    PermissionsBitField.Flags.ManageRoles,
    PermissionsBitField.Flags.ViewChannel,
    PermissionsBitField.Flags.SendMessages
  ];
  
  const missingPermissions = requiredPermissions.filter(perm => !botMember.permissions.has(perm));
  if (missingPermissions.length > 0) {
    console.error('Missing required permissions:', missingPermissions);
    console.error('Please add these permissions to the bot role in Discord');
    process.exit(1);
  }

  console.log('Bot has all required permissions');
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
import { validateWalletAddress } from './verify.js';

app.post('/holder-verify/verify', validateWalletAddress, async (req, res) => {
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
      requestBody: req.body
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

// Add near other route handlers
app.get('/backgammon', (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect('/auth/discord');
    }
    res.sendFile(path.join(__dirname, 'public', 'backgammon.html'));
});

app.get('/api/users/:id', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
        const user = await client.users.fetch(req.params.id);
        res.json({
            username: user.username,
            avatar: user.displayAvatarURL({ dynamic: true })
        });
    } catch (error) {
        res.status(404).json({ error: 'User not found' });
    }
});

app.get('/api/games/:id', (req, res) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    // Get game data from activeGames map in backgammon_commands.js
    const game = Array.from(activeGames.values())
        .find(g => g.messageId === req.params.id);

    if (!game) {
        return res.status(404).json({ error: 'Game not found' });
    }

    res.json({
        wager: game.wager,
        challenger: game.challenger,
        timestamp: game.timestamp
    });
});

// Add after Express server setup
const wss = new WebSocketServer({ server });

// Store active game connections
const gameConnections = new Map();

wss.on('connection', (ws, req) => {
    const gameId = new URLSearchParams(req.url.slice(1)).get('game');
    if (!gameId) {
        ws.close();
        return;
    }

    // Store connection
    if (!gameConnections.has(gameId)) {
        gameConnections.set(gameId, new Set());
    }
    gameConnections.get(gameId).add(ws);

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            
            // Handle different message types
            switch (data.type) {
                case 'move':
                    // Broadcast move to other player
                    broadcastToGame(gameId, ws, data);
                    break;
                case 'roll':
                    // Broadcast dice roll
                    broadcastToGame(gameId, ws, data);
                    break;
                case 'resign':
                    // Handle game end
                    const game = activeGames.get(data.challengerId);
                    if (game) {
                        await handleGameEnd(data.winnerId, data.loserId, game.wager);
                        broadcastToGame(gameId, ws, {
                            type: 'game_end',
                            winner: data.winnerId,
                            wager: game.wager
                        });
                    }
                    break;
            }
        } catch (error) {
            console.error('Error handling WebSocket message:', error);
        }
    });

    ws.on('close', () => {
        // Remove connection when client disconnects
        const connections = gameConnections.get(gameId);
        if (connections) {
            connections.delete(ws);
            if (connections.size === 0) {
                gameConnections.delete(gameId);
            }
        }
    });
});

function broadcastToGame(gameId, sender, data) {
    const connections = gameConnections.get(gameId);
    if (connections) {
        connections.forEach(client => {
            if (client !== sender && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(data));
            }
        });
    }
}
