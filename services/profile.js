import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { updateDiscordRoles, getBUXBalance, hashlists } from './verify.js';
import { redis } from '../config/redis.js';
import { startOrUpdateDailyTimer, getTimeUntilNextClaim, calculateDailyReward } from './rewards.js';
import puppeteer from 'puppeteer';

// Add sleep function
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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

    // Get BUX balance and value with retries
    let totalBuxBalance = 0;
    for (const wallet of walletData.walletAddresses) {
      try {
        await sleep(500); // Add delay between wallet checks
        const chainBalance = await getBUXBalance(wallet);
        const cachedBalance = parseInt(await redis.get(`bux:${wallet}`) || '0');
        const balance = chainBalance || cachedBalance;
        totalBuxBalance += Math.floor(balance / 1e9);
      } catch (error) {
        console.error(`Error fetching balance for wallet ${wallet}:`, error);
        // Use cached balance if available
        const cachedBalance = parseInt(await redis.get(`bux:${wallet}`) || '0');
        totalBuxBalance += Math.floor(cachedBalance / 1e9);
      }
    }

    // Fetch current SOL price and BUX value
    const { fetchBuxPublicSupply } = await import('../src/scripts/fetchBuxSupply.js');
    const { publicSupply, communityWalletSol } = await fetchBuxPublicSupply();
    const buxValueInSol = communityWalletSol / publicSupply;
    
    const solPriceResponse = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
    const solPriceData = await solPriceResponse.json();
    const solPrice = solPriceData.solana.usd;
    
    // Calculate total BUX value in USD
    const buxValueInUsd = buxValueInSol * solPrice;
    const totalBuxValueUsd = totalBuxBalance * buxValueInUsd;

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
          value: `${totalBuxBalance.toLocaleString()} BUX ($${totalBuxValueUsd.toFixed(2)})`
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

export async function displayBuxInfo(channel) {
  try {
    const { fetchBuxPublicSupply } = await import('../src/scripts/fetchBuxSupply.js');
    const { publicSupply, communityWalletSol } = await fetchBuxPublicSupply();
    
    // Calculate BUX value in SOL
    const buxValueInSol = communityWalletSol / publicSupply;
    
    // Fetch current SOL price
    const solPriceResponse = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
    const solPriceData = await solPriceResponse.json();
    const solPrice = solPriceData.solana.usd;
    
    // Calculate BUX value in USD
    const buxValueInUsd = buxValueInSol * solPrice;
    
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('$BUX Token Info')
      .setThumbnail('https://buxdao-verify-d1faffc83da7.herokuapp.com/bux.jpg')
      .addFields(
        { 
          name: 'Public Supply',
          value: `${publicSupply.toLocaleString()} BUX`
        },
        { 
          name: 'Community Wallet',
          value: `${communityWalletSol.toLocaleString()} SOL`
        },
        {
          name: 'BUX Value',
          value: `${buxValueInSol.toFixed(8)} SOL ($${buxValueInUsd.toFixed(4)})`
        }
      )
      .setFooter({ text: 'Data updated in real-time' });

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error('Error displaying BUX info:', error);
    await channel.send('An error occurred while fetching BUX token information.');
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
          '`=info.bots` - Show AI Bitbots stats',
          '`=info.bux` - Show BUX token info'
        ].join('\n')
      },
      {
        name: 'Other Commands',
        value: [
          '`=rewards` - Show daily reward calculations',
          '`=help` - Show this help message'
        ].join('\n')
      }
    );
  
  await channel.send({ embeds: [embed] });
}

