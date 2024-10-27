import { EmbedBuilder } from 'discord.js';
import { updateDiscordRoles } from './verify.js';
import Redis from 'ioredis';
import fs from 'fs/promises';
import path from 'path';

const redis = new Redis(process.env.REDIS_URL, {
  tls: {
    rejectUnauthorized: false
  }
});

// Load hashlists
const loadHashlist = async (filename) => {
  const filePath = path.join(process.cwd(), 'hashlists', filename);
  const data = await fs.readFile(filePath, 'utf8');
  return new Set(JSON.parse(data));
};

let fckedCatzHashlist, celebcatzHashlist, moneyMonstersHashlist, moneyMonsters3dHashlist, aiBitbotsHashlist;

const initializeHashlists = async () => {
  fckedCatzHashlist = await loadHashlist('fcked_catz.json');
  celebcatzHashlist = await loadHashlist('celebcatz.json');
  moneyMonstersHashlist = await loadHashlist('money_monsters.json');
  moneyMonsters3dHashlist = await loadHashlist('money_monsters3d.json');
  aiBitbotsHashlist = await loadHashlist('ai_bitbots.json');
};

// Call this function when your bot starts up
initializeHashlists();

async function checkNFTOwnership(walletAddress) {
  console.log(`Checking NFT ownership for wallet: ${walletAddress}`);
  const nftCounts = {
    fcked_catz: [],
    celebcatz: [],
    money_monsters: [],
    money_monsters3d: [],
    ai_bitbots: []
  };

  // Fetch all NFTs for the wallet
  const nfts = await redis.smembers(`nfts:${walletAddress}`);

  for (const nft of nfts) {
    if (fckedCatzHashlist.has(nft)) nftCounts.fcked_catz.push(nft);
    else if (celebcatzHashlist.has(nft)) nftCounts.celebcatz.push(nft);
    else if (moneyMonstersHashlist.has(nft)) nftCounts.money_monsters.push(nft);
    else if (moneyMonsters3dHashlist.has(nft)) nftCounts.money_monsters3d.push(nft);
    else if (aiBitbotsHashlist.has(nft)) nftCounts.ai_bitbots.push(nft);
  }

  console.log('NFT counts:', JSON.stringify(nftCounts, null, 2));
  return nftCounts;
}

async function getBUXBalance(walletAddress) {
  console.log(`Getting BUX balance for wallet: ${walletAddress}`);
  const balance = await redis.get(`bux_balance:${walletAddress}`);
  return balance ? parseFloat(balance) : 0;
}

async function aggregateWalletData(wallets) {
  let aggregatedNftCounts = {
    fcked_catz: [],
    celebcatz: [],
    money_monsters: [],
    money_monsters3d: [],
    ai_bitbots: []
  };
  let totalBuxBalance = 0;

  for (const wallet of wallets) {
    console.log(`Aggregating data for wallet: ${wallet}`);
    try {
      const nftCounts = await checkNFTOwnership(wallet);
      const buxBalance = await getBUXBalance(wallet);

      console.log(`NFT counts for wallet ${wallet}:`, JSON.stringify(nftCounts, null, 2));
      console.log(`BUX balance for wallet ${wallet}:`, buxBalance);

      // Aggregate NFT counts
      for (const [collection, nfts] of Object.entries(nftCounts)) {
        aggregatedNftCounts[collection] = [...aggregatedNftCounts[collection], ...nfts];
      }

      // Aggregate BUX balance
      totalBuxBalance += buxBalance;
    } catch (error) {
      console.error(`Error aggregating data for wallet ${wallet}:`, error);
    }
  }

  console.log('Aggregated NFT counts:', JSON.stringify(aggregatedNftCounts, null, 2));
  console.log('Total BUX balance:', totalBuxBalance);

  return {
    nftCounts: aggregatedNftCounts,
    buxBalance: totalBuxBalance
  };
}

export async function getWalletData(userId) {
  console.log('Retrieving wallet data for user:', userId);
  
  try {
    const walletAddresses = await getAllWallets(userId);
    console.log('Retrieved wallet addresses:', walletAddresses);

    if (walletAddresses.length === 0) {
      console.log('No wallets connected for user:', userId);
      return null;
    }

    const aggregatedData = await aggregateWalletData(walletAddresses);

    return {
      walletAddresses,
      nftCounts: aggregatedData.nftCounts,
      buxBalance: aggregatedData.buxBalance,
    };
  } catch (error) {
    console.error('Error fetching wallet data:', error);
    return null;
  }
}

export async function getPokerStats(userId) {
    // ... (existing getPokerStats function)
}

