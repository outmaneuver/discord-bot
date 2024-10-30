import { EmbedBuilder } from 'discord.js';
import { updateDiscordRoles, getBUXBalance } from './verify.js';
import { redis } from '../config/redis.js';
import { startOrUpdateDailyTimer, getTimeUntilNextClaim, calculateDailyReward } from './rewards.js';
import puppeteer from 'puppeteer';

export async function getWalletData(userId) {
  try {
    const wallets = await redis.smembers(`wallets:${userId}`);
    return { walletAddresses: wallets || [] };
  } catch (error) {
    console.error('Error getting wallet data:', error);
    return { walletAddresses: [] };
  }
}

export async function updateUserProfile(channel, userId, client) {
  try {
    const walletData = await getWalletData(userId);
    if (!walletData || walletData.walletAddresses.length === 0) {
      throw new Error('No wallets connected');
    }

    // Get NFT counts from updateDiscordRoles
    const roleUpdate = await updateDiscordRoles(userId, client);
    console.log('Role update result:', roleUpdate);

    // Extract nftCounts from roleUpdate - handle both object and boolean returns
    const nftCounts = roleUpdate?.nftCounts || {
      fcked_catz: 0,
      celebcatz: 0,
      money_monsters: 0,
      money_monsters3d: 0,
      ai_bitbots: 0,
      warriors: 0,
      squirrels: 0,
      rjctd_bots: 0,
      energy_apes: 0,
      doodle_bots: 0,
      candy_bots: 0
    };

    // Get BUX balance from Redis and refresh from chain
    let totalBuxBalance = 0;
    for (const wallet of walletData.walletAddresses) {
      // Get fresh balance from chain
      const chainBalance = await getBUXBalance(wallet);
      console.log('Chain BUX balance for wallet:', wallet, chainBalance);
      
      // Get cached balance from Redis
      const cachedBalance = parseInt(await redis.get(`bux:${wallet}`) || '0');
      console.log('Cached BUX balance for wallet:', wallet, cachedBalance);
      
      // Use chain balance if available, otherwise use cached
      const balance = chainBalance || cachedBalance;
      // Divide by 1e9 to get correct decimal places and remove decimals
      totalBuxBalance += Math.floor(balance / 1e9);
    }

    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    if (!guild) throw new Error('Guild not found');

    const member = await guild.members.fetch(userId);
    if (!member) throw new Error('Member not found');

    const roles = member.roles.cache
      .filter(role => role.name !== '@everyone')
      .sort((a, b) => b.position - a.position)
      .map(role => role.name)
      .join('\n') || 'No roles';

    const dailyReward = await calculateDailyReward(nftCounts, totalBuxBalance);
    const [timerData, timeUntilNext] = await Promise.all([
      startOrUpdateDailyTimer(userId, nftCounts, totalBuxBalance),
      getTimeUntilNextClaim(userId)
    ]);

    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle(`${member.user.username}'s BUX DAO Profile`)
      .addFields(
        { 
          name: 'Connected Wallets', 
          value: walletData.walletAddresses.join('\n') || 'No wallets connected'
        },
        { name: '\u200B', value: '─'.repeat(40) },
        { 
          name: 'Main Collections', 
          value: [
            `Fcked Catz: ${nftCounts.fcked_catz || 0}`,
            `CelebCatz: ${nftCounts.celebcatz || 0}`,
            `Money Monsters: ${nftCounts.money_monsters || 0}`,
            `Money Monsters 3D: ${nftCounts.money_monsters3d || 0}`,
            `AI Bitbots: ${nftCounts.ai_bitbots || 0}`
          ].join('\n') || 'No NFTs'
        },
        { name: '\u200B', value: '─'.repeat(40) },
        {
          name: 'A.I. Collabs',
          value: [
            `A.I. Warriors: ${nftCounts.warriors || 0}`,
            `A.I. Squirrels: ${nftCounts.squirrels || 0}`,
            `A.I. Energy Apes: ${nftCounts.energy_apes || 0}`,
            `RJCTD Bots: ${nftCounts.rjctd_bots || 0}`,
            `Candy Bots: ${nftCounts.candy_bots || 0}`,
            `Doodle Bots: ${nftCounts.doodle_bots || 0}`
          ].join('\n') || 'No NFTs'
        },
        { name: '\u200B', value: '─'.repeat(40) },
        {
          name: 'Server Roles',
          value: roles
        },
        { name: '\u200B', value: '─'.repeat(40) },
        { 
          name: 'BUX Balance', 
          value: `${totalBuxBalance.toLocaleString()} BUX`
        },
        { 
          name: 'Daily Reward', 
          value: `${dailyReward.toLocaleString()} BUX` 
        },
        { 
          name: 'BUX Claim', 
          value: `${(timerData?.claimAmount || 0).toLocaleString()} BUX` 
        },
        { 
          name: 'Claim updates in', 
          value: timeUntilNext || 'Start timer by verifying wallet'
        }
      );

    await channel.send({ embeds: [embed] });

  } catch (error) {
    console.error('Error updating user profile:', error);
    await channel.send('An error occurred while processing your command. Please try again later.');
  }
}

