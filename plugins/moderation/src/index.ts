import {
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type SlashCommandStringOption,
} from "discord.js";
import { definePlugin, type PluginCommand, type PluginContext } from "@nexus/plugin-api";

const reasonOption = (option: SlashCommandStringOption) =>
  option.setName("reason").setDescription("Reason shown to the member and stored in the case").setMaxLength(512);

function guildIdOf(interaction: ChatInputCommandInteraction): string | null {
  return interaction.guildId;
}

async function requireGuild(interaction: ChatInputCommandInteraction): Promise<string | null> {
  const guildId = guildIdOf(interaction);
  if (!guildId) {
    await interaction.reply({ content: "Dieser Befehl kann nur auf einem Server verwendet werden.", ephemeral: true });
    return null;
  }
  return guildId;
}

function reasonOf(interaction: ChatInputCommandInteraction): string {
  return interaction.options.getString("reason")?.trim() || "Kein Grund angegeben";
}

async function warn(interaction: ChatInputCommandInteraction, context: PluginContext): Promise<void> {
  const guildId = await requireGuild(interaction);
  if (!guildId) return;
  const target = interaction.options.getUser("user", true);
  const warning = await context.database.createWarning({
    guildId,
    userId: target.id,
    moderatorUserId: interaction.user.id,
    reason: reasonOf(interaction),
  });
  await interaction.reply({
    content: `⚠️ <@${target.id}> wurde verwarnt (Fall #${warning.caseNumber}). Grund: ${warning.reason}`,
    allowedMentions: { users: [] },
  });
  await context.events.emit("moderation.case.created", { guildId, caseId: warning.caseId, action: "warn" });
}

async function warnings(interaction: ChatInputCommandInteraction, context: PluginContext): Promise<void> {
  const guildId = await requireGuild(interaction);
  if (!guildId) return;
  const target = interaction.options.getUser("user", true);
  const rows = await context.database.listWarnings(guildId, target.id);
  if (rows.length === 0) {
    await interaction.reply({ content: `${target.tag} hat keine aktiven Verwarnungen.`, ephemeral: true });
    return;
  }
  const lines = rows.map((row) => `#${row.caseNumber} · ${row.reason} · <t:${Math.floor(Date.parse(row.createdAt) / 1000)}:R>`);
  await interaction.reply({ content: `Verwarnungen für ${target.tag}:\n${lines.join("\n")}`, ephemeral: true });
}

async function ban(interaction: ChatInputCommandInteraction, context: PluginContext): Promise<void> {
  const guildId = await requireGuild(interaction);
  if (!guildId || !interaction.guild) return;
  const target = interaction.options.getUser("user", true);
  const reason = reasonOf(interaction);
  await interaction.guild.members.ban(target, { reason, deleteMessageSeconds: 0 });
  const moderationCase = await context.database.createModerationCase({
    guildId, action: "ban", targetUserId: target.id, moderatorUserId: interaction.user.id, reason,
  });
  await interaction.reply({ content: `🔨 ${target.tag} wurde gebannt (Fall #${moderationCase.caseNumber}).`, ephemeral: true });
  await context.events.emit("moderation.case.created", { guildId, caseId: moderationCase.id, action: "ban" });
}

async function kick(interaction: ChatInputCommandInteraction, context: PluginContext): Promise<void> {
  const guildId = await requireGuild(interaction);
  if (!guildId || !interaction.guild) return;
  const target = interaction.options.getUser("user", true);
  const member = await interaction.guild.members.fetch(target.id);
  const reason = reasonOf(interaction);
  await member.kick(reason);
  const moderationCase = await context.database.createModerationCase({
    guildId, action: "kick", targetUserId: target.id, moderatorUserId: interaction.user.id, reason,
  });
  await interaction.reply({ content: `👢 ${target.tag} wurde gekickt (Fall #${moderationCase.caseNumber}).`, ephemeral: true });
  await context.events.emit("moderation.case.created", { guildId, caseId: moderationCase.id, action: "kick" });
}

async function timeout(interaction: ChatInputCommandInteraction, context: PluginContext): Promise<void> {
  const guildId = await requireGuild(interaction);
  if (!guildId || !interaction.guild) return;
  const target = interaction.options.getUser("user", true);
  const minutes = interaction.options.getInteger("minutes", true);
  const member = await interaction.guild.members.fetch(target.id);
  const reason = reasonOf(interaction);
  await member.timeout(minutes * 60_000, reason);
  const moderationCase = await context.database.createModerationCase({
    guildId,
    action: "timeout",
    targetUserId: target.id,
    moderatorUserId: interaction.user.id,
    reason,
    durationSeconds: minutes * 60,
    expiresAt: new Date(Date.now() + minutes * 60_000).toISOString(),
  });
  await interaction.reply({ content: `⏱️ ${target.tag} wurde für ${minutes} Minuten eingeschränkt (Fall #${moderationCase.caseNumber}).`, ephemeral: true });
  await context.events.emit("moderation.case.created", { guildId, caseId: moderationCase.id, action: "timeout" });
}

