import { sendProfileMessage, updateUserProfile } from './profile.js';

export async function handleProfileCommands(message, client) {
  if (message.content.toLowerCase() === '/profile') {
    await handleProfileCommand(message.channel, message.author.id, message.member.permissions);
  } else if (message.content.toLowerCase().startsWith('/profile ')) {
    const mentionedUser = message.mentions.users.first();
    await handleProfileCommand(message.channel, mentionedUser ? mentionedUser.id : message.author.id, message.member.permissions, mentionedUser);
  }
}

export async function handleProfileInteraction(interaction) {
  // Handle profile commands
}

async function handleProfileCommand(channelOrInteraction, userId, permissions, mentionedUser = null) {
  if (mentionedUser && !permissions.has('ADMINISTRATOR')) {
    await replyToCommand(channelOrInteraction, 'You do not have permission to view other users\' profiles.');
    return;
  }

  try {
    await sendProfileMessage(channelOrInteraction, userId);
    console.log(`Profile message for ${mentionedUser ? mentionedUser.username : 'user'} sent successfully`);
  } catch (error) {
    console.error('Error sending profile message:', error);
    await replyToCommand(channelOrInteraction, `An error occurred while fetching the profile${mentionedUser ? ` for ${mentionedUser.username}` : ''}.`);
  }
}

async function replyToCommand(channelOrInteraction, message) {
  if (channelOrInteraction.reply) {
    await channelOrInteraction.reply(message);
  } else {
    await channelOrInteraction.send(message);
  }
}
