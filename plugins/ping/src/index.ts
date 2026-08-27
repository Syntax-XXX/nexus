import { SlashCommandBuilder } from "discord.js";
import { definePlugin } from "@nexus/plugin-api";

export default definePlugin((context) => ({
  commands: [{
    data: new SlashCommandBuilder()
      .setName("ping")
      .setDescription("Zeigt die Bot- und API-Latenz an")
      .toJSON(),
    async execute(interaction) {
      const startedAt = Date.now();
      await interaction.reply({ content: "Pong …", ephemeral: true });
      const roundTrip = Date.now() - startedAt;
      await interaction.editReply(`Pong! Roundtrip: ${roundTrip} ms · Gateway: ${interaction.client.ws.ping} ms`);
    },
  }],
  onLoad() {
    context.logger.info({ pluginId: context.manifest.id }, "Ping plugin initialized");
  },
}));
