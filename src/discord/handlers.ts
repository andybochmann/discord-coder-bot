import type {
  Message,
  Interaction,
  ChatInputCommandInteraction,
} from "discord.js";
import type { Logger } from "winston";
import { GeminiAgent } from "../agent/GeminiAgent.js";
import { sessionManager } from "../agent/Session.js";

import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { getGitLog } from "../tools/GitTool.js";

/** Map of user ID to their active agent instance */
const userAgents = new Map<string, GeminiAgent>();

/** Maximum message length for Discord */
const MAX_MESSAGE_LENGTH = 2000;

/**
 * Handles incoming Discord messages and routes them to the agent.
 *
 * @param message - The Discord message
 * @param logger - The logger instance
 *
 * @example
 * client.on('messageCreate', (message) => setupMessageHandler(message, logger));
 */
export async function setupMessageHandler(
  message: Message,
  logger: Logger
): Promise<void> {
  // Ignore bot messages
  if (message.author.bot) {
    return;
  }

  // Check if the bot is mentioned or it's a DM
  const isMentioned = message.mentions.has(message.client.user?.id ?? "");
  const isDM = !message.guild;

  // Only respond to mentions or DMs
  if (!isMentioned && !isDM) {
    return;
  }

  const userId = message.author.id;
  const content = cleanMessageContent(message);

  if (!content.trim()) {
    await message.reply(
      "Hello! I'm your coding assistant. Tell me what you'd like me to build or help you with."
    );
    return;
  }

  logger.info("Processing message", {
    userId,
    contentLength: content.length,
    isDM,
  });

  // Show typing indicator (only if channel supports it)
  if ("sendTyping" in message.channel) {
    await message.channel.sendTyping();
  }

  // Keep typing indicator active during processing
  const typingInterval = setInterval(() => {
    if ("sendTyping" in message.channel) {
      message.channel.sendTyping().catch(() => {
        // Ignore typing errors
      });
    }
  }, 5000);

  try {
    // Get or create user session
    const session = sessionManager.getOrCreateSession(userId);

    // Get or create agent for user
    let agent = userAgents.get(userId);

    if (!agent || !agent.isInitialized) {
      logger.info("Creating new agent for user", { userId });

      agent = new GeminiAgent({
        workingDirectory: session.workingDirectory,
      });

      await agent.initialize();
      userAgents.set(userId, agent);
    }

    // Update agent's working directory if session changed
    agent.setWorkingDirectory(session.workingDirectory);

    // Execute the agent
    const result = await agent.execute(content);

    // Clear typing indicator
    clearInterval(typingInterval);

    // Send response
    if (result.success) {
      await sendLongMessage(message, result.response);

      logger.info("Agent response sent", {
        userId,
        toolCallCount: result.toolCallCount,
        toolsUsed: result.toolsUsed,
      });
    } else {
      await message.reply(
        `I encountered an issue: ${result.error ?? "Unknown error"}\n\n${
          result.response
        }`
      );

      logger.warn("Agent execution failed", {
        userId,
        error: result.error,
      });
    }
  } catch (error) {
    clearInterval(typingInterval);

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to process message", { userId, error: errorMessage });

    await message.reply(
      `I'm sorry, I encountered an error: ${errorMessage}. Please try again.`
    );
  }
}

/**
 * Cleans the message content by removing bot mentions.
 *
 * @param message - The Discord message
 * @returns The cleaned message content
 */
function cleanMessageContent(message: Message): string {
  let content = message.content;

  // Remove bot mention
  if (message.client.user) {
    const mentionRegex = new RegExp(`<@!?${message.client.user.id}>`, "g");
    content = content.replace(mentionRegex, "").trim();
  }

  return content;
}

/**
 * Sends a long message by splitting it into chunks if necessary.
 *
 * @param message - The original message to reply to
 * @param content - The content to send
 */
