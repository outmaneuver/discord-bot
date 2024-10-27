import { sendProfileMessage, updateUserProfile } from './profile.js';

export async function handleProfileCommands(message, client) {
  if (message.content.toLowerCase() === '=profile') {
    try {
      await sendProfileMessage(message.channel, message.author.id);
      console.log('Profile message sent successfully');
    } catch (error) {
      console.error('Error sending profile message:', error);
      await message.reply('An error occurred while fetching your profile.');
    }
  } else if (message.content.toLowerCase().startsWith('=profile ')) {
    // Check if the user has admin permissions
    if (!message.member.permissions.has('ADMINISTRATOR')) {
      await message.reply('You do not have permission to view other users\' profiles.');
      return;
    }

    const mentionedUser = message.mentions.users.first();
    if (!mentionedUser) {
      await message.reply('Please mention a user to view their profile.');
      return;
    }

    try {
      await sendProfileMessage(message.channel, mentionedUser.id);
      console.log(`Profile message for ${mentionedUser.username} sent successfully`);
    } catch (error) {
      console.error('Error sending profile message:', error);
      await message.reply(`An error occurred while fetching the profile for ${mentionedUser.username}.`);
    }
  }
  // Remove the '=update' command handling from here as it's now in main_commands.js
}