export async function displayWallets(channel, userId) {
  try {
    const walletData = await getWalletData(userId);
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('Connected Wallets')
      .addFields({
        name: 'Your Wallets',
        value: walletData.walletAddresses.join('\n') || 'No wallets connected'
      });
    
    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error('Error displaying wallets:', error);
    await channel.send('An error occurred while fetching wallet information.');
  }
}

export async function displayNFTs(channel, userId, client) {
  try {
    const roleUpdate = await updateDiscordRoles(userId, client);
    const nftCounts = roleUpdate?.nftCounts || {};
    
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('NFT Holdings')
      .addFields(
        {
          name: 'Main Collections',
          value: [
            `Fcked Catz: ${nftCounts.fcked_catz || 0}`,
            `CelebCatz: ${nftCounts.celebcatz || 0}`,
            `Money Monsters: ${nftCounts.money_monsters || 0}`,
            `Money Monsters 3D: ${nftCounts.money_monsters3d || 0}`,
            `AI Bitbots: ${nftCounts.ai_bitbots || 0}`
          ].join('\n')
        },
        { name: '\u200B', value: '─'.repeat(40) },
        {
          name: 'A.I. Collabs',
          value: [
            `A.I. Warriors: ${nftCounts.warriors || 0}`,
            `A.I. Squirrels: ${nftCounts.squirrels || 0}`,
            `A.I. Energy Apes: ${nftCounts.energy_apes || 0}`,
            `RJCTD Bots: ${nftCounts.rjctd_bots || 0}`,
            `Candy Bots: ${nftCounts.candy_bots || 0}`,
            `Doodle Bots: ${nftCounts.doodle_bots || 0}`
          ].join('\n')
        }
      );
    
    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error('Error displaying NFTs:', error);
    await channel.send('An error occurred while fetching NFT information.');
  }
}

export async function displayRoles(channel, userId, client) {
  try {
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    if (!guild) throw new Error('Guild not found');

    const member = await guild.members.fetch(userId);
    if (!member) throw new Error('Member not found');

    const roles = member.roles.cache
      .filter(role => role.name !== '@everyone')
      .sort((a, b) => b.position - a.position)
      .map(role => role.name)
      .join('\n');

    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('Server Roles')
      .addFields({
        name: 'Your Roles',
        value: roles || 'No roles'
      });
    
    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error('Error displaying roles:', error);
    await channel.send('An error occurred while fetching role information.');
  }
}