async function sendLongMessage(
  message: Message,
  content: string
): Promise<void> {
  if (content.length <= MAX_MESSAGE_LENGTH) {
    await message.reply(content);
    return;
  }

  // Split content into chunks
  const chunks = splitMessage(content, MAX_MESSAGE_LENGTH);

  // Send first chunk as reply
  await message.reply(chunks[0] ?? "");

  // Send remaining chunks as follow-up messages
  for (let i = 1; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (chunk && "send" in message.channel) {
      await message.channel.send(chunk);
    }
  }
}

/**
 * Splits a message into chunks that fit within Discord's message limit.
 *
 * @param content - The content to split
 * @param maxLength - Maximum length per chunk
 * @returns Array of message chunks
 */
function splitMessage(content: string, maxLength: number): string[] {
  const chunks: string[] = [];
  let remaining = content;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Try to split at a newline
    let splitIndex = remaining.lastIndexOf("\n", maxLength);

    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      // Try to split at a space
      splitIndex = remaining.lastIndexOf(" ", maxLength);
    }

    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      // Force split at maxLength
      splitIndex = maxLength;
    }

    chunks.push(remaining.substring(0, splitIndex));
    remaining = remaining.substring(splitIndex).trim();
  }

  return chunks;
}

/**
 * Clears the agent for a specific user.
 *
 * @param userId - The user ID
 */
export async function clearUserAgent(userId: string): Promise<void> {
  const agent = userAgents.get(userId);

  if (agent) {
    await agent.shutdown();
    userAgents.delete(userId);
  }
}

/**
 * Clears all user agents.
 */
export async function clearAllAgents(): Promise<void> {
  for (const [userId, agent] of userAgents) {
    await agent.shutdown();
    userAgents.delete(userId);
  }
}

/**
 * Handles slash command interactions.
 *
 * @param interaction - The interaction event
 * @param logger - The logger instance
 */
export async function handleInteraction(
  interaction: Interaction,
  logger: Logger
): Promise<void> {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;
  const userId = interaction.user.id;

  logger.info("Processing slash command", { commandName, userId });

  try {
    if (commandName === "reset") {
      await handleResetCommand(interaction, logger);
    } else if (commandName === "status") {
      await handleStatusCommand(interaction, logger);
    } else if (commandName === "logs") {
      await handleLogsCommand(interaction, logger);
    } else if (commandName === "tree") {
      await handleTreeCommand(interaction, logger);
    } else if (commandName === "summarize") {
      await handleSummarizeCommand(interaction, logger);
    } else if (commandName === "list-projects") {
      await handleListProjectsCommand(interaction, logger);
    } else if (commandName === "new-project") {
      await handleNewProjectCommand(interaction, logger);
    } else if (commandName === "delete-project") {
      await handleDeleteProjectCommand(interaction, logger);
    } else if (commandName === "switch-project") {
      await handleSwitchProjectCommand(interaction, logger);
    } else if (commandName === "git-log") {
      await handleGitLogCommand(interaction, logger);
    } else if (commandName === "planning") {
      await handlePlanningCommand(interaction, logger);
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to handle command", {
      commandName,
      error: errorMessage,
    });

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: `Error: ${errorMessage}`,
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: `Error: ${errorMessage}`,
        ephemeral: true,
      });
    }
  }
}

async function handleResetCommand(
  interaction: ChatInputCommandInteraction,
  _logger: Logger
) {
  const userId = interaction.user.id;
  const agent = userAgents.get(userId);

  if (agent) {
    agent.clearHistory();
    await interaction.reply({
      content: "✅ Conversation history cleared.",
      ephemeral: true,
    });
  } else {
    // Even if no agent exists, we can confirm the "reset" since the state is effectively empty
    await interaction.reply({
      content: "✅ No active session found, but you are ready to start fresh.",
      ephemeral: true,
    });
  }
}

async function handleStatusCommand(
  interaction: ChatInputCommandInteraction,
  _logger: Logger
) {
  const userId = interaction.user.id;
  const session = sessionManager.getSession(userId);
  const agent = userAgents.get(userId);

  if (!session) {
    await interaction.reply({ content: "No active session.", ephemeral: true });
    return;
  }

  const status = [
    `**User**: <@${userId}>`,
    `**Working Directory**: \`${session.workingDirectory}\``,
    `**Agent Initialized**: ${agent?.isInitialized ? "Yes" : "No"}`,
    `**Planning Mode**: ${
      agent?.isPlanningMode ? "🟢 Active (awaiting approval)" : "⚫ Inactive"
    }`,
    `**History Size**: ${agent?.conversationHistory.length ?? 0} messages`,
  ].join("\n");

  await interaction.reply({ content: status, ephemeral: true });
}

