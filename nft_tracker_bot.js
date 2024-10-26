import { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import passport from 'passport';
import { Strategy as DiscordStrategy } from 'passport-discord';
import session from 'express-session';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import { initializeSalesListings, testSale, testListing, testAllListings } from './sales_listings.js';
import { verifyHolder, sendVerificationMessage } from './verify.js';
import { sendProfileMessage, getWalletData, getPokerStats, getSpadesStats, generateProfileHtml } from './profile.js';

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// Express app initialization
const app = express();

// Express middleware and session setup
app.use(cors({
  origin: ['https://yourdomain.com', 'https://anotherdomain.com']
}));
app.use(express.json());
app.set('trust proxy', 1); // trust first proxy

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: true,
    saveUninitialized: true,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: 'lax'
    }
}));
app.use(passport.initialize());
app.use(passport.session());

// Add this before your route definitions
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://unpkg.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      connectSrc: ["'self'", "https://api.mainnet-beta.solana.com"],
    },
  },
}));

// Set up Passport
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

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    initializeSalesListings(client);
    // ... (other initialization code)
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return; // Ignore messages from bots

    if (message.content === '!createbuttons' && message.member.permissions.has('ADMINISTRATOR')) {
        try {
            await sendVerificationAndProfileButtons(message.channel);
            await message.reply('Verification and profile buttons have been created.');
        } catch (error) {
            console.error('Error creating buttons:', error);
            await message.reply('An error occurred while creating the buttons.');
        }
    } else if (message.content === '!sendverification' && message.member.permissions.has('ADMINISTRATOR')) {
        try {
            await sendVerificationMessage(message.channel);
            await message.reply('Verification message sent successfully.');
        } catch (error) {
            console.error('Error sending verification message:', error);
            await message.reply('An error occurred while sending the verification message.');
        }
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    if (interaction.customId === 'view_profile') {
        try {
            await interaction.deferReply({ ephemeral: true });

            const userId = interaction.user.id;
            if (!PROFILE_URL) {
                console.error('PROFILE_URL is not set in environment variables');
                await interaction.editReply('Sorry, there was an error generating your profile link. Please contact an administrator.');
                return;
            }

            const profileUrl = `${PROFILE_URL}?userId=${userId}`;
            console.log('Generated profile URL:', profileUrl);
            
            await interaction.editReply(`Click here to view your profile: ${profileUrl}`);
        } catch (error) {
            console.error('Error handling profile interaction:', error);
            await interaction.editReply({ content: 'An error occurred while processing your request.' });
        }
    }

    // ... (handle other button interactions)
});

// Serve static files
app.use('/holder-verify', express.static('public'));

// Discord auth route
app.get('/auth/discord', passport.authenticate('discord'));

// Discord auth callback route
app.get('/auth/discord/callback', 
    passport.authenticate('discord', { failureRedirect: '/holder-verify' }),
    function(req, res) {
        console.log('Discord auth callback. User:', JSON.stringify(req.user));
        console.log('Session before login:', JSON.stringify(req.session));
        
        req.login(req.user, function(err) {
            if (err) {
                console.error('Error logging in user:', err);
                return res.redirect('/holder-verify?auth=failed');
            }
            console.log('User logged in successfully');
            console.log('Session after login:', JSON.stringify(req.session));
            res.redirect('/holder-verify');
        });
    }
);

// Update the verification endpoint
app.post('/holder-verify/verify', async (req, res) => {
  try {
    const { walletAddress } = req.body;
    
    if (!walletAddress) {
      return res.status(400).json({ success: false, error: 'Wallet address is required' });
    }

    console.log(`Verifying wallet: ${walletAddress}`);

    const nftCounts = await checkNFTOwnership(walletAddress);
    const buxBalance = await getBUXBalance(walletAddress);
    const rolesUpdated = await updateDiscordRoles(req.user.id, nftCounts, buxBalance, walletAddress);
    
    console.log('Verification results:');
    console.log('NFT Counts:', JSON.stringify(nftCounts, null, 2));
    console.log('BUX Balance:', buxBalance);
    console.log('Roles Updated:', rolesUpdated);

    // Calculate potential daily staking yield
    const dailyYield = calculateDailyYield(nftCounts);

    // Format the response
    const formattedBuxBalance = buxBalance / 1e9;
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
      formattedResponse: response
    });
  } catch (error) {
    console.error('Error during wallet verification:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Add this function to calculate the daily yield
function calculateDailyYield(nftCounts) {
  const dailyYield = (nftCounts['fcked_catz']?.length || 0) * 2 +
                     (nftCounts['money_monsters']?.length || 0) * 2 +
                     (nftCounts['ai_bitbots']?.length || 0) * 1 +
                     (nftCounts['money_monsters3d']?.length || 0) * 4 +
                     (nftCounts['celebcatz']?.length || 0) * 8;
  return dailyYield;
}

// Add this new route to provide authentication status and username
app.get('/auth/status', (req, res) => {
    console.log('Auth status requested. Full session:', JSON.stringify(req.session));
    console.log('Auth status requested. Session ID:', req.sessionID);
    console.log('Auth status requested. User:', JSON.stringify(req.user));
    console.log('Is authenticated:', req.isAuthenticated());
    
    res.json({ 
        authenticated: req.isAuthenticated(),
        username: req.user ? req.user.username : null,
        id: req.user ? req.user.id : null
    });
});

const PORT = process.env.PORT || 5500;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

client.login(process.env.DISCORD_TOKEN);

// Add a route to store wallet addresses
app.post('/store-wallet', (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ success: false, error: 'Not authenticated' });
  }

  const { walletAddress } = req.body;
  const userId = req.user.id;

  // Store the wallet address (implement this function)
  storeWalletAddress(userId, walletAddress);

  res.json({ success: true });
});

// Implement this function to store wallet addresses
function storeWalletAddress(userId, walletAddress) {
  // Store the wallet address in your database or data structure
  // This is just a placeholder implementation
  if (!global.userWallets) {
    global.userWallets = new Map();
  }
  if (!global.userWallets.has(userId)) {
    global.userWallets.set(userId, new Set());
  }
  global.userWallets.get(userId).add(walletAddress);
}

async function sendVerificationAndProfileButtons(channel) {
    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('BUX DAO Verification and Profile')
        .setDescription('Click the buttons below to verify your wallet or view your profile.')
        .setTimestamp();

    const verifyButton = new ButtonBuilder()
        .setCustomId('verify_wallet')
        .setLabel('Verify Wallet')
        .setStyle(ButtonStyle.Primary);

    const profileButton = new ButtonBuilder()
        .setCustomId('view_profile')
        .setLabel('View Profile')
        .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder()
        .addComponents(verifyButton, profileButton);

    await channel.send({ embeds: [embed], components: [row] });
}


if (!process.env.PROFILE_CHANNEL_ID) {
  console.error('PROFILE_CHANNEL_ID is not set in environment variables');
} else {
  console.log('PROFILE_CHANNEL_ID:', process.env.PROFILE_CHANNEL_ID);
}

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});
