import { discordBot } from "./discord/Bot.js";
import { clearAllAgents } from "./discord/handlers.js";
import { sessionManager } from "./agent/Session.js";
import { logger } from "./logger.js";
import { config } from "./config.js";

/**
 * Main entry point for the Discord Coder Bot.
 * Initializes and starts all services.
 */
async function main(): Promise<void> {
  logger.info("Starting Discord Coder Bot...", {
    workspaceRoot: config.WORKSPACE_ROOT,
    nodeVersion: process.version,
  });

  // Set up graceful shutdown handlers
  setupShutdownHandlers();

  // Set up periodic session cleanup
  setupSessionCleanup();

  try {
    // Start the Discord bot
    await discordBot.start();

    logger.info("Discord Coder Bot is running!");
    logger.info("Waiting for messages...");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to start bot", { error: message });
    process.exit(1);
  }
}

/**
 * Sets up handlers for graceful shutdown.
 */
function setupShutdownHandlers(): void {
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}, shutting down gracefully...`);

    try {
      // Clear all agents
      await clearAllAgents();

      // Stop the Discord bot
      await discordBot.stop();

      logger.info("Shutdown complete");
      process.exit(0);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("Error during shutdown", { error: message });
      process.exit(1);
    }
  };

  // Handle termination signals
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // Handle uncaught exceptions
  process.on("uncaughtException", (error) => {
    logger.error("Uncaught exception", {
      error: error.message,
      stack: error.stack,
    });
    shutdown("uncaughtException");
  });

  // Handle unhandled promise rejections
  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled promise rejection", {
      reason: reason instanceof Error ? reason.message : String(reason),
    });
  });
}

/**
 * Sets up periodic cleanup of expired sessions.
 */
function setupSessionCleanup(): void {
  // Run cleanup every 15 minutes
  const CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

  setInterval(() => {
    const cleaned = sessionManager.cleanupExpiredSessions();
    if (cleaned > 0) {
      logger.debug("Session cleanup completed", { cleaned });
    }
  }, CLEANUP_INTERVAL_MS);
}

// Start the application
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
