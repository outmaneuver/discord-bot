import { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import express from 'express';
import cors from 'cors';
import passport from 'passport';
import { Strategy as DiscordStrategy } from 'passport-discord';
import session from 'express-session';
import helmet from 'helmet';
import crypto from 'crypto';
import fckedCatzHashlist from './hashlists/fcked_catz.json' assert { type: 'json' };
import celebCatzHashlist from './hashlists/celebcatz.json' assert { type: 'json' };
import moneyMonstersHashlist from './hashlists/money_monsters.json' assert { type: 'json' };
import moneyMonsters3DHashlist from './hashlists/money_monsters3d.json' assert { type: 'json' };
import aiBitBotsHashlist from './hashlists/ai_bitbots.json' assert { type: 'json' };

dotenv.config();

// Express app initialization
const app = express();

// Express middleware and session setup
app.use(cors());
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

// Add this near the top of the file, after the imports and before the client initialization
const lastKnownState = {};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const SALES_CHANNEL_ID = process.env.SALES_CHANNEL_ID;
const LISTINGS_CHANNEL_ID = process.env.LISTINGS_CHANNEL_ID;
const COLLECTIONS = process.env.COLLECTIONS.split(',');
const VERIFICATION_CHANNEL_ID = process.env.VERIFICATION_CHANNEL_ID;
const SIGN_IN_URL = process.env.SIGN_IN_URL;

const collectionNameMap = {
  'fcked_catz': 'Fcked Cat',
  'celebcatz': 'Celeb Cat',
  'money_monsters': 'Money Monster',
  'moneymonsters3d': 'Money Monster 3D',
  'ai_bitbots': 'A.I. BitBot'
};

const connection = new Connection(process.env.SOLANA_RPC_URL);

// Define role criteria
const COLLECTION_ROLES = {
  'fcked_catz': { 
    roleId: process.env.ROLE_ID_FCKED_CATZ, 
    whaleThreshold: parseInt(process.env.WHALE_THRESHOLD_FCKED_CATZ), 
    whaleRoleId: process.env.WHALE_ROLE_ID_FCKED_CATZ 
  },
  'celebcatz': { 
    roleId: process.env.ROLE_ID_CELEBCATZ 
  },
  'money_monsters': { 
    roleId: process.env.ROLE_ID_MONEY_MONSTERS, 
    whaleThreshold: parseInt(process.env.WHALE_THRESHOLD_MONEY_MONSTERS), 
    whaleRoleId: process.env.WHALE_ROLE_ID_MONEY_MONSTERS 
  },
  'moneymonsters3d': { 
    roleId: process.env.ROLE_ID_MONEYMONSTERS3D, 
    whaleThreshold: parseInt(process.env.WHALE_THRESHOLD_MONEYMONSTERS3D), 
    whaleRoleId: process.env.WHALE_ROLE_ID_MONEYMONSTERS3D 
  },
  'ai_bitbots': { 
    roleId: process.env.ROLE_ID_AI_BITBOTS, 
    whaleThreshold: parseInt(process.env.WHALE_THRESHOLD_AI_BITBOTS), 
    whaleRoleId: process.env.WHALE_ROLE_ID_AI_BITBOTS 
  }
};

const BUX_TOKEN_MINT = 'FMiRxSbLqRTWiBszt1DZmXd7SrscWCccY7fcXNtwWxHK';
const BUX_ROLES = [
  { threshold: 2500, roleId: process.env.ROLE_ID_2500_BUX },
  { threshold: 10000, roleId: process.env.ROLE_ID_10000_BUX },
  { threshold: 25000, roleId: process.env.ROLE_ID_25000_BUX },
  { threshold: 50000, roleId: process.env.ROLE_ID_50000_BUX }
];

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

async function getNFTsForOwner(ownerAddress) {
  const nfts = await connection.getParsedTokenAccountsByOwner(
    new PublicKey(ownerAddress),
    {
      programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
    }
  );

  return nfts.value.filter(({ account }) => {
    const amount = account.data.parsed.info.tokenAmount;
    return amount.uiAmount === 1 && amount.decimals === 0;
  });
}

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  
  // Initialize lastKnownState for each collection
  COLLECTIONS.forEach(collection => {
    lastKnownState[collection] = { lastListingTime: 0, lastSaleTime: 0 };
  });
  
  setInterval(checkCollections, 1 * 60 * 1000); // Check every 1 minute
  
  // Create verification message with button
  const channel = await client.channels.fetch(VERIFICATION_CHANNEL_ID);
  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('verify')
        .setLabel('Verify Wallet')
        .setStyle(ButtonStyle.Primary),
    );

  await channel.send({
    content: 'Click the button below to verify your wallet and get your roles!',
    components: [row]
  });
});

