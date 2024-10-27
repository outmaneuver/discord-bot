import { verifyHolder, sendVerificationMessage } from './verify.js';

export async function handleVerifyCommands(message, client) {
  if (message.content.toLowerCase() === '/verify') {
    try {
      const verificationUrl = process.env.VERIFICATION_URL || 'https://buxdao-verify-d1faffc83da7.herokuapp.com/holder-verify';
      await message.reply(`To verify your wallet, please visit: ${verificationUrl}`);
    } catch (error) {
      console.error('Error sending verification link:', error);
      await message.reply('An error occurred while generating the verification link.');
    }
  } else if (message.content.toLowerCase() === '/sendverification' && message.member.permissions.has('ADMINISTRATOR')) {
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
