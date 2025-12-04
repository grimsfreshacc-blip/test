const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("unlink")
    .setDescription("Unlink your Epic Games account from the bot."),

  async execute(interaction, helper) {
    const { userTokens } = helper;
    const discordId = interaction.user.id;

    const hasToken = userTokens.has(discordId);

    if (!hasToken) {
      return interaction.reply({
        content: "❌ You do not have a linked Epic Games account.",
        ephemeral: true
      });
    }

    // Remove Epic token
    userTokens.delete(discordId);

    return interaction.reply({
      content: "✅ Your Epic Games account has been successfully **unlinked**.",
      ephemeral: true
    });
  },
};