export async function displayBuxInfo(channel, userId, client) {
  try {
    const walletData = await getWalletData(userId);
    let totalBuxBalance = 0;
    
    // Try to get cached balances first
    for (const wallet of walletData.walletAddresses) {
      const cachedBalance = parseInt(await redis.get(`bux:${wallet}`) || '0');
      totalBuxBalance += Math.floor(cachedBalance / 1e9);
    }

    // Only try chain balance if no cached balance
    if (totalBuxBalance === 0) {
      for (const wallet of walletData.walletAddresses) {
        try {
          const chainBalance = await getBUXBalance(wallet);
          totalBuxBalance += Math.floor((chainBalance || 0) / 1e9);
        } catch (error) {
          console.error('Error getting chain balance:', error);
          // Continue to next wallet
        }
      }
    }

    const roleUpdate = await updateDiscordRoles(userId, client);
    const nftCounts = roleUpdate?.nftCounts || {};
    
    const dailyReward = await calculateDailyReward(nftCounts, totalBuxBalance);
    const [timerData, timeUntilNext] = await Promise.all([
      startOrUpdateDailyTimer(userId, nftCounts, totalBuxBalance),
      getTimeUntilNextClaim(userId)
    ]);

    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('BUX Information')
      .addFields(
        { 
          name: 'BUX Balance', 
          value: `${totalBuxBalance.toLocaleString()} BUX`
        },
        { 
          name: 'Daily Reward', 
          value: `${dailyReward.toLocaleString()} BUX` 
        },
        { 
          name: 'BUX Claim', 
          value: `${(timerData?.claimAmount || 0).toLocaleString()} BUX` 
        },
        { 
          name: 'Claim updates in', 
          value: timeUntilNext || 'Start timer by verifying wallet'
        }
      );
    
    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error('Error displaying BUX info:', error);
    await channel.send('An error occurred while fetching BUX information.');
  }
}

export async function displayHelp(channel) {
  const embed = new EmbedBuilder()
    .setColor('#0099ff')
    .setTitle('BUX DAO Bot Commands')
    .addFields(
      {
        name: 'Profile Commands',
        value: [
          '`=my.profile` - Display your full profile',
          '`=my.wallet` - Show your connected wallets',
          '`=my.nfts` - Display your NFT holdings',
          '`=my.roles` - Show your server roles',
          '`=my.bux` - Show your BUX balance and rewards'
        ].join('\n')
      },
      {
        name: 'Collection Stats',
        value: [
          '`=info.catz` - Show Fcked Catz stats',
          '`=info.celeb` - Show Celeb Catz stats',
          '`=info.mm` - Show Money Monsters stats',
          '`=info.mm3d` - Show Money Monsters 3D stats',
          '`=info.bots` - Show AI Bitbots stats'
        ].join('\n')
      },
      {
        name: 'Other Commands',
        value: '`=help` - Show this help message'
      }
    );
  
  await channel.send({ embeds: [embed] });
}

// Update the fetchTensorStats function
async function fetchTensorStats(collection) {
  try {
    const slugMap = {
      'fcked_catz': 'fckedcatz',
      'celebcatz': 'celebcatz', 
      'money_monsters': 'moneymonsters',
      'money_monsters3d': 'moneymonsters3d',
      'ai_bitbots': 'aibitbots'
    };

    const slug = slugMap[collection] || collection;
    
    // Launch browser
    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    
    // Go to collection page
    await page.goto(`https://www.tensor.trade/trade/${slug}`, {
      waitUntil: 'networkidle0'
    });

    // Wait for stats to load
    await page.waitForSelector('[data-floor-price]');

    // Extract stats
    const stats = await page.evaluate(() => ({
      floor: parseFloat(document.querySelector('[data-floor-price]').textContent) * 1e9,
      buyNow: parseFloat(document.querySelector('[data-floor-price]').textContent) * 1e9,
      listed: parseInt(document.querySelector('[data-listed-count]').textContent),
      totalSupply: parseInt(document.querySelector('[data-total-supply]').textContent),
      volume24h: parseFloat(document.querySelector('[data-volume-24h]').textContent) * 1e9,
      volumeAll: parseFloat(document.querySelector('[data-volume-all]').textContent) * 1e9,
      sales24h: parseInt(document.querySelector('[data-sales-24h]').textContent),
      priceChange24h: parseFloat(document.querySelector('[data-price-change]').textContent) / 100
    }));

    await browser.close();

    return stats;
  } catch (error) {
    console.error('Error fetching Tensor stats:', error);
    throw error;
  }
}

