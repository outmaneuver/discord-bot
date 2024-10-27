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

// ... (existing code for loading hashlists)

export async function addWallet(userId, walletAddress) {
  const key = `wallets:${userId}`;
  try {
    const result = await redis.sadd(key, walletAddress);
    console.log(`Added wallet ${walletAddress} for user ${userId}. Result: ${result}`);
    return result === 1; // Returns true if the wallet was successfully added
  } catch (error) {
    console.error(`Error adding wallet ${walletAddress} for user ${userId}:`, error);
    throw error;
  }
}

export async function removeWallet(userId, walletAddress) {
  const key = `wallets:${userId}`;
  try {
    const result = await redis.srem(key, walletAddress);
    console.log(`Removed wallet ${walletAddress} for user ${userId}. Result: ${result}`);
    return result === 1; // Returns true if the wallet was successfully removed
  } catch (error) {
    console.error(`Error removing wallet ${walletAddress} for user ${userId}:`, error);
    throw error;
  }
}

export async function getWalletData(userId) {
  const key = `wallets:${userId}`;
  try {
    const walletAddresses = await redis.smembers(key);
    console.log(`Retrieved wallets for user ${userId}:`, walletAddresses);
    return { walletAddresses };
  } catch (error) {
    console.error(`Error retrieving wallet data for user ${userId}:`, error);
    throw error;
  }
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

export async function updateUserProfile(channel, userId, client) {
  try {
    console.log('Updating profile for user:', userId);
    const walletData = await getWalletData(userId);

    if (!walletData || walletData.walletAddresses.length === 0) {
      console.log('No wallet data found for user:', userId);
      await channel.send('No connected wallets found. Please verify your wallet first using the `!verify` command.');
      return;
    }

    console.log('Wallet data:', JSON.stringify(walletData, null, 2));

    const aggregatedData = await aggregateWalletData(walletData.walletAddresses);

    // Update Discord roles based on aggregated wallet data
    console.log('Updating Discord roles based on all connected wallets');
    await updateDiscordRoles(client, userId, aggregatedData.nftCounts, aggregatedData.buxBalance);

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
        { name: 'BUX Balance', value: `${aggregatedData.buxBalance} BUX` },
        { name: 'NFTs', value: formatNFTCounts(aggregatedData.nftCounts) },
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

export async function sendProfileMessage(channel, userId) {
  try {
    await updateUserProfile(channel, userId, channel.client);
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

// Make sure to export all necessary functions
export { checkNFTOwnership, getBUXBalance };