async function handleLogsCommand(
  interaction: ChatInputCommandInteraction,
  _logger: Logger
) {
  await interaction.reply({
    content: "Logs are currently only available in the server console.",
    ephemeral: true,
  });
}

async function handleTreeCommand(
  interaction: ChatInputCommandInteraction,
  _logger: Logger
) {
  const userId = interaction.user.id;
  const session = sessionManager.getSession(userId);

  if (!session) {
    await interaction.reply({ content: "No active session.", ephemeral: true });
    return;
  }

  try {
    const tree = await generateTree(session.workingDirectory);
    const message = `**File Structure** (\`${session.workingDirectory}\`):\n\`\`\`\n${tree}\n\`\`\``;
    await interaction.reply({ content: message, ephemeral: true });
  } catch (error) {
    await interaction.reply({
      content: `Failed to generate tree: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
      ephemeral: true,
    });
  }
}

async function generateTree(
  dir: string,
  prefix = "",
  depth = 0
): Promise<string> {
  if (depth > 3) return "";

  let output = "";
  try {
    const files = await fs.readdir(dir, { withFileTypes: true });
    files.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file) continue;
      if (file.name.startsWith(".") || file.name === "node_modules") continue;

      const isLast = i === files.length - 1;
      const marker = isLast ? "└── " : "├── ";
      output += `${prefix}${marker}${file.name}\n`;

      if (file.isDirectory()) {
        const newPrefix = prefix + (isLast ? "    " : "│   ");
        output += await generateTree(
          path.join(dir, file.name),
          newPrefix,
          depth + 1
        );
      }
    }
  } catch {
    return "";
  }
  return output;
}

async function handleSummarizeCommand(
  interaction: ChatInputCommandInteraction,
  _logger: Logger
) {
  const userId = interaction.user.id;
  const agent = userAgents.get(userId);

  if (!agent) {
    await interaction.reply({ content: "No active agent.", ephemeral: true });
    return;
  }

  await interaction.deferReply();

  const result = await agent.execute(
    "Please provide a concise summary of what we have accomplished in this session so far. Focus on created files and implemented features."
  );

  await interaction.editReply(result.response);
}

async function handleListProjectsCommand(
  interaction: ChatInputCommandInteraction,
  _logger: Logger
) {
  try {
    const workspaceRoot = config.WORKSPACE_ROOT;
    const entries = await fs.readdir(workspaceRoot, { withFileTypes: true });
    const projects = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => e.name);

    if (projects.length === 0) {
      await interaction.reply({
        content: "No projects found in workspace.",
        ephemeral: true,
      });
      return;
    }

    const list = projects.map((p) => `- \`${p}\``).join("\n");
    await interaction.reply({
      content: `**Projects in Workspace**:\n${list}`,
      ephemeral: true,
    });
  } catch (error) {
    await interaction.reply({
      content: `Failed to list projects: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
      ephemeral: true,
    });
  }
}

async function handleNewProjectCommand(
  interaction: ChatInputCommandInteraction,
  logger: Logger
) {
  const name = interaction.options.getString("name", true);
  const userId = interaction.user.id;

  try {
    const projectPath = sessionManager.createProjectPath(userId, name);
    await fs.mkdir(projectPath, { recursive: true });

    const agent = userAgents.get(userId);
    if (agent) {
      agent.setWorkingDirectory(projectPath);
      agent.clearHistory();
    }

    await interaction.reply({
      content: `✅ Created new project **${name}** and switched working directory to \`${projectPath}\`. Agent memory has been reset.`,
      ephemeral: true,
    });
  } catch (error) {
    logger.error("Failed to create project", { error });
    await interaction.reply({
      content: "Failed to create project. Please check the name and try again.",
      ephemeral: true,
    });
  }
}

async function handleDeleteProjectCommand(
  interaction: ChatInputCommandInteraction,
  logger: Logger
) {
  const name = interaction.options.getString("name", true);
  const workspaceRoot = config.WORKSPACE_ROOT;
  const projectPath = path.join(workspaceRoot, name);

  if (
    !projectPath.startsWith(path.resolve(workspaceRoot)) ||
    projectPath === path.resolve(workspaceRoot)
  ) {
    await interaction.reply({
      content: "Invalid project name.",
      ephemeral: true,
    });
    return;
  }

  try {
    await fs.rm(projectPath, { recursive: true, force: true });
    await interaction.reply({
      content: `🗑️ Deleted project **${name}**.`,
      ephemeral: true,
    });
  } catch (error) {
    logger.error("Failed to delete project", { error });
    await interaction.reply({
      content: `Failed to delete project: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
      ephemeral: true,
    });
  }
}

async function handleSwitchProjectCommand(
  interaction: ChatInputCommandInteraction,
  _logger: Logger
) {
  const name = interaction.options.getString("name", true);
  const userId = interaction.user.id;
  const workspaceRoot = config.WORKSPACE_ROOT;
  const projectPath = path.join(workspaceRoot, name);

  try {
    await fs.access(projectPath);

    sessionManager.setWorkingDirectory(userId, projectPath);
    sessionManager.setProjectName(userId, name);

    const agent = userAgents.get(userId);
    if (agent) {
      agent.setWorkingDirectory(projectPath);
      agent.clearHistory();
    }

    await interaction.reply({
      content: `📂 Switched to project **${name}**. Working directory is now \`${projectPath}\`. Agent memory has been reset.`,
      ephemeral: true,
    });
  } catch {
    await interaction.reply({
      content: `Project **${name}** does not exist. Use \`/list-projects\` to see available projects.`,
      ephemeral: true,
    });
  }
}

async function handleGitLogCommand(
  interaction: ChatInputCommandInteraction,
  _logger: Logger
) {
  const userId = interaction.user.id;
  const session = sessionManager.getSession(userId);

  if (!session) {
    await interaction.reply({ content: "No active session.", ephemeral: true });
    return;
  }

  const count = interaction.options.getInteger("count") ?? 10;

  await interaction.deferReply();

  try {
    const log = await getGitLog(session.workingDirectory, count);
    const message = `**Git History** (\`${session.workingDirectory}\`):\n\`\`\`\n${log}\n\`\`\``;

    // Truncate if too long for Discord
    if (message.length > 2000) {
      await interaction.editReply(message.substring(0, 1990) + "...```");
    } else {
      await interaction.editReply(message);
    }
  } catch (error) {
    await interaction.editReply(
      `Failed to get git log: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

async function handlePlanningCommand(
  interaction: ChatInputCommandInteraction,
  _logger: Logger
) {
  const userId = interaction.user.id;
  const agent = userAgents.get(userId);
  const explicitValue = interaction.options.getBoolean("enabled");

  if (!agent) {
    await interaction.reply({
      content:
        "No active agent. Planning mode will activate when you request a plan with phrases like 'plan this first' or 'create a plan'.",
      ephemeral: true,
    });
    return;
  }

  // Toggle or set to explicit value
  const newValue =
    explicitValue !== null ? explicitValue : !agent.isPlanningMode;
  agent.isPlanningMode = newValue;

  if (newValue) {
    await interaction.reply({
      content:
        "🟢 **Planning Mode Enabled**\nThe agent will create a detailed plan before executing any code. Approve the plan or provide feedback before execution begins.\n\nTo disable: `/planning enabled:False` or say 'proceed' after reviewing a plan.",
      ephemeral: true,
    });
  } else {
    await interaction.reply({
      content:
        "⚫ **Planning Mode Disabled**\nThe agent will execute tasks directly without creating a plan first.\n\nYou can still request a plan for specific tasks by saying 'plan this first' or 'create a plan'.",
      ephemeral: true,
    });
  }
}
