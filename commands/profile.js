import { updateUserProfile } from './profile.js';
import { PermissionsBitField } from 'discord.js';

export async function handleProfileCommands(message, client) {
  if (message.content.toLowerCase().startsWith('=profile')) {
    await handleProfileCommand(message, client);
  }
}

async function handleProfileCommand(message, client) {
  const mentionedUser = message.mentions.users.first();
  
  // If viewing someone else's profile, check admin permissions
  if (mentionedUser && !message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    await message.reply("You don't have permission to view other users' profiles.");
    return;
  }

  const targetUserId = mentionedUser ? mentionedUser.id : message.author.id;

  try {
    await updateUserProfile(message.channel, targetUserId, client);
  } catch (error) {
    console.error('Error updating profile:', error);
    await message.reply('An error occurred while updating the profile. Please try again later.');
  }
}

export async function handleProfileInteraction(interaction) {
  // Handle slash command interactions
  const targetUser = interaction.options.getUser('user') || interaction.user;
  
  if (targetUser.id !== interaction.user.id && 
      !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    await interaction.reply({ 
      content: "You don't have permission to view other users' profiles.",
      ephemeral: true 
    });
    return;
  }

  try {
    await interaction.deferReply();
    await updateUserProfile(interaction.channel, targetUser.id, interaction.client);
    await interaction.editReply('Profile updated!');
  } catch (error) {
    console.error('Error handling profile interaction:', error);
    await interaction.editReply('An error occurred while updating the profile.');
  }
}
