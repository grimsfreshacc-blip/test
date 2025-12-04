const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("locker")
    .setDescription("View your full Fortnite locker with pages."),

  async execute(interaction, helper) {
    const discordId = interaction.user.id;

    // Check if logged in
    const tokens = helper.userTokens.get(discordId);
    if (!tokens) {
      return interaction.reply({
        content: "❌ You are **not logged in**.\nUse `/link` first.",
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      // Fetch cosmetics from YOUR Render API
      const apiUrl = `${process.env.APP_URL}/api/cosmetics/${discordId}`;
      const res = await fetch(apiUrl);

      if (!res.ok) {
        return interaction.editReply("❌ Failed to fetch locker from server.");
      }

      const data = await res.json();

      if (!data.skins || !data.skins.length) {
        return interaction.editReply("❌ No skins found in your locker.");
      }

      // Pages: skins only right now
      const skins = data.skins;
      let page = 0;
      const maxPages = skins.length;

      function getRarityColor(rarity) {
        const colors = {
          common: 0xaaaaaa,
          uncommon: 0x1eff00,
          rare: 0x0070ff,
          epic: 0xa335ee,
          legendary: 0xff8000,
          mythic: 0xffcc00,
          exotic: 0x14fff7,
        };
        return colors[rarity?.toLowerCase()] || 0x00a6ff;
      }

      const generateEmbed = () => {
        const skin = skins[page];

        return new EmbedBuilder()
          .setTitle(`${data.accountName}'s Locker`)
          .setColor(getRarityColor(skin.rarity))
          .setThumbnail(skin.icon || null)
          .addFields(
            { name: "Skin", value: skin.name || "Unknown" },
            { name: "Rarity", value: skin.rarity || "Unknown", inline: true }
          )
          .setImage(skin.image || skin.icon || null)
          .setFooter({ text: `Skin ${page + 1} / ${maxPages}` });
      };

      const row = () =>
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("prev")
            .setLabel("⬅️ Prev")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page === 0),

          new ButtonBuilder()
            .setCustomId("next")
            .setLabel("Next ➡️")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page === maxPages - 1)
        );

      // Send first page
      const msg = await interaction.editReply({
        embeds: [generateEmbed()],
        components: [row()],
        ephemeral: true,
      });

      // Button collector
      const collector = msg.createMessageComponentCollector({
        time: 5 * 60 * 1000,
      });

      collector.on("collect", async (btn) => {
        if (btn.user.id !== discordId) {
          return btn.reply({
            content: "❌ This locker is not for you.",
            ephemeral: true,
          });
        }

        if (btn.customId === "next" && page < maxPages - 1) page++;
        if (btn.customId === "prev" && page > 0) page--;

        await btn.update({
          embeds: [generateEmbed()],
          components: [row()],
        });
      });

      collector.on("end", async () => {
        try {
          await msg.edit({ components: [] });
        } catch {}
      });
    } catch (e) {
      console.error(e);
      interaction.editReply("❌ Error fetching locker.");
    }
  },
};