export async function getSpadesStats(userId) {
    // ... (existing getSpadesStats function)
}

export async function sendProfileMessage(channel, userId) {
  try {
    console.log('Sending profile message for user:', userId);
    const walletData = await getWalletData(userId);

    if (!walletData) {
      console.log('No wallet data found for user:', userId);
      const embed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('Profile Not Found')
        .setDescription('No wallet connected. Please verify your wallet first.')
        .addFields(
          { name: 'How to Verify', value: 'Use the `!verify` command to get a link to connect your wallet.' }
        )
        .setTimestamp();

      await channel.send({ embeds: [embed] });
      return;
    }

    const user = await channel.client.users.fetch(userId);
    const username = user.username;

    // Update Discord roles based on aggregated wallet data
    console.log('Updating Discord roles based on all connected wallets');
    await updateDiscordRoles(channel.client, userId, walletData.nftCounts, walletData.buxBalance);

    // Fetch updated member data after role update
    const guild = await channel.client.guilds.fetch(process.env.GUILD_ID);
    const member = await guild.members.fetch(userId);
    const roles = member.roles.cache
      .filter(role => role.name !== '@everyone')
      .sort((a, b) => b.position - a.position)
      .map(role => role.name)
      .join(', ');

    console.log('Creating profile embed for user:', username);
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle(`${username}'s BUX DAO Profile`)
      .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 128 }))
      .addFields(
        { name: 'Connected Wallets', value: walletData.walletAddresses.join('\n') },
        { name: 'BUX Balance', value: `${walletData.buxBalance} BUX` },
        { name: 'NFTs', value: formatNFTCounts(walletData.nftCounts) },
        { name: 'Server Roles', value: roles || 'No roles' }
      )
      .setTimestamp();

    console.log('Sending profile embed');
    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error('Error sending profile message:', error);
    await channel.send('An error occurred while fetching your profile. Please try again later.');
  }
}

function formatNFTCounts(nftCounts) {
  return Object.entries(nftCounts)
    .map(([collection, count]) => `${collection}: ${count.length}`)
    .join('\n');
}

export function generateProfileHtml(walletData, pokerStats, spadesStats) {
    // ... (generate HTML for profile)
}

async function getAllWallets(userId) {
  const key = `wallets:${userId}`;
  try {
    const wallets = await redis.smembers(key);
    console.log(`Retrieved wallets for user ${userId}:`, wallets);
    return wallets;
  } catch (error) {
    console.error(`Error retrieving wallets for user ${userId}:`, error);
    return [];
  }
}

async function retryWithBackoff(fn, maxRetries = 5, initialDelay = 1000) {
  let retries = 0;
  while (retries < maxRetries) {
    try {
      return await fn();
    } catch (error) {
      if (error.message.includes('429 Too Many Requests')) {
        const delay = initialDelay * Math.pow(2, retries);
        console.log(`Rate limited. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        retries++;
      } else {
        throw error;
      }
    }
  }
  throw new Error('Max retries reached');
}

export async function updateUserProfile(channel, userId, client) {
  try {
    console.log('Updating profile for user:', userId);
    const walletData = await getWalletData(userId);

    if (!walletData) {
      console.log('No wallet data found for user:', userId);
      await channel.send('No connected wallets found. Please verify your wallet first using the `!verify` command.');
      return;
    }

    console.log('Wallet data:', JSON.stringify(walletData, null, 2));

    // Update Discord roles based on aggregated wallet data
    console.log('Updating Discord roles based on all connected wallets');
    await updateDiscordRoles(client, userId, walletData.nftCounts, walletData.buxBalance);

    // Fetch updated member data after role update
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    const member = await guild.members.fetch(userId);
    const roles = member.roles.cache
      .filter(role => role.name !== '@everyone')
      .sort((a, b) => b.position - a.position)
      .map(role => role.name)
      .join(', ');

    const user = await client.users.fetch(userId);
    const username = user.username;

    console.log('Creating updated profile embed for user:', username);
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle(`${username}'s Updated BUX DAO Profile`)
      .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 128 }))
      .addFields(
        { name: 'Connected Wallets', value: walletData.walletAddresses.join('\n') },
        { name: 'BUX Balance', value: `${walletData.buxBalance} BUX` },
        { name: 'NFTs', value: formatNFTCounts(walletData.nftCounts) },
        { name: 'Updated Server Roles', value: roles || 'No roles' }
      )
      .setTimestamp();

    console.log('Sending updated profile embed');
    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error('Error updating user profile:', error);
    throw error;
  }
}
