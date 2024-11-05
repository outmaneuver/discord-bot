import { EmbedBuilder, ChannelType, PermissionFlagsBits } from 'discord.js';
import { redis } from '../config/redis.js';

class ActivityService {
    constructor(client) {
        this.client = client;
        this.nftActivityChannel = null;
        this.buxActivityChannel = null;
        this.initialize();
    }

    async initialize() {
        try {
            const guild = await this.client.guilds.fetch(process.env.GUILD_ID);
            if (!guild) {
                console.error('Guild not found:', process.env.GUILD_ID);
                return;
            }

            // Force fetch all channels
            await guild.channels.fetch();

            // Get channels using environment variables
            this.nftActivityChannel = guild.channels.cache.get(process.env.NFT_ACTIVITY_CHANNEL_ID);
            this.buxActivityChannel = guild.channels.cache.get(process.env.BUX_ACTIVITY_CHANNEL_ID);

            // Check channel permissions
            const botMember = await guild.members.fetch(this.client.user.id);
            
            if (this.nftActivityChannel) {
                const nftPerms = this.nftActivityChannel.permissionsFor(botMember);
                console.log('NFT channel found:', {
                    channelId: this.nftActivityChannel.id,
                    channelName: this.nftActivityChannel.name,
                    canSendMessages: nftPerms.has(PermissionFlagsBits.SendMessages),
                    canEmbedLinks: nftPerms.has(PermissionFlagsBits.EmbedLinks),
                    canViewChannel: nftPerms.has(PermissionFlagsBits.ViewChannel)
                });
            }

            if (this.buxActivityChannel) {
                const buxPerms = this.buxActivityChannel.permissionsFor(botMember);
                console.log('BUX channel found:', {
                    channelId: this.buxActivityChannel.id,
                    channelName: this.buxActivityChannel.name,
                    canSendMessages: buxPerms.has(PermissionFlagsBits.SendMessages),
                    canEmbedLinks: buxPerms.has(PermissionFlagsBits.EmbedLinks),
                    canViewChannel: buxPerms.has(PermissionFlagsBits.ViewChannel)
                });
            }

        } catch (error) {
            console.error('Error initializing activity channels:', error);
        }
    }

    async postNFTActivity(event) {
        try {
            if (!this.nftActivityChannel) {
                console.error('NFT activity channel not initialized');
                return;
            }

            // Get action title based on type
            const actionTitles = {
                'transfer': '🔄 TRANSFERRED',
                'sale': '💰 SOLD',
                'list': '📋 LISTED',
                'burn': '🔥 BURNED'
            };

            const title = actionTitles[event.type] || 'ACTIVITY';

            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(title)
                .setImage(event.image || null)
                .addFields(
                    { name: 'Collection', value: event.collection, inline: true },
                    { name: 'NFT', value: `#${event.nftNumber || '???'}`, inline: true }
                )
                .setTimestamp()
                .setFooter({ text: 'BUXDAO NFT Activity' });

            // Add price field for sales/listings
            if (event.price) {
                embed.addFields({ 
                    name: event.type === 'list' ? 'List Price' : 'Sale Price', 
                    value: `${event.price} SOL`, 
                    inline: true 
                });
            }

            // Add wallet fields with shortened addresses and links
            if (event.newOwner) {
                embed.addFields({ 
                    name: event.type === 'list' ? 'Seller' : 'New Owner', 
                    value: `[${event.newOwner.slice(0, 4)}...${event.newOwner.slice(-4)}](https://solscan.io/account/${event.newOwner})` 
                });
            }

            if (event.oldOwner) {
                embed.addFields({ 
                    name: event.type === 'sale' ? 'Seller' : 'Previous Owner', 
                    value: `[${event.oldOwner.slice(0, 4)}...${event.oldOwner.slice(-4)}](https://solscan.io/account/${event.oldOwner})` 
                });
            }

            // Add Solscan link
            embed.addFields({ 
                name: 'View on Solscan', 
                value: `[${event.mint.slice(0, 4)}...${event.mint.slice(-4)}](https://solscan.io/token/${event.mint})` 
            });

            const message = await this.nftActivityChannel.send({ embeds: [embed] });
            console.log('NFT activity message sent:', message.id);
            return message;

        } catch (error) {
            console.error('Error posting NFT activity:', error);
            throw error;
        }
    }

    async postBUXActivity(event) {
        try {
            if (!this.buxActivityChannel) {
                console.error('BUX activity channel not initialized');
                return;
            }

            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('BUX Activity')
                .setThumbnail('https://buxdao-verify-d1faffc83da7.herokuapp.com/bux.jpg')
                .setDescription(`New ${event.type} detected!`)
                .addFields(
                    { name: 'Type', value: event.type, inline: true },
                    { name: 'Wallet', value: `[${event.wallet.slice(0, 4)}...${event.wallet.slice(-4)}](https://solscan.io/account/${event.wallet})`, inline: true },
                    { name: 'Amount', value: `${(event.change / 1e9).toLocaleString()} BUX`, inline: true },
                    { name: 'New Balance', value: `${(event.newBalance / 1e9).toLocaleString()} BUX` }
                )
                .setTimestamp()
                .setFooter({ text: 'BUXDAO BUX Activity' });

            const message = await this.buxActivityChannel.send({ embeds: [embed] });
            console.log('BUX activity message sent:', message.id);
            return message;

        } catch (error) {
            console.error('Error posting BUX activity:', error);
            throw error;
        }
    }
}

export { ActivityService }; 