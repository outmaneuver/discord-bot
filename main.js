import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import passport from 'passport';
import { Strategy as DiscordStrategy } from 'passport-discord';
import session from 'express-session';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';

import { initializeSalesListings } from './sales_listings.js';
import { verifyHolder, sendVerificationMessage, checkNFTOwnership, getBUXBalance, updateDiscordRoles } from './verify.js';
import { sendProfileMessage } from './profile.js';

import { handleMainCommands } from './main_commands.js';
import { handleVerifyCommands } from './verify_commands.js';
import { handleProfileCommands } from './profile_commands.js';
import { handleSalesListingsCommands } from './sales_listings_commands.js';

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

// Express middleware and session setup
app.use(cors({
  origin: ['https://yourdomain.com', 'https://anotherdomain.com']
}));
app.use(express.json());
app.set('trust proxy', 1);

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: true,
    saveUninitialized: true,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: 'lax'
    }
}));
app.use(passport.initialize());
app.use(passport.session());

console.log('Express middleware set up');

// Passport configuration
passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: process.env.DISCORD_REDIRECT_URI,
    scope: ['identify', 'guilds.join']
}, function(accessToken, refreshToken, profile, done) {
    process.nextTick(function() {
        return done(null, profile);
    });
}));

passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((obj, done) => {
    done(null, obj);
});

// Move this block before defining any routes
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      connectSrc: ["'self'", "https://api.mainnet-beta.solana.com"],
    },
  },
}));

// Define routes
app.get('/', (req, res) => {
  res.send('Hello World!');
});

// Discord auth routes
app.get('/auth/discord', passport.authenticate('discord'));

app.get('/auth/discord/callback', 
    passport.authenticate('discord', { failureRedirect: '/holder-verify' }),
    function(req, res) {
        res.redirect('/holder-verify');
    }
);

// Serve static files
app.use('/holder-verify', express.static(path.join(__dirname, 'public')));

// Serve index.html for /holder-verify route
app.get('/holder-verify', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Auth status route
app.get('/auth/status', (req, res) => {
    res.json({ 
        authenticated: req.isAuthenticated(),
        username: req.user ? req.user.username : null,
        id: req.user ? req.user.id : null
    });
});

// Verification route
app.post('/holder-verify/verify', async (req, res) => {
  try {
    const { walletAddress } = req.body;
    
    if (!walletAddress) {
      return res.status(400).json({ success: false, error: 'Wallet address is required' });
    }

    console.log(`Verifying wallet: ${walletAddress}`);

    console.log('Checking NFT ownership...');
    const nftCounts = await checkNFTOwnership(walletAddress);
    console.log('NFT ownership check complete:', JSON.stringify(nftCounts, null, 2));

    console.log('Getting BUX balance...');
    const buxBalance = await getBUXBalance(walletAddress);
    console.log('BUX balance retrieved:', buxBalance);

    console.log('Updating Discord roles...');
    const rolesUpdated = await updateDiscordRoles(client, req.user.id, nftCounts, buxBalance, walletAddress);
    console.log('Discord roles update complete');

    console.log('Verification results:');
    console.log('NFT Counts:', JSON.stringify(nftCounts, null, 2));
    console.log('BUX Balance:', buxBalance);
    console.log('Roles Updated:', rolesUpdated);

    // Calculate potential daily staking yield
    const dailyYield = calculateDailyYield(nftCounts);

    // Format the response
    const formattedBuxBalance = buxBalance;
    let response = `Hi ${req.user.username}!\n\nVERIFIED ASSETS:\n`;
    response += `Fcked Catz - ${nftCounts['fcked_catz'] ? nftCounts['fcked_catz'].length : 0}\n`;
    response += `Celeb Catz - ${nftCounts['celebcatz'] ? nftCounts['celebcatz'].length : 0}\n`;
    response += `Money Monsters - ${nftCounts['money_monsters'] ? nftCounts['money_monsters'].length : 0}\n`;
    response += `Money Monsters 3D - ${nftCounts['money_monsters3d'] ? nftCounts['money_monsters3d'].length : 0}\n`;
    response += `A.I. BitBots - ${nftCounts['ai_bitbots'] ? nftCounts['ai_bitbots'].length : 0}\n`;
    response += `$BUX - ${formattedBuxBalance}\n\n`;
    response += `Potential daily staking yield = ${dailyYield} $BUX`;

    res.json({ 
      success: true, 
      rolesUpdated,
      nftCounts,
      buxBalance,
      dailyYield,
      formattedResponse: response.trim() // Trim any whitespace
    });
  } catch (error) {
    console.error('Error during wallet verification:', error);
    res.status(500).json({ success: false, error: 'Internal server error', details: error.message });
  }
});

function calculateDailyYield(nftCounts) {
  const dailyYield = (nftCounts['fcked_catz']?.length || 0) * 2 +
                     (nftCounts['money_monsters']?.length || 0) * 2 +
                     (nftCounts['ai_bitbots']?.length || 0) * 1 +
                     (nftCounts['money_monsters3d']?.length || 0) * 4 +
                     (nftCounts['celebcatz']?.length || 0) * 8;
  return dailyYield;
}

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

app.post('/store-wallet', (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ success: false, error: 'Not authenticated' });
  }

  const { walletAddress } = req.body;
  const userId = req.user.id;

  // Store the wallet address (implement your storage logic here)
  console.log(`Storing wallet address ${walletAddress} for user ${userId}`);

  res.json({ success: true });
});

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