async function checkCollections() {
  for (const collection of COLLECTIONS) {
    try {
      // Check for new listings
      const listingsResponse = await fetch(`https://api-mainnet.magiceden.dev/v2/collections/${collection}/listings?offset=0&limit=20`);
      if (!listingsResponse.ok) {
        throw new Error(`HTTP error! status: ${listingsResponse.status}`);
      }
      const listingsData = await listingsResponse.json();

      if (!lastKnownState[collection]) {
        lastKnownState[collection] = { lastListingTime: 0, lastSaleTime: 0 };
      }

      for (const listing of listingsData) {
        if (listing.createdAt > lastKnownState[collection].lastListingTime) {
          const listingsChannel = await client.channels.fetch(LISTINGS_CHANNEL_ID);
          
          const displayName = collectionNameMap[collection] || collection;

          // Fetch token details to get the correct image URL
          let imageUrl = 'https://placeholder.com/350x350';
          let nftNumber = listing.tokenMint;
          try {
            const tokenResponse = await fetch(`https://api-mainnet.magiceden.dev/v2/tokens/${listing.tokenMint}`);
            if (tokenResponse.ok) {
              const tokenData = await tokenResponse.json();
              imageUrl = tokenData.image || imageUrl;
              nftNumber = tokenData.name.split('#')[1] || tokenData.name;
            }
          } catch (error) {
            console.error(`Error fetching token data for ${listing.tokenMint}:`, error);
          }

          const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('NEW LISTING')
            .addFields(
              { name: displayName, value: `#${nftNumber}` },
              { name: 'Seller', value: listing.seller || 'Unknown' },
              { name: 'Price', value: `${listing.price} SOL` }
            )
            .setImage(imageUrl)
            .setTimestamp();

          await listingsChannel.send({ embeds: [embed] });
          lastKnownState[collection].lastListingTime = listing.createdAt;
        }
      }

      // Check for new sales
      const salesResponse = await fetch(`https://api-mainnet.magiceden.dev/v2/collections/${collection}/activities?offset=0&limit=10`);
      if (!salesResponse.ok) {
        throw new Error(`HTTP error! status: ${salesResponse.status}`);
      }
      const salesData = await salesResponse.json();

      for (const sale of salesData) {
        if (sale.type === 'buyNow' && sale.blockTime > lastKnownState[collection].lastSaleTime) {
          const salesChannel = await client.channels.fetch(SALES_CHANNEL_ID);
          
          // Extract the NFT number
          let nftNumber = 'Unknown';
          if (sale.tokenMint) {
            const tokenResponse = await fetch(`https://api-mainnet.magiceden.dev/v2/tokens/${sale.tokenMint}`);
            if (tokenResponse.ok) {
              const tokenData = await tokenResponse.json();
              nftNumber = tokenData.name.split('#')[1] || tokenData.name;
            }
          }

          const displayName = collectionNameMap[collection] || collection;

          const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('NEW SALE')
            .addFields(
              { name: displayName, value: `#${nftNumber}` },
              { name: 'Seller', value: sale.seller || 'Unknown' },
              { name: 'Buyer', value: sale.buyer || 'Unknown' },
              { name: 'Price', value: `${sale.price} SOL` }
            )
            .setImage(sale.image || 'https://placeholder.com/350x350')
            .setTimestamp();

          await salesChannel.send({ embeds: [embed] });
          lastKnownState[collection].lastSaleTime = sale.blockTime;
        }
      }
    } catch (error) {
      console.error(`Error fetching data for ${collection}:`, error);
    }
  }
}

async function testSale(collection) {
  const salesChannel = await client.channels.fetch(SALES_CHANNEL_ID);
  
  const displayName = collectionNameMap[collection] || collection;

  const embed = new EmbedBuilder()
    .setColor('#0099ff')
    .setTitle('NEW SALE')
    .addFields(
      { name: displayName, value: '#1234' },
      { name: 'Seller', value: 'TestSeller123' },
      { name: 'Buyer', value: 'TestBuyer456' },
      { name: 'Price', value: '1.23 SOL' }
    )
    .setImage('https://placeholder.com/350x350')
    .setTimestamp();

  await salesChannel.send({ embeds: [embed] });
}

