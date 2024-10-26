import { sendProfileMessage } from './profile.js';

export async function handleProfileCommands(message, client) {
  if (message.content.toLowerCase() === '!profile') {
    try {
      await sendProfileMessage(message.channel);
      console.log('Profile message sent successfully');
    } catch (error) {
      console.error('Error sending profile message:', error);
      await message.reply('An error occurred while fetching your profile.');
    }
  }
  // Add other profile-related commands here
}
