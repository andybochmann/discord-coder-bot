import { z } from "zod";
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

/**
 * Schema for validating environment variables.
 * Ensures all required configuration is present and properly typed.
 */
const envSchema = z.object({
  /** Discord bot token for authentication */
  DISCORD_TOKEN: z.string().min(1, "DISCORD_TOKEN is required"),

  /** Google AI Studio API key for Gemini */
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required"),

  /** Root directory where the bot is allowed to work/create projects */
  WORKSPACE_ROOT: z.string().min(1, "WORKSPACE_ROOT is required"),

  /** Log level for winston logger */
  LOG_LEVEL: z
    .enum(["error", "warn", "info", "http", "verbose", "debug", "silly"])
    .default("info"),
});

/**
 * Validated environment configuration type.
 */
export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Parses and validates environment variables.
 *
 * @returns Validated environment configuration
 * @throws {Error} If required environment variables are missing or invalid
 *
 * @example
 * const config = loadConfig();
 * console.log(config.WORKSPACE_ROOT); // '/app/workspace'
 */
function loadConfig(): EnvConfig {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errorMessages = result.error.errors
      .map((err) => `  - ${err.path.join(".")}: ${err.message}`)
      .join("\n");

    throw new Error(
      `Environment validation failed:\n${errorMessages}\n\nPlease check your .env file.`
    );
  }

  return result.data;
}

/**
 * Application configuration loaded from environment variables.
 * This is the single source of truth for all configuration values.
 */
export const config: EnvConfig = loadConfig();

/**
 * System prompt for the Gemini agent.
 * Defines the agent's behavior and capabilities.
 */
export const SYSTEM_PROMPT = `You are a Senior Agentic Developer. You have access to the file system and terminal. You do not ask for permission; you execute commands to build the requested software. If a compilation fails, you read the error and fix it. You always write clean, documented TypeScript.

Your capabilities:
- Read, write, and manage files in the workspace
- Execute terminal commands (npm, git, etc.)
- Navigate and understand project structures
- Debug and fix code issues autonomously

Always:
- Write clean, well-documented code
- Follow TypeScript best practices with strict typing
- Handle errors gracefully and attempt to fix them
- Provide clear explanations of your actions`;