export async function displayCatzInfo(channel) {
  try {
    // Fetch real-time data from Tensor
    const stats = await fetchTensorStats('fcked_catz');
    
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('Fcked Catz')
      .setThumbnail('https://creator-hub-prod.s3.us-east-2.amazonaws.com/fcked_catz_pfp_1646574386909.png')
      .addFields(
        { 
          name: 'FLOOR',
          value: `${(stats.floor/1e9).toFixed(3)} SOL`,
          inline: true
        },
        { 
          name: 'BUY NOW',
          value: `${(stats.buyNow/1e9).toFixed(3)} SOL`,
          inline: true
        },
        {
          name: '\u200B',
          value: '\u200B',
          inline: true
        },
        {
          name: 'LISTED/SUPPLY',
          value: `${stats.listed}/${stats.totalSupply} (${((stats.listed/stats.totalSupply)*100).toFixed(2)}%)`,
          inline: true
        },
        {
          name: 'VOLUME (24H)',
          value: `${(stats.volume24h/1e9).toFixed(2)} SOL`,
          inline: true
        },
        {
          name: 'VOLUME (ALL)',
          value: `${(stats.volumeAll/1e9).toFixed(2)} SOL`,
          inline: true
        },
        {
          name: 'SALES (24H)',
          value: `${stats.sales24h || 0}`,
          inline: true
        },
        {
          name: 'PRICE Δ (24H)',
          value: `${stats.priceChange24h ? (stats.priceChange24h * 100).toFixed(2) + '%' : '0%'}`,
          inline: true
        }
      )
      .setFooter({ text: 'Data from Tensor.Trade' });

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error('Error displaying Catz info:', error);
    await channel.send('An error occurred while fetching collection information.');
  }
}

export async function displayMMInfo(channel) {
  try {
    const stats = await fetchTensorStats('money_monsters');
    
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('MONEY MONSTERS')
      .setThumbnail('https://creator-hub-prod.s3.us-east-2.amazonaws.com/money_monsters_pfp_1646574386909.png')
      .addFields(
        { 
          name: 'FLOOR',
          value: `${(stats.floor/1e9).toFixed(3)} SOL`,
          inline: true
        },
        { 
          name: 'BUY NOW',
          value: `${(stats.buyNow/1e9).toFixed(3)} SOL`,
          inline: true
        },
        {
          name: '\u200B',
          value: '\u200B',
          inline: true
        },
        {
          name: 'LISTED/SUPPLY',
          value: `${stats.listed}/${stats.totalSupply} (${((stats.listed/stats.totalSupply)*100).toFixed(2)}%)`,
          inline: true
        },
        {
          name: 'VOLUME (24H)',
          value: `${(stats.volume24h/1e9).toFixed(2)} SOL`,
          inline: true
        },
        {
          name: 'VOLUME (ALL)',
          value: `${(stats.volumeAll/1e9).toFixed(2)} SOL`,
          inline: true
        },
        {
          name: 'SALES (24H)',
          value: `${stats.sales24h || 0}`,
          inline: true
        },
        {
          name: 'PRICE Δ (24H)',
          value: `${stats.priceChange24h ? (stats.priceChange24h * 100).toFixed(2) + '%' : '0%'}`,
          inline: true
        }
      )
      .setFooter({ text: 'Data from Tensor.Trade' });

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error('Error displaying MM info:', error);
    await channel.send('An error occurred while fetching collection information.');
  }
}

export async function displayMM3DInfo(channel) {
  try {
    const stats = await fetchTensorStats('money_monsters3d');
    
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('MONEY MONSTERS 3D')
      .setThumbnail('https://creator-hub-prod.s3.us-east-2.amazonaws.com/money_monsters3d_pfp_1646574386909.png')
      .addFields(
        { 
          name: 'FLOOR',
          value: `${(stats.floor/1e9).toFixed(3)} SOL`,
          inline: true
        },
        { 
          name: 'BUY NOW',
          value: `${(stats.buyNow/1e9).toFixed(3)} SOL`,
          inline: true
        },
        {
          name: '\u200B',
          value: '\u200B',
          inline: true
        },
        {
          name: 'LISTED/SUPPLY',
          value: `${stats.listed}/${stats.totalSupply} (${((stats.listed/stats.totalSupply)*100).toFixed(2)}%)`,
          inline: true
        },
        {
          name: 'VOLUME (24H)',
          value: `${(stats.volume24h/1e9).toFixed(2)} SOL`,
          inline: true
        },
        {
          name: 'VOLUME (ALL)',
          value: `${(stats.volumeAll/1e9).toFixed(2)} SOL`,
          inline: true
        },
        {
          name: 'SALES (24H)',
          value: `${stats.sales24h || 0}`,
          inline: true
        },
        {
          name: 'PRICE Δ (24H)',
          value: `${stats.priceChange24h ? (stats.priceChange24h * 100).toFixed(2) + '%' : '0%'}`,
          inline: true
        }
      )
      .setFooter({ text: 'Data from Tensor.Trade' });

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error('Error displaying MM3D info:', error);
    await channel.send('An error occurred while fetching collection information.');
  }
}

