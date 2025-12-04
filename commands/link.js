const { 
  SlashCommandBuilder, 
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle 
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("link")
    .setDescription("Connect your Fortnite account to the SkinChecker."),

  async execute(interaction, { buildEpicAuthUrl }) {
    const discordId = interaction.user.id;

    const loginUrl = buildEpicAuthUrl(discordId);

    const embed = new EmbedBuilder()
      .setTitle("🔗 Fortnite Login")
      .setDescription(
        "Click the button below to log in with **Epic Games**.\n\n" +
        "After logging in, return to Discord and use `/locker`."
      )
      .setColor(0x00a6ff);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("Login with Epic Games")
        .setStyle(ButtonStyle.Link)
        .setURL(loginUrl)
    );

    return interaction.reply({
      embeds: [embed],
      components: [row],
      ephemeral: true
    });
  }
};
