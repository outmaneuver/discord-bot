import { updateUserProfile, removeWallet } from './profile.js';

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
    if (args.length !== 2) {
      await message.reply('Please provide a wallet address to remove. Usage: !remove <wallet_address>');
      return;
    }
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
  // Add other main commands here
}
