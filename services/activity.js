import { EmbedBuilder, ChannelType, PermissionFlagsBits } from 'discord.js';
import { redis } from '../config/redis.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

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
            } else {
                console.error('NFT activity channel not found:', process.env.NFT_ACTIVITY_CHANNEL_ID);
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
            } else {
                console.error('BUX activity channel not found:', process.env.BUX_ACTIVITY_CHANNEL_ID);
            }

        } catch (error) {
            console.error('Error initializing activity channels:', error);
        }
    }

    async postNFTActivity(event) {
        if (!this.nftActivityChannel) {
            console.error('NFT activity channel not initialized');
            return;
        }

        try {
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('NFT Activity')
                .addFields(
                    { name: 'Type', value: event.type },
                    { name: 'Collection', value: event.collection },
                    { name: 'NFT', value: `[${event.mint}](https://solscan.io/token/${event.mint})` },
                    { name: 'New Owner', value: `[${event.newOwner}](https://solscan.io/account/${event.newOwner})` }
                )
                .setTimestamp();

            if (event.oldOwner) {
                embed.addFields({ 
                    name: 'Previous Owner', 
                    value: `[${event.oldOwner}](https://solscan.io/account/${event.oldOwner})` 
                });
            }

            if (event.price) {
                embed.addFields({ name: 'Price', value: `${event.price} SOL` });
            }

            await this.nftActivityChannel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Error posting NFT activity:', error);
        }
    }

    async postBUXActivity(event) {
        if (!this.buxActivityChannel) {
            console.error('BUX activity channel not initialized');
            return;
        }

        try {
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('BUX Activity')
                .addFields(
                    { name: 'Type', value: event.type },
                    { name: 'Wallet', value: `[${event.wallet}](https://solscan.io/account/${event.wallet})` },
                    { name: 'Amount', value: `${(event.change / 1e9).toLocaleString()} BUX` },
                    { name: 'New Balance', value: `${(event.newBalance / 1e9).toLocaleString()} BUX` }
                )
                .setTimestamp();

            await this.buxActivityChannel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Error posting BUX activity:', error);
        }
    }
}

export { ActivityService }; 