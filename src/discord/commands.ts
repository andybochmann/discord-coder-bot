import { SlashCommandBuilder } from "discord.js";

/**
 * Definitions for the bot's slash commands.
 */
export const commands = [
  new SlashCommandBuilder()
    .setName("reset")
    .setDescription("Resets the agent's memory and conversation history")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("status")
    .setDescription("Shows the current status of the agent")
    .toJSON(),
];
