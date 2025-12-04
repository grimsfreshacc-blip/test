const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('link')
    .setDescription('Get a login button to link your Epic account.'),

  async execute(interaction, helper) {
    const discordId = interaction.user.id;
    // buildEpicAuthUrl is passed in helper by server.js
    const url = helper.buildEpicAuthUrl(discordId);

    const button = new ButtonBuilder()
      .setLabel('Log in with Epic')
      .setStyle(ButtonStyle.Link)
      .setURL(url);

    const row = new ActionRowBuilder().addComponents(button);

    await interaction.reply({
      content: 'Click the button to login to Epic and link your account.',
      components: [row],
      ephemeral: true
    });
  }
};