// Update the fetchTensorStats function
async function fetchTensorStats(collection) {
  try {
    const response = await fetch(`https://api.tensor.so/api/v1/collections/${collection}/stats`, {
      headers: {
        'x-tensor-api-key': process.env.TENSOR_API_KEY
      }
    });
    if (!response.ok) {
      console.log('Tensor API error:', await response.text());
      throw new Error(`Failed to fetch collection data: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching Tensor stats:', error);
    // Return null instead of throwing to allow fallback display
    return null;
  }
}

// Update getTensorFloor function with better selectors and timeouts
async function getTensorFloor(collection) {
    try {
        const browser = await puppeteer.launch({
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--single-process',
                '--disable-gpu',
                '--no-zygote'
            ],
            executablePath: process.env.CHROME_PATH || '/app/.apt/usr/bin/google-chrome',
            headless: 'new'
        });

        const page = await browser.newPage();
        
        // Set a shorter navigation timeout
        page.setDefaultNavigationTimeout(15000);
        
        // Set viewport to mobile size for faster loading
        await page.setViewport({ width: 390, height: 844 });
        
        await page.goto(`https://www.tensor.trade/trade/${collection}`, {
            waitUntil: 'networkidle0',
            timeout: 15000
        });
        
        // Try multiple selectors with shorter timeout
        const selectors = [
            '[data-price-sol]',
            '.floor-price',
            '.price-sol',
            '[data-floor]'
        ];

        let floorPrice = null;
        for (const selector of selectors) {
            try {
                await page.waitForSelector(selector, {timeout: 5000});
                floorPrice = await page.$eval(selector, el => el.getAttribute('data-price-sol') || el.textContent);
                if (floorPrice) break;
            } catch (error) {
                console.log(`Selector ${selector} not found, trying next...`);
                continue;
            }
        }
        
        await browser.close();
        return floorPrice ? parseFloat(floorPrice) : null;
    } catch (error) {
        console.error('Error scraping Tensor floor:', error);
        return null;
    }
}

