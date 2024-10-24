import { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { Connection, PublicKey } from '@solana/web3.js';
import express from 'express';
import cors from 'cors';
import passport from 'passport';
import { Strategy as DiscordStrategy } from 'passport-discord';
import session from 'express-session';

dotenv.config();

// Express app initialization
const app = express();

// Comment out or remove these lines
// const redisClient = createClient({
//     url: process.env.REDIS_URL,
//     socket: {
//         tls: true,
//         rejectUnauthorized: false,
//         secureProtocol: 'TLSv1_2_method',
//         ciphers: 'HIGH:!aNULL:!MD5'
//     }
// });
// redisClient.connect().catch(console.error);
// redisClient.on('error', (err) => console.log('Redis Client Error', err));

// Express middleware and session setup
app.use(cors());
app.use(express.json());
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
const VERIFY_COLLECTION_ADDRESSES = process.env.VERIFY_COLLECTION_ADDRESSES.split(',');
const VERIFY_ROLE_IDS = process.env.VERIFY_ROLE_IDS.split(',');

const collectionNameMap = {
  'fcked_catz': 'Fcked Cat',
  'celebcatz': 'Celeb Cat',
  'money_monsters': 'Money Monster',
  'moneymonsters3d': 'Money Monster 3D',
  'ai_bitbots': 'A.I. BitBot'
};

const connection = new Connection(process.env.SOLANA_RPC_URL);

// Set up Passport
passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    callbackURL: process.env.DISCORD_REDIRECT_URI,
    scope: ['identify', 'guilds.join']
}, function(accessToken, refreshToken, profile, done) {
    // Save the user profile information in session
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

    for (const nft of nfts) {
      const mint = nft.account.data.parsed.info.mint;
      // Fetch the NFT metadata to get the collection address
      const metadata = await connection.getAccountInfo(new PublicKey(mint));
      // You'll need to implement a function to parse the metadata and extract the collection address
      const collectionAddress = parseMetadataForCollectionAddress(metadata);
      
      if (VERIFY_COLLECTION_ADDRESSES.includes(collectionAddress)) {
        heldCollections.add(collectionAddress);
      }
    }

    if (heldCollections.size > 0) {
      const member = await message.guild.members.fetch(message.author.id);
      for (let i = 0; i < VERIFY_COLLECTION_ADDRESSES.length; i++) {
        if (heldCollections.has(VERIFY_COLLECTION_ADDRESSES[i])) {
          await member.roles.add(VERIFY_ROLE_IDS[i]);
        }
      }
      await message.reply(`Verification successful! You've been granted roles for your NFT holdings.`);
    } else {
      await message.reply(`No NFTs from our collections found in this wallet.`);
    }
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
        console.log('Discord auth callback. User:', req.user);
        req.login(req.user, function(err) {
            if (err) {
                console.error('Error logging in user:', err);
                return res.redirect('/holder-verify?auth=failed');
            }
            console.log('User logged in successfully');
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

    // TODO: Implement your NFT ownership check here
    const ownsRequiredNFTs = await checkNFTOwnership(walletAddress);

    if (ownsRequiredNFTs) {
      // TODO: Update Discord roles
      const updatedRoles = await updateDiscordRoles(req.user.id);
      
      res.json({ success: true, roles: updatedRoles });
    } else {
      res.json({ success: false, error: 'Required NFTs not found in wallet' });
    }
  } catch (error) {
    console.error('Error during wallet verification:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

async function checkNFTOwnership(walletAddress) {
  // TODO: Implement NFT ownership check
  // This is where you'd query the Solana blockchain or an indexer to check for the required NFTs
  return true; // Placeholder
}

async function updateDiscordRoles(userId) {
  // TODO: Implement Discord role update
  // This is where you'd use the Discord API to update the user's roles
  return ['Verified Holder']; // Placeholder
}

// Add this new route to provide authentication status and username
app.get('/auth/status', (req, res) => {
    console.log('Auth status requested. Full session:', JSON.stringify(req.session));
    console.log('Auth status requested. Session ID:', req.sessionID);
    console.log('Auth status requested. User:', req.user);
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
  // Implementation depends on the structure of your NFT metadata
  // This is a placeholder function
  return "placeholder_collection_address";
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

