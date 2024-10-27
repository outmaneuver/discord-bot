import { updateUserProfile, removeWallet, getWalletData, addWallet } from './profile.js';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export async function handleMainCommands(message, client) {
  console.log('Received message:', message.content);
  if (message.content.toLowerCase() === '!help') {
    console.log('Handling !help command');
    const commands = [
      { name: '!help', description: 'Show this help message' },
      { name: '!profile', description: 'View your profile' },
      { name: '!profile @user', description: 'View another user\'s profile (Admin only)' },
      { name: '!verify', description: 'Get a link to verify your wallet' },
      { name: '!testsale', description: 'Test a sale notification (Admin only)' },
      { name: '!testlisting', description: 'Test a listing notification (Admin only)' },
      { name: '!testalllistings', description: 'Test all listing notifications (Admin only)' },
      { name: '!sendverification', description: 'Send a verification message to the channel (Admin only)' }
    ];

    const helpEmbed = {
      color: 0x0099ff,
      title: 'BUX DAO Bot Commands',
      description: 'Here are the available commands:',
      fields: commands.map(cmd => ({
        name: cmd.name,
        value: cmd.description
      })),
      footer: { text: 'BUX DAO Bot' },
      timestamp: new Date()
    };

    await message.channel.send({ embeds: [helpEmbed] });
  } else if (message.content.toLowerCase().startsWith('!update')) {
    try {
      const mentionedUser = message.mentions.users.first();
      const targetUserId = mentionedUser ? mentionedUser.id : message.author.id;
      
      // Check if the user has permission to update others' profiles
      if (mentionedUser && !message.member.permissions.has('ADMINISTRATOR')) {
        await message.reply("You don't have permission to update other users' profiles.");
        return;
      }

      await updateUserProfile(message.channel, targetUserId, client);
      await message.reply(`Profile has been updated for ${mentionedUser ? mentionedUser.username : 'you'}.`);
    } catch (error) {
      console.error('Error updating user profile:', error);
      await message.reply('An error occurred while updating the profile. Please try again later.');
    }
  } else if (message.content.toLowerCase().startsWith('!remove')) {
    const args = message.content.split(' ');
    if (args.length === 1) {
      // No wallet address provided, show options
      const walletData = await getWalletData(message.author.id);
      if (!walletData || walletData.walletAddresses.length === 0) {
        await message.reply('You have no connected wallets to remove.');
        return;
      }

      const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('Remove Wallet')
        .setDescription('Choose a wallet to remove:');

      walletData.walletAddresses.forEach((address, index) => {
        embed.addFields({ name: `Wallet ${index + 1}`, value: address });
      });

      const row = new ActionRowBuilder();

      walletData.walletAddresses.forEach((address, index) => {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`remove_wallet_${index}`)
            .setLabel(`Remove Wallet ${index + 1}`)
            .setStyle(ButtonStyle.Danger)
        );
      });

      const reply = await message.reply({ embeds: [embed], components: [row] });

      const filter = i => i.customId.startsWith('remove_wallet_') && i.user.id === message.author.id;
      const collector = reply.createMessageComponentCollector({ filter, time: 60000 });

      collector.on('collect', async i => {
        const index = parseInt(i.customId.split('_')[2]);
        const walletToRemove = walletData.walletAddresses[index];
        try {
          const result = await removeWallet(message.author.id, walletToRemove);
          if (result) {
            await i.update({ content: `Wallet ${walletToRemove} has been removed from your profile.`, components: [], embeds: [] });
          } else {
            await i.update({ content: `Failed to remove wallet ${walletToRemove} from your profile.`, components: [], embeds: [] });
          }
        } catch (error) {
          console.error('Error removing wallet:', error);
          await i.update({ content: 'An error occurred while removing the wallet. Please try again later.', components: [], embeds: [] });
        }
      });

      collector.on('end', collected => {
        if (collected.size === 0) {
          reply.edit({ content: 'Wallet removal timed out.', components: [], embeds: [] });
        }
      });
    } else {
      const walletToRemove = args[1];
      try {
        const result = await removeWallet(message.author.id, walletToRemove);
        if (result) {
          await message.reply(`Wallet ${walletToRemove} has been removed from your profile.`);
        } else {
          await message.reply(`Wallet ${walletToRemove} was not found in your profile.`);
        }
      } catch (error) {
        console.error('Error removing wallet:', error);
        await message.reply('An error occurred while removing the wallet. Please try again later.');
      }
    }
  } else if (message.content.toLowerCase().startsWith('!add')) {
    // Check if the user has administrator permissions
    if (!message.member.permissions.has('ADMINISTRATOR')) {
      await message.reply("You don't have permission to use this command.");
      return;
    }

    const args = message.content.split(' ');
    if (args.length !== 3) {
      await message.reply('Usage: !add @user <wallet_address>');
      return;
    }

    const mentionedUser = message.mentions.users.first();
    if (!mentionedUser) {
      await message.reply('Please mention a user to add a wallet to their profile.');
      return;
    }

    const walletToAdd = args[2];
    try {
      const result = await addWallet(mentionedUser.id, walletToAdd);
      if (result) {
        await message.reply(`Wallet ${walletToAdd} has been added to ${mentionedUser.username}'s profile.`);
      } else {
        await message.reply(`Failed to add wallet ${walletToAdd} to ${mentionedUser.username}'s profile.`);
      }
    } catch (error) {
      console.error('Error adding wallet:', error);
      await message.reply('An error occurred while adding the wallet. Please try again later.');
    }
  }
  // Add other main commands here
}