async function testListing(collection) {
  const listingsChannel = await client.channels.fetch(LISTINGS_CHANNEL_ID);
  
  const displayName = collectionNameMap[collection] || collection;

  // Simulate fetching an image URL (replace with an actual NFT image URL for better testing)
  const imageUrl = 'https://picsum.photos/350/350'; // This provides a random image for testing

  const embed = new EmbedBuilder()
    .setColor('#00FF00')
    .setTitle('NEW LISTING')
    .addFields(
      { name: displayName, value: '#5678' },
      { name: 'Seller', value: 'TestSeller789' },
      { name: 'Price', value: '2.34 SOL' }
    )
    .setImage(imageUrl)
    .setTimestamp();

  await listingsChannel.send({ embeds: [embed] });
}

async function testAllListings() {
  for (const collection of COLLECTIONS) {
    await testListing(collection);
  }
}

async function verifyHolder(message, walletAddress) {
  try {
    const publicKey = new PublicKey(walletAddress);
    const nfts = await getNFTsForOwner(publicKey.toString());

    const heldCollections = new Set();
    let buxBalance = 0;

    for (const nft of nfts) {
      const mint = nft.account.data.parsed.info.mint.trim();
      console.log(`Checking NFT with mint: ${mint}`);

      if (moneyMonsters3DHashlist.includes(mint)) {
        console.log(`Found Money Monsters 3D NFT: ${mint}`);
        heldCollections.add('money_monsters3d');
      }
      // Add similar checks for other collections
    }

    // Example logic to check $BUX balance
    // Replace with actual logic to fetch $BUX balance
    buxBalance = await getBuxBalance(walletAddress);
    console.log(`$BUX Balance: ${buxBalance}`);

    // Convert balance to correct unit if necessary
    const formattedBuxBalance = buxBalance / 1e9; // Assuming balance is in smallest unit

    let response = `Hi ${message.author.username}!\n\nVERIFIED ASSETS:\n`;
    response += `Fcked Catz - ${heldCollections.has('fcked_catz') ? 1 : 0}\n`;
    response += `Celeb Catz - ${heldCollections.has('celebcatz') ? 1 : 0}\n`;
    response += `Money Monsters - ${heldCollections.has('money_monsters') ? 1 : 0}\n`;
    response += `Money Monsters 3D - ${heldCollections.has('money_monsters3d') ? 1 : 0}\n`;
    response += `A.I. BitBots - ${heldCollections.has('ai_bitbots') ? 1 : 0}\n`;
    response += `$BUX - ${formattedBuxBalance}\n\n`;
    response += `Potential daily staking yield = 0 $BUX`;

    await message.reply(response);

    // Update Discord roles
    await updateDiscordRoles(message.author.id, heldCollections);
  } catch (error) {
    console.error('Error during verification:', error);
    await message.reply('An error occurred during verification. Please try again later.');
  }
}