// Add retry logic for Magic Eden API calls
async function fetchWithRetry(url, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                    'Accept': 'application/json'
                }
            });
            
            if (response.status === 429) {
                // Rate limited - wait longer between retries
                const delay = Math.pow(2, i) * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            
            if (!response.ok) {
                throw new Error(`Magic Eden API error: ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}

// Update displayCatzInfo function with integrated footer
export async function displayCatzInfo(channel) {
    try {
        // Get collection data with retries
        const statsData = await fetchWithRetry('https://api-mainnet.magiceden.dev/v2/collections/fcked_catz/stats');
        
        const floorPrice = statsData.floorPrice / 1e9; // Convert from lamports to SOL
        const listedCount = statsData.listedCount || 0;
        const totalSupply = statsData.totalItems || 1231; // From ME stats page
        
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('Fcked Catz Collection Info')
            .setThumbnail('https://buxdao-verify-d1faffc83da7.herokuapp.com/catz.jpg')
            .addFields(
                {
                    name: 'Collection Size',
                    value: `${totalSupply.toLocaleString()} NFTs`
                },
                {
                    name: 'Floor Price',
                    value: `${floorPrice.toFixed(2)} SOL`
                },
                {
                    name: 'Listed Count',
                    value: `${listedCount} NFTs (${((listedCount/totalSupply)*100).toFixed(1)}%)`
                },
                {
                    name: 'Daily Reward',
                    value: '5 BUX per NFT'
                },
                {
                    name: 'Whale Status',
                    value: '25+ NFTs'
                }
            )
            .setFooter({ text: 'Available on Magic Eden and Tensor' });

        // Create buttons for marketplaces
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setLabel('Magic Eden')
                    .setURL('https://magiceden.io/marketplace/fcked_catz')
                    .setStyle(ButtonStyle.Link),
                new ButtonBuilder()
                    .setLabel('Tensor')
                    .setURL('https://www.tensor.trade/trade/fcked_catz')
                    .setStyle(ButtonStyle.Link)
            );

        await channel.send({ 
            embeds: [embed],
            components: [row]
        });
    } catch (error) {
        console.error('Error displaying Catz info:', error);
        await channel.send('Error fetching Fcked Catz collection information. Please try again later.');
    }
}

export async function displayMMInfo(channel) {
    try {
        // Get collection data with retries
        const statsData = await fetchWithRetry('https://api-mainnet.magiceden.dev/v2/collections/money_monsters/stats');
        
        const floorPrice = statsData.floorPrice / 1e9; // Convert from lamports to SOL
        const listedCount = statsData.listedCount || 0;
        const totalSupply = statsData.totalItems || 666; // Fallback if ME fails
        
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('Money Monsters Collection Info')
            .setThumbnail('https://buxdao-verify-d1faffc83da7.herokuapp.com/mm.jpg')
            .addFields(
                {
                    name: 'Collection Size',
                    value: `${totalSupply.toLocaleString()} NFTs`
                },
                {
                    name: 'Floor Price',
                    value: `${floorPrice.toFixed(2)} SOL`
                },
                {
                    name: 'Listed Count',
                    value: `${listedCount} NFTs (${((listedCount/totalSupply)*100).toFixed(1)}%)`
                },
                {
                    name: 'Daily Reward',
                    value: '5 BUX per NFT'
                },
                {
                    name: 'Whale Status',
                    value: '25+ NFTs'
                }
            )
            .setFooter({ text: 'Available on Magic Eden and Tensor' });

        // Create buttons for marketplaces
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setLabel('Magic Eden')
                    .setURL('https://magiceden.io/marketplace/money_monsters')
                    .setStyle(ButtonStyle.Link),
                new ButtonBuilder()
                    .setLabel('Tensor')
                    .setURL('https://www.tensor.trade/trade/money_monsters')
                    .setStyle(ButtonStyle.Link)
            );

        await channel.send({ 
            embeds: [embed],
            components: [row]
        });
    } catch (error) {
        console.error('Error displaying Money Monsters info:', error);
        await channel.send('Error fetching Money Monsters collection information. Please try again later.');
    }
}

export async function displayMM3DInfo(channel) {
    try {
        // Get collection data with retries - using exact same method as Catz
        const statsData = await fetchWithRetry('https://api-mainnet.magiceden.dev/v2/collections/money_monsters3d/stats');
        
        const floorPrice = statsData.floorPrice / 1e9; // Convert from lamports to SOL
        const listedCount = statsData.listedCount || 0;
        const totalSupply = statsData.totalItems || 666; // From ME stats page
        
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('Money Monsters 3D Collection Info')
            .setThumbnail('https://buxdao-verify-d1faffc83da7.herokuapp.com/mm3d.jpg')
            .addFields(
                {
                    name: 'Collection Size',
                    value: `${totalSupply.toLocaleString()} NFTs`
                },
                {
                    name: 'Floor Price',
                    value: `${floorPrice.toFixed(2)} SOL`
                },
                {
                    name: 'Listed Count',
                    value: `${listedCount} NFTs (${((listedCount/totalSupply)*100).toFixed(1)}%)`
                },
                {
                    name: 'Daily Reward',
                    value: '10 BUX per NFT'
                },
                {
                    name: 'Whale Status',
                    value: '25+ NFTs'
                }
            )
            .setFooter({ text: 'Available on Magic Eden and Tensor' });

        // Create buttons for marketplaces
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setLabel('Magic Eden')
                    .setURL('https://magiceden.io/marketplace/money_monsters3d')
                    .setStyle(ButtonStyle.Link),
                new ButtonBuilder()
                    .setLabel('Tensor')
                    .setURL('https://www.tensor.trade/trade/money_monsters3d')
                    .setStyle(ButtonStyle.Link)
            );

        await channel.send({ 
            embeds: [embed],
            components: [row]
        });
    } catch (error) {
        console.error('Error displaying Money Monsters 3D info:', error);
        await channel.send('Error fetching Money Monsters 3D collection information. Please try again later.');
    }
}

export async function displayCelebInfo(channel) {
    try {
        // Get collection data with retries
        const statsData = await fetchWithRetry('https://api-mainnet.magiceden.dev/v2/collections/celebcatz/stats');
        
        const floorPrice = statsData.floorPrice / 1e9; // Convert from lamports to SOL
        const listedCount = statsData.listedCount || 0;
        const totalSupply = statsData.totalItems || 130; // From ME stats page
        
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('Celeb Catz Collection Info')
            .setThumbnail('https://buxdao-verify-d1faffc83da7.herokuapp.com/celeb.jpg')
            .addFields(
                {
                    name: 'Collection Size',
                    value: `${totalSupply.toLocaleString()} NFTs`
                },
                {
                    name: 'Floor Price',
                    value: `${floorPrice.toFixed(2)} SOL`
                },
                {
                    name: 'Listed Count',
                    value: `${listedCount} NFTs (${((listedCount/totalSupply)*100).toFixed(1)}%)`
                },
                {
                    name: 'Daily Reward',
                    value: '15 BUX per NFT'
                }
            )
            .setFooter({ text: 'Available on Magic Eden and Tensor' });

        // Create buttons for marketplaces
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setLabel('Magic Eden')
                    .setURL('https://magiceden.io/marketplace/celebcatz')
                    .setStyle(ButtonStyle.Link),
                new ButtonBuilder()
                    .setLabel('Tensor')
                    .setURL('https://www.tensor.trade/trade/celebcatz')
                    .setStyle(ButtonStyle.Link)
            );

        await channel.send({ 
            embeds: [embed],
            components: [row]
        });
    } catch (error) {
        console.error('Error displaying Celeb Catz info:', error);
        await channel.send('Error fetching Celeb Catz collection information. Please try again later.');
    }
}

export async function displayBitbotsInfo(channel) {
    try {
        // Get collection data with retries
        const statsData = await fetchWithRetry('https://api-mainnet.magiceden.dev/v2/collections/ai_bitbots/stats');
        
        const floorPrice = statsData.floorPrice / 1e9; // Convert from lamports to SOL
        const listedCount = statsData.listedCount || 0;
        const totalSupply = statsData.totalItems || 218; // Fallback if ME fails
        
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('AI Bitbots Collection Info')
            .setThumbnail('https://buxdao-verify-d1faffc83da7.herokuapp.com/bots.jpg')
            .addFields(
                {
                    name: 'Collection Size',
                    value: `${totalSupply.toLocaleString()} NFTs`
                },
                {
                    name: 'Floor Price',
                    value: `${floorPrice.toFixed(2)} SOL`
                },
                {
                    name: 'Listed Count',
                    value: `${listedCount} NFTs (${((listedCount/totalSupply)*100).toFixed(1)}%)`
                },
                {
                    name: 'Daily Reward',
                    value: '3 BUX per NFT'
                },
                {
                    name: 'Whale Status',
                    value: '10+ NFTs'
                }
            )
            .setFooter({ text: 'Available on Magic Eden and Tensor' });

        // Create buttons for marketplaces
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setLabel('Magic Eden')
                    .setURL('https://magiceden.io/marketplace/ai_bitbots')
                    .setStyle(ButtonStyle.Link),
                new ButtonBuilder()
                    .setLabel('Tensor')
                    .setURL('https://www.tensor.trade/trade/ai_bitbots')
                    .setStyle(ButtonStyle.Link)
            );

        await channel.send({ 
            embeds: [embed],
            components: [row]
        });
    } catch (error) {
        console.error('Error displaying AI Bitbots info:', error);
        await channel.send('Error fetching AI Bitbots collection information. Please try again later.');
    }
}

// Update displayRewards function
export async function displayRewards(channel) {
  const embed = new EmbedBuilder()
    .setColor('#FFD700')
    .setTitle('🎁 Daily BUX Rewards')
    .setDescription('Here\'s how daily BUX rewards are calculated:')
    .addFields(
      {
        name: '🎨 Main Collections',
        value: [
          '• Fcked Catz: 5 BUX each',
          '• Celeb Catz: 15 BUX each',
          '• Money Monsters: 5 BUX each',
          '• 3D Monsters: 10 BUX each',
          '• AI Bitbots: 3 BUX each'
        ].join('\n')
      },
      {
        name: '🤖 AI Collabs',
        value: [
          '• A.I. Warriors: 1 BUX each',
          '• A.I. Squirrels: 1 BUX each',
          '• A.I. Energy Apes: 1 BUX each',
          '• RJCTD Bots: 1 BUX each',
          '• Candy Bots: 1 BUX each',
          '• Doodle Bots: 1 BUX each'
        ].join('\n')
      },
      {
        name: ' Claiming Rewards',
        value: 'Use `=my.bux` to check your daily rewards and claim status.'
      }
    )
    .setFooter({ text: 'Rewards reset daily at 00:00 UTC' });

  await channel.send({ embeds: [embed] });
}

// Update displayBuxBalance function
export async function displayBuxBalance(channel, userId, client) {
  try {
    const walletData = await getWalletData(userId);
    if (!walletData || walletData.walletAddresses.length === 0) {
      throw new Error('No wallets connected');
    }

    // Get BUX balance from cache first
    let totalBuxBalance = 0;
    for (const wallet of walletData.walletAddresses) {
      const cachedBalance = parseInt(await redis.get(`bux:${wallet}`) || '0');
      totalBuxBalance += Math.floor(cachedBalance / 1e9);
    }

    // Try to get fresh BUX value, but don't fail if it errors
    let buxValueInSol = 0;
    let solPrice = 0;
    try {
      const { fetchBuxPublicSupply } = await import('../src/scripts/fetchBuxSupply.js');
      const { publicSupply, communityWalletSol } = await fetchBuxPublicSupply();
      buxValueInSol = communityWalletSol / publicSupply;
      
      const solPriceResponse = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
      const solPriceData = await solPriceResponse.json();
      solPrice = solPriceData.solana.usd;
    } catch (error) {
      console.error('Error fetching BUX value:', error);
      // Continue with cached values
    }

    // Calculate total BUX value in USD
    const buxValueInUsd = buxValueInSol * solPrice;
    const totalBuxValueUsd = totalBuxBalance * buxValueInUsd;

    // Get daily reward info from cache if possible
    let dailyReward = 0;
    let timerData = null;
    let timeUntilNext = null;
    try {
      const nftCounts = (await updateDiscordRoles(userId, client))?.nftCounts || {};
      dailyReward = await calculateDailyReward(nftCounts, totalBuxBalance);
      [timerData, timeUntilNext] = await Promise.all([
        startOrUpdateDailyTimer(userId, nftCounts, totalBuxBalance),
        getTimeUntilNextClaim(userId)
      ]);
    } catch (error) {
      console.error('Error fetching reward info:', error);
      // Continue with default values
    }

    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('Your BUX Balance')
      .setThumbnail('https://buxdao-verify-d1faffc83da7.herokuapp.com/bux.jpg')
      .addFields(
        { 
          name: 'BUX Balance', 
          value: `${totalBuxBalance.toLocaleString()} BUX${buxValueInSol ? ` ($${totalBuxValueUsd.toFixed(2)})` : ''}`
        }
      );

    // Only add these fields if we have the data
    if (dailyReward) {
      embed.addFields({ 
        name: 'Daily Reward', 
        value: `${dailyReward.toLocaleString()} BUX` 
      });
    }

    if (timerData?.claimAmount) {
      embed.addFields({ 
        name: 'BUX Claim', 
        value: `${(timerData.claimAmount).toLocaleString()} BUX` 
      });
    }

    if (timeUntilNext) {
      embed.addFields({ 
        name: 'Claim updates in', 
        value: timeUntilNext
      });
    }

    embed.setFooter({ text: 'Data updated in real-time' });

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error('Error displaying BUX balance:', error);
    
    if (error.message === 'No wallets connected') {
      await channel.send('Please verify your wallet first using the verification link.');
    } else {
      await channel.send('An error occurred while fetching your BUX information. Please try again later.');
    }
  }
}
