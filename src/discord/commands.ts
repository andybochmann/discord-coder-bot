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
  new SlashCommandBuilder()
    .setName("logs")
    .setDescription("Shows the last few lines of logs")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("tree")
    .setDescription("Shows the file structure of the current directory")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("summarize")
    .setDescription("Summarizes the current session and work done")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("list-projects")
    .setDescription("Lists all projects in the workspace")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("new-project")
    .setDescription("Creates a new project and switches to it")
    .addStringOption((option) =>
      option
        .setName("name")
        .setDescription("The name of the new project")
        .setRequired(true)
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("delete-project")
    .setDescription("Deletes a project folder")
    .addStringOption((option) =>
      option
        .setName("name")
        .setDescription("The name of the project to delete")
        .setRequired(true)
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("switch-project")
    .setDescription("Switches the working directory to an existing project")
    .addStringOption((option) =>
      option
        .setName("name")
        .setDescription("The name of the project to switch to")
        .setRequired(true)
    )
    .toJSON(),
];
