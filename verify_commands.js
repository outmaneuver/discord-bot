import { sendVerificationMessage } from './verify.js';

export async function handleVerifyCommands(message, client) {
  if (message.content === '!sendverification' && message.member.permissions.has('ADMINISTRATOR')) {
    try {
      await sendVerificationMessage(message.channel);
      await message.reply('Verification message sent successfully.');
    } catch (error) {
      console.error('Error sending verification message:', error);
      await message.reply('An error occurred while sending the verification message.');
    }
  }
  // Add other verification-related commands here
}