export async function displayCelebInfo(channel) {
  try {
    const stats = await fetchTensorStats('celebcatz');
    
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('Celeb Catz')
      .setThumbnail('https://creator-hub-prod.s3.us-east-2.amazonaws.com/celebcatz_pfp_1646574386909.png')
      .addFields(
        { 
          name: 'FLOOR',
          value: `${(stats.floor/1e9).toFixed(3)} SOL`,
          inline: true
        },
        { 
          name: 'BUY NOW',
          value: `${(stats.buyNow/1e9).toFixed(3)} SOL`,
          inline: true
        },
        {
          name: '\u200B',
          value: '\u200B',
          inline: true
        },
        {
          name: 'LISTED/SUPPLY',
          value: `${stats.listed}/${stats.totalSupply} (${((stats.listed/stats.totalSupply)*100).toFixed(2)}%)`,
          inline: true
        },
        {
          name: 'VOLUME (24H)',
          value: `${(stats.volume24h/1e9).toFixed(2)} SOL`,
          inline: true
        },
        {
          name: 'VOLUME (ALL)',
          value: `${(stats.volumeAll/1e9).toFixed(2)} SOL`,
          inline: true
        },
        {
          name: 'SALES (24H)',
          value: `${stats.sales24h || 0}`,
          inline: true
        },
        {
          name: 'PRICE Δ (24H)',
          value: `${stats.priceChange24h ? (stats.priceChange24h * 100).toFixed(2) + '%' : '0%'}`,
          inline: true
        }
      )
      .setFooter({ text: 'Data from Tensor.Trade' });

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error('Error displaying CelebCatz info:', error);
    await channel.send('An error occurred while fetching collection information.');
  }
}

export async function displayBitbotsInfo(channel) {
  try {
    const stats = await fetchTensorStats('ai_bitbots');
    
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('AI BITBOTS')
      .setThumbnail('https://creator-hub-prod.s3.us-east-2.amazonaws.com/ai_bitbots_pfp_1646574386909.png')
      .addFields(
        { 
          name: 'FLOOR',
          value: `${(stats.floor/1e9).toFixed(3)} SOL`,
          inline: true
        },
        { 
          name: 'BUY NOW',
          value: `${(stats.buyNow/1e9).toFixed(3)} SOL`,
          inline: true
        },
        {
          name: '\u200B',
          value: '\u200B',
          inline: true
        },
        {
          name: 'LISTED/SUPPLY',
          value: `${stats.listed}/${stats.totalSupply} (${((stats.listed/stats.totalSupply)*100).toFixed(2)}%)`,
          inline: true
        },
        {
          name: 'VOLUME (24H)',
          value: `${(stats.volume24h/1e9).toFixed(2)} SOL`,
          inline: true
        },
        {
          name: 'VOLUME (ALL)',
          value: `${(stats.volumeAll/1e9).toFixed(2)} SOL`,
          inline: true
        },
        {
          name: 'SALES (24H)',
          value: `${stats.sales24h || 0}`,
          inline: true
        },
        {
          name: 'PRICE Δ (24H)',
          value: `${stats.priceChange24h ? (stats.priceChange24h * 100).toFixed(2) + '%' : '0%'}`,
          inline: true
        }
      )
      .setFooter({ text: 'Data from Tensor.Trade' });

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error('Error displaying Bitbots info:', error);
    await channel.send('An error occurred while fetching collection information.');
  }
}