async function purge(interaction: ChatInputCommandInteraction, context: PluginContext): Promise<void> {
  const guildId = await requireGuild(interaction);
  if (!guildId || !interaction.channel || !("bulkDelete" in interaction.channel)) return;
  const amount = interaction.options.getInteger("amount", true);
  const deleted = await interaction.channel.bulkDelete(amount, true);
  const moderationCase = await context.database.createModerationCase({
    guildId, action: "purge", targetUserId: interaction.user.id, moderatorUserId: interaction.user.id,
    reason: `${deleted.size} Nachrichten gelöscht`,
  });
  await interaction.reply({ content: `🧹 ${deleted.size} Nachrichten gelöscht (Fall #${moderationCase.caseNumber}).`, ephemeral: true });
  await context.events.emit("moderation.case.created", { guildId, caseId: moderationCase.id, action: "purge" });
}

async function showCase(interaction: ChatInputCommandInteraction, context: PluginContext): Promise<void> {
  const guildId = await requireGuild(interaction);
  if (!guildId) return;
  const number = interaction.options.getInteger("number", true);
  const item = await context.database.getModerationCase(guildId, number);
  if (!item) {
    await interaction.reply({ content: `Fall #${number} wurde nicht gefunden.`, ephemeral: true });
    return;
  }
  await interaction.reply({
    content: `Fall #${item.caseNumber}\nAktion: ${item.action}\nZiel: <@${item.targetUserId}>\nModerator: <@${item.moderatorUserId}>\nGrund: ${item.reason ?? "—"}\nErstellt: <t:${Math.floor(Date.parse(item.createdAt) / 1000)}:F>`,
    ephemeral: true,
  });
}

const commands: readonly PluginCommand[] = [
  {
    data: new SlashCommandBuilder().setName("warn").setDescription("Verwarnt ein Mitglied und erstellt einen Fall")
      .addUserOption((option) => option.setName("user").setDescription("Mitglied").setRequired(true))
      .addStringOption(reasonOption).toJSON(),
    permission: "nexus.moderation.warn",
    execute: warn,
  },
  {
    data: new SlashCommandBuilder().setName("warnings").setDescription("Zeigt aktive Verwarnungen eines Mitglieds")
      .addUserOption((option) => option.setName("user").setDescription("Mitglied").setRequired(true)).toJSON(),
    permission: "nexus.moderation.warn",
    execute: warnings,
  },
  {
    data: new SlashCommandBuilder().setName("ban").setDescription("Bannt ein Mitglied und erstellt einen Fall")
      .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers.toString())
      .addUserOption((option) => option.setName("user").setDescription("Mitglied").setRequired(true))
      .addStringOption(reasonOption).toJSON(),
    permission: "nexus.moderation.ban",
    execute: ban,
  },
  {
    data: new SlashCommandBuilder().setName("kick").setDescription("Kickt ein Mitglied und erstellt einen Fall")
      .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers.toString())
      .addUserOption((option) => option.setName("user").setDescription("Mitglied").setRequired(true))
      .addStringOption(reasonOption).toJSON(),
    permission: "nexus.moderation.kick",
    execute: kick,
  },
  {
    data: new SlashCommandBuilder().setName("timeout").setDescription("Schränkt ein Mitglied zeitweise ein")
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers.toString())
      .addUserOption((option) => option.setName("user").setDescription("Mitglied").setRequired(true))
      .addIntegerOption((option) => option.setName("minutes").setDescription("Dauer in Minuten (1–40320)").setMinValue(1).setMaxValue(40320).setRequired(true))
      .addStringOption(reasonOption).toJSON(),
    permission: "nexus.moderation.timeout",
    execute: timeout,
  },
  {
    data: new SlashCommandBuilder().setName("purge").setDescription("Löscht bis zu 100 aktuelle Nachrichten")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages.toString())
      .addIntegerOption((option) => option.setName("amount").setDescription("Anzahl (1–100)").setMinValue(1).setMaxValue(100).setRequired(true)).toJSON(),
    permission: "nexus.moderation.purge",
    execute: purge,
  },
  {
    data: new SlashCommandBuilder().setName("case").setDescription("Zeigt einen Moderationsfall")
      .addIntegerOption((option) => option.setName("number").setDescription("Fallnummer").setMinValue(1).setRequired(true)).toJSON(),
    permission: "nexus.moderation.view",
    execute: showCase,
  },
];

export default definePlugin((context) => ({
  commands,
  onLoad() {
    context.logger.info({ pluginId: context.manifest.id, commandCount: commands.length }, "Moderation plugin initialized");
  },
}));
