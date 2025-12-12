import type { Message } from "discord.js";
import type { Logger } from "winston";
import { GeminiAgent } from "../agent/GeminiAgent.js";
import { sessionManager } from "../agent/Session.js";

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
