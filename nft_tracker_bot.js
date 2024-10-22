import { Client, GatewayIntentBits, EmbedBuilder } from 'discord.js';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

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

const collectionNameMap = {
  'fcked_catz': 'Fcked Cat',
  'celebcatz': 'Celeb Cat',
  'money_monsters': 'Money Monster',
  'moneymonsters3d': 'Money Monster 3D',
  'ai_bitbots': 'A.I. BitBot'
};

let lastKnownState = {};

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
  setInterval(checkCollections, 1 * 60 * 1000); // Check every 1 minute
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
  }
});

client.login(DISCORD_TOKEN);
