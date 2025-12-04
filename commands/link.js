const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('link')
    .setDescription('Link your Epic Games account to use the skinchecker.'),

  async execute(interaction, { buildEpicAuthUrl }) {
    const discordId = interaction.user.id;

    // Generate OAuth URL
    const authUrl = buildEpicAuthUrl(discordId);

    // Create button
    const button = new ButtonBuilder()
      .setLabel('Link Epic Games Account')
      .setURL(authUrl)
      .setStyle(ButtonStyle.Link);

    const row = new ActionRowBuilder().addComponents(button);

    await interaction.reply({
      content: 'Click the button below to link your Epic Games account:',
      components: [row],
      ephemeral: true
    });
  }
};