client.on('messageCreate', async (message) => {
  console.log(`Received message: ${message.content}`);
  if (message.content === '!status') {
    console.log('Status command received');
    try {
      await message.reply('NFT Tracker Bot is running and tracking Magic Eden collections.');
      console.log('Status response sent');
    } catch (error) {
      console.error('Error sending status response:', error);
    }
  } else if (message.content.startsWith('!testsale')) {
    const collection = message.content.split(' ')[1] || COLLECTIONS[0];
    await testSale(collection);
    await message.reply(`Test sale message sent for collection: ${collection}`);
  } else if (message.content.startsWith('!testlisting')) {
    const collection = message.content.split(' ')[1] || COLLECTIONS[0];
    await testListing(collection);
    await message.reply(`Test listing message sent for collection: ${collection}`);
  } else if (message.content === '!testalllistings') {
    await testAllListings();
    await message.reply('Test listing messages sent for all collections.');
  } else if (message.content.startsWith('!verify')) {
    const walletAddress = message.content.split(' ')[1];
    if (!walletAddress) {
      await message.reply('Please provide a wallet address. Usage: !verify <wallet_address>');
      return;
    }
    await verifyHolder(message, walletAddress);
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;

  if (interaction.customId === 'verify') {
    try {
      if (interaction.replied || interaction.deferred) {
        console.log('Interaction already handled, skipping.');
        return;
      }

      await interaction.deferReply({ ephemeral: true });
      
      const replyContent = `Please click the link below to sign in and verify your wallet:\n${process.env.SIGN_IN_URL}`;
      await interaction.editReply({ content: replyContent });
    } catch (error) {
      console.error('Error handling interaction:', error);
      
      if (!interaction.replied && !interaction.deferred) {
        try {
          await interaction.reply({ content: 'An error occurred while processing your request.', ephemeral: true });
        } catch (replyError) {
          console.error('Error sending error reply:', replyError);
        }
      } else if (interaction.deferred) {
        try {
          await interaction.editReply({ content: 'An error occurred while processing your request.' });
        } catch (editError) {
          console.error('Error editing deferred reply:', editError);
        }
      }
    }
  }
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
    const updatedRoles = await updateDiscordRoles(req.user.id, nftCounts, buxBalance);
    
    console.log('Verification results:');
    console.log('NFT Counts:', JSON.stringify(nftCounts, null, 2));
    console.log('BUX Balance:', buxBalance);
    console.log('Updated Roles:', JSON.stringify(updatedRoles, null, 2));

    res.json({ 
      success: true, 
      roles: updatedRoles,
      nftCounts,
      buxBalance
    });
  } catch (error) {
    console.error('Error during wallet verification:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

async function checkNFTOwnership(walletAddress) {
  try {
    console.log(`Checking NFT ownership for wallet: ${walletAddress}`);
    const nfts = await getNFTsForOwner(walletAddress);
    console.log(`Total NFTs found: ${nfts.length}`);

    const collectionCounts = {};

    for (const nft of nfts) {
      const mint = nft.account.data.parsed.info.mint;
      console.log(`Checking NFT with mint: ${mint}`);
      
      for (const [collection, hashlist] of Object.entries(COLLECTION_HASHLISTS)) {
        if (hashlist.includes(mint)) {
          console.log(`Found NFT from collection: ${collection}`);
          collectionCounts[collection] = (collectionCounts[collection] || 0) + 1;
        }
      }
    }

    console.log('NFT ownership summary:');
    console.log(JSON.stringify(collectionCounts, null, 2));

    return collectionCounts;
  } catch (error) {
    console.error('Error checking NFT ownership:', error);
    return {};
  }
}

async function getBUXBalance(walletAddress) {
  try {
    console.log(`Checking BUX balance for wallet: ${walletAddress}`);
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      new PublicKey(walletAddress),
      { programId: TOKEN_PROGRAM_ID }
    );

    console.log(`Total token accounts found: ${tokenAccounts.value.length}`);

    const buxAccount = tokenAccounts.value.find(
      account => account.account.data.parsed.info.mint === BUX_TOKEN_MINT
    );

    if (buxAccount) {
      const balance = parseInt(buxAccount.account.data.parsed.info.tokenAmount.amount);
      console.log(`BUX balance found: ${balance}`);
      return balance;
    } else {
      console.log('No BUX balance found');
      return 0;
    }
  } catch (error) {
    console.error('Error getting BUX balance:', error);
    return 0;
  }
}

async function updateDiscordRoles(userId, heldCollections) {
  try {
    // Ensure the client is ready
    if (!client.isReady()) {
      console.log('Discord client is not ready. Waiting...');
      await new Promise(resolve => client.once('ready', resolve));
    }

    const guild = await client.guilds.fetch(GUILD_ID);
    if (!guild) {
      console.error('Guild not found');
      return;
    }

    const member = await guild.members.fetch(userId);
    if (!member) {
      console.error('Member not found');
      return;
    }

    for (const [collection, roleId] of Object.entries(ROLE_IDS)) {
      if (heldCollections.has(collection)) {
        await member.roles.add(roleId);
        if (WHALE_ROLE_IDS[collection] && heldCollections.size >= process.env[`WHALE_THRESHOLD_${collection.toUpperCase()}`]) {
          await member.roles.add(WHALE_ROLE_IDS[collection]);
        }
      } else {
        await member.roles.remove(roleId);
        if (WHALE_ROLE_IDS[collection]) {
          await member.roles.remove(WHALE_ROLE_IDS[collection]);
        }
      }
    }

    console.log(`Updated roles for user ${userId}`);
  } catch (error) {
    console.error('Error updating Discord roles:', error);
  }
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
// You'll need to implement this function to parse the metadata
function parseMetadataForCollectionAddress(metadata) {
  // This implementation depends on the structure of your NFT metadata
  // You may need to adjust this based on how your NFTs store collection information
  if (metadata && metadata.value && metadata.value.data && metadata.value.data.creators) {
    return metadata.value.data.creators[0].address;
  }
  return null;
}

// Add this near the top of your file, after the imports
process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
});

// Add this near the end of your file, before starting the server
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

app.get('/holder-verify', (req, res) => {
    const nonce = crypto.randomBytes(16).toString('base64');
    res.setHeader('Content-Security-Policy', `script-src 'self' 'nonce-${nonce}' https://unpkg.com;`);
    
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Wallet Verification</title>
            <script nonce="${nonce}" src="https://unpkg.com/@solana/web3.js@latest/lib/index.iife.min.js"></script>
            <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@800&display=swap" rel="stylesheet">
            <link rel="icon" type="image/x-icon" href="/holder-verify/favicon.ico">
            <style>
                /* Your existing styles */
            </style>
        </head>
        <body>
            <div class="logo-container">
                <div class="logo-text">BUX&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;DAO</div>
            </div>
            <div class="container">
                <h1 id="pageTitle">Verify Your Wallet</h1>
                <p id="welcomeMessage"></p>
                <button id="discordButton">Sign in with Discord</button>
                <button id="connectButton">Connect Wallet</button>
                <p id="status"></p>
            </div>
            <div id="closeMessage">
                You can now close this window...<br>
                Please allow a few minutes for your discord roles to be updated
            </div>

            <script nonce="${nonce}">
                const ROLE_ID_FCKED_CATZ = '${process.env.ROLE_ID_FCKED_CATZ}';
                const ROLE_ID_CELEBCATZ = '${process.env.ROLE_ID_CELEBCATZ}';
                const ROLE_ID_MONEY_MONSTERS = '${process.env.ROLE_ID_MONEY_MONSTERS}';
                const ROLE_ID_MONEYMONSTERS3D = '${process.env.ROLE_ID_MONEYMONSTERS3D}';
                const ROLE_ID_AI_BITBOTS = '${process.env.ROLE_ID_AI_BITBOTS}';
                const BUX_ROLES = ${JSON.stringify(BUX_ROLES)};

                // Your existing JavaScript code
            </script>
        </body>
        </html>
    `);
});

const COLLECTION_ADDRESSES = {
  'fcked_catz': process.env.COLLECTION_ADDRESS_FCKED_CATZ,
  'celebcatz': process.env.COLLECTION_ADDRESS_CELEBCATZ,
  'money_monsters': process.env.COLLECTION_ADDRESS_MONEY_MONSTERS,
  'money_monsters3d': process.env.COLLECTION_ADDRESS_MONEYMONSTERS3D,
  'ai_bitbots': process.env.COLLECTION_ADDRESS_AI_BITBOTS
};

const COLLECTION_HASHLISTS = {
  'fcked_catz': fckedCatzHashlist,
  'celebcatz': celebCatzHashlist,
  'money_monsters': moneyMonstersHashlist,
  'money_monsters3d': moneyMonsters3DHashlist,
  'ai_bitbots': aiBitBotsHashlist
};

const ROLE_IDS = {
  'fcked_catz': process.env.ROLE_ID_FCKED_CATZ,
  'celebcatz': process.env.ROLE_ID_CELEBCATZ,
  'money_monsters': process.env.ROLE_ID_MONEY_MONSTERS,
  'money_monsters3d': process.env.ROLE_ID_MONEY_MONSTERS3D,
  'ai_bitbots': process.env.ROLE_ID_AI_BITBOTS
};

const WHALE_ROLE_IDS = {
  'fcked_catz': process.env.WHALE_ROLE_ID_FCKED_CATZ,
  'celebcatz': process.env.WHALE_ROLE_ID_CELEBCATZ,
  'money_monsters': process.env.WHALE_ROLE_ID_MONEY_MONSTERS,
  'money_monsters3d': process.env.WHALE_ROLE_ID_MONEY_MONSTERS3D,
  'ai_bitbots': process.env.WHALE_ROLE_ID_AI_BITBOTS
};

const GUILD_ID = process.env.GUILD_ID;

