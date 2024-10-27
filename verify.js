import { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } from 'discord.js';
import Redis from 'ioredis';
import fs from 'fs/promises';
import path from 'path';

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

const redis = new Redis(process.env.REDIS_URL, {
  tls: {
    rejectUnauthorized: false
  }
});

export async function verifyHolder(message) {
  try {
    console.log(`Verifying wallet: ${message.walletAddress}`);
    const nftCounts = await checkNFTOwnership(message.walletAddress);
    console.log('NFT ownership check complete:', nftCounts);

    const buxBalance = await getBUXBalance(message.walletAddress);
    console.log('BUX balance:', buxBalance);

    const rolesUpdated = await updateDiscordRoles(message.client, message.userId, nftCounts, buxBalance);

    // Calculate daily reward
    const dailyReward = calculateDailyReward(nftCounts, buxBalance);

    const formattedResponse = `Verification complete!\n\n**VERIFIED ASSETS:**\nFcked Catz - ${nftCounts.fcked_catz.length}\nCeleb Catz - ${nftCounts.celebcatz.length}\nMoney Monsters - ${nftCounts.money_monsters.length}\nMoney Monsters 3D - ${nftCounts.money_monsters3d.length}\nA.I. BitBots - ${nftCounts.ai_bitbots.length}\n$BUX - ${buxBalance}\n\n**Daily reward = ${dailyReward} $BUX**`;

    return {
      success: true,
      rolesUpdated,
      nftCounts,
      buxBalance,
      dailyReward,
      formattedResponse
    };
  } catch (error) {
    console.error('Error in verifyHolder:', error);
    return { success: false, error: error.message };
  }
}

function calculateDailyReward(nftCounts, buxBalance) {
  // Implement your daily reward calculation logic here
  // This is just a placeholder
  return (nftCounts.fcked_catz.length * 2) + 
         (nftCounts.money_monsters.length * 2) + 
         (nftCounts.ai_bitbots.length * 1) + 
         (nftCounts.money_monsters3d.length * 4) + 
         (nftCounts.celebcatz.length * 8);
}

async function storeWalletAddress(userId, walletAddress) {
  const key = `wallets:${userId}`;
  await redis.sadd(key, walletAddress);
}

async function getAllWallets(userId) {
  const key = `wallets:${userId}`;
  return await redis.smembers(key);
}

export async function checkNFTOwnership(walletAddress) {
  console.log(`Checking NFT ownership for wallet: ${walletAddress}`);
  const nftCounts = {
    fcked_catz: [],
    celebcatz: [],
    money_monsters: [],
    money_monsters3d: [],
    ai_bitbots: []
  };

  // Fetch all NFTs for the wallet from Redis
  const nfts = await redis.smembers(`nfts:${walletAddress}`);
  console.log(`Retrieved ${nfts.length} NFTs for wallet ${walletAddress}`);

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

export async function getBUXBalance(walletAddress) {
  // Implement the logic to get BUX balance
  // This is just a placeholder
  return 1000; // Return a dummy value for now
}

export async function updateDiscordRoles(client, userId, nftCounts, buxBalance) {
  try {
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    const member = await guild.members.fetch(userId);

    const allRoles = [
      process.env.ROLE_ID_FCKED_CATZ,
      process.env.ROLE_ID_CELEBCATZ,
      process.env.ROLE_ID_MONEY_MONSTERS,
      process.env.ROLE_ID_MONEY_MONSTERS_3D,
      process.env.ROLE_ID_AI_BITBOTS,
      process.env.ROLE_ID_50000_BUX,
      process.env.ROLE_ID_25000_BUX,
      process.env.ROLE_ID_10000_BUX,
      process.env.ROLE_ID_2500_BUX
    ];

    const rolesToAdd = [];

    // Add NFT roles
    if (nftCounts.fcked_catz.length > 0) rolesToAdd.push(process.env.ROLE_ID_FCKED_CATZ);
    if (nftCounts.celebcatz.length > 0) rolesToAdd.push(process.env.ROLE_ID_CELEBCATZ);
    if (nftCounts.money_monsters.length > 0) rolesToAdd.push(process.env.ROLE_ID_MONEY_MONSTERS);
    if (nftCounts.money_monsters3d.length > 0) rolesToAdd.push(process.env.ROLE_ID_MONEY_MONSTERS_3D);
    if (nftCounts.ai_bitbots.length > 0) rolesToAdd.push(process.env.ROLE_ID_AI_BITBOTS);

    // Add BUX balance roles
    if (buxBalance >= 50000) {
      rolesToAdd.push(process.env.ROLE_ID_50000_BUX);
    } else if (buxBalance >= 25000) {
      rolesToAdd.push(process.env.ROLE_ID_25000_BUX);
    } else if (buxBalance >= 10000) {
      rolesToAdd.push(process.env.ROLE_ID_10000_BUX);
    } else if (buxBalance >= 2500) {
      rolesToAdd.push(process.env.ROLE_ID_2500_BUX);
    }

    // Remove roles that are not in rolesToAdd
    for (const roleId of allRoles) {
      if (roleId && member.roles.cache.has(roleId) && !rolesToAdd.includes(roleId)) {
        await member.roles.remove(roleId);
      }
    }

    // Add the new roles
    for (const roleId of rolesToAdd) {
      if (roleId && !member.roles.cache.has(roleId)) {
        await member.roles.add(roleId);
      }
    }

    console.log(`Updated roles for user ${userId}:`, rolesToAdd);
    return true;
  } catch (error) {
    console.error('Error updating Discord roles:', error);
    throw error;
  }
}

export function sendVerificationMessage(channel) {
    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('THANK YOU FOR CHOOSING BUXDAO')
        .setDescription('To verify your wallet, click the button and open the link in your browser on desktop or copy and paste into wallet browser on mobile devices\n\nAuthorise signing into your discord profile then connect your wallet\n\nYour server roles will update automatically based on your NFT and $BUX token holdings')
        .setTimestamp();

    const button = new ButtonBuilder()
        .setCustomId('verify_wallet')
        .setLabel('Verify Wallet')
        .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder()
        .addComponents(button);

    return channel.send({ embeds: [embed], components: [row] });
}
