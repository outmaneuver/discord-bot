import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export async function getWalletData(userId) {
  // Retrieve wallet addresses for the user
  const walletAddresses = global.userWallets ? global.userWallets.get(userId) : new Set();

  if (!walletAddresses || walletAddresses.size === 0) {
    return null; // No wallets connected
  }

  // Fetch data for the first wallet address (you might want to handle multiple wallets differently)
  const walletAddress = Array.from(walletAddresses)[0];

  // Fetch NFT and BUX data for this wallet address
  const nftCounts = await checkNFTOwnership(walletAddress);
  const buxBalance = await getBUXBalance(walletAddress);

  return {
    walletAddress,
    nftCounts,
    buxBalance,
    // Add other relevant data
  };
}

export async function getPokerStats(userId) {
    // ... (existing getPokerStats function)
}

export async function getSpadesStats(userId) {
    // ... (existing getSpadesStats function)
}

export async function sendProfileMessage(channel, userId) {
  try {
    const walletData = await getWalletData(userId);

    if (!walletData) {
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

    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('Your BUX DAO Profile')
      .addFields(
        { name: 'Wallet Address', value: walletData.walletAddress },
        { name: 'BUX Balance', value: `${walletData.buxBalance} BUX` },
        { name: 'NFTs', value: formatNFTCounts(walletData.nftCounts) },
        // Add other fields as needed
      )
      .setTimestamp();

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



