import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { checkNFTOwnership, getBUXBalance } from './verify.js';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL, {
  tls: {
    rejectUnauthorized: false
  }
});

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

    const member = await channel.guild.members.fetch(userId);
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
  return await redis.smembers(key);
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
    const nftCounts = await checkNFTOwnership(wallet);
    const buxBalance = await getBUXBalance(wallet);

    // Aggregate NFT counts
    for (const [collection, nfts] of Object.entries(nftCounts)) {
      aggregatedNftCounts[collection] = [...aggregatedNftCounts[collection], ...nfts];
    }

    // Aggregate BUX balance
    totalBuxBalance += buxBalance;
  }

  return {
    nftCounts: aggregatedNftCounts,
    buxBalance: totalBuxBalance
  };
}
