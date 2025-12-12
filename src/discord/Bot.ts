import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  type Message,
  REST,
  Routes,
} from "discord.js";
import { config } from "../config.js";
import { createChildLogger } from "../logger.js";
import { setupMessageHandler, handleInteraction } from "./handlers.js";
import { commands } from "./commands.js";
import type { Logger } from "winston";

/**
 * The Discord bot instance that serves as the interface for the coding agent.
 *
 * @example
 * const bot = new DiscordBot();
 * await bot.start();
 * // Later...
 * await bot.stop();
 */
export class DiscordBot {
  private _client: Client;
  private _logger: Logger;
  private _isReady = false;

  /**
   * Creates a new DiscordBot instance.
   */
  constructor() {
    this._logger = createChildLogger({ component: "DiscordBot" });

    this._client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
      partials: [Partials.Channel, Partials.Message],
    });

    this._setupEventHandlers();
  }

  /**
   * Gets whether the bot is ready and connected.
   */
  public get isReady(): boolean {
    return this._isReady;
  }

  /**
   * Gets the underlying Discord.js client.
   */
  public get client(): Client {
    return this._client;
  }

  /**
   * Starts the Discord bot and connects to Discord.
   *
   * @throws {Error} If login fails
   *
   * @example
   * await bot.start();
   */
  public async start(): Promise<void> {
    this._logger.info("Starting Discord bot...");

    try {
      await this._client.login(config.DISCORD_TOKEN);
      this._logger.info("Discord bot login successful");

      await this._registerCommands();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      this._logger.error("Failed to start Discord bot", { error: message });
      throw new Error(`Failed to start Discord bot: ${message}`);
    }
  }

  /**
   * Registers slash commands with Discord.
   */
  private async _registerCommands(): Promise<void> {
    try {
      this._logger.info("Registering slash commands...", {
        clientId: config.DISCORD_CLIENT_ID,
        commandCount: commands.length,
      });

      const rest = new REST({ version: "10" }).setToken(config.DISCORD_TOKEN);

      const data = (await rest.put(
        Routes.applicationCommands(config.DISCORD_CLIENT_ID),
        {
          body: commands,
        }
      )) as unknown[];

      this._logger.info("Slash commands registered successfully", {
        registeredCount: data.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      this._logger.error("Failed to register slash commands", {
        error: message,
      });
    }
  }

  /**
   * Stops the Discord bot and disconnects from Discord.
   *
   * @example
   * await bot.stop();
   */
  public async stop(): Promise<void> {
    this._logger.info("Stopping Discord bot...");

    await this._client.destroy();
    this._isReady = false;

    this._logger.info("Discord bot stopped");
  }

  /**
   * Sets up event handlers for the Discord client.
   */
  private _setupEventHandlers(): void {
    // Ready event
    this._client.once(Events.ClientReady, (readyClient) => {
      this._isReady = true;
      this._logger.info("Discord bot is ready", {
        username: readyClient.user.tag,
        guilds: readyClient.guilds.cache.size,
      });
    });

    // Message create event - main handler for the agent
    this._client.on(Events.MessageCreate, async (message: Message) => {
      try {
        await setupMessageHandler(message, this._logger);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        this._logger.error("Error handling message", { error: errorMessage });

        // Try to notify the user
        try {
          await message.reply(
            "Sorry, I encountered an error processing your request. Please try again."
          );
        } catch {
          // Ignore reply errors
        }
      }
    });

    // Interaction Create event
    this._client.on(Events.InteractionCreate, (interaction) => {
      handleInteraction(interaction, this._logger);
    });

    // Error event
    this._client.on(Events.Error, (error) => {
      this._logger.error("Discord client error", { error: error.message });
    });

    // Warn event
    this._client.on(Events.Warn, (warning) => {
      this._logger.warn("Discord client warning", { warning });
    });

    // Debug event (only log at debug level)
    this._client.on(Events.Debug, (info) => {
      this._logger.debug("Discord client debug", { info });
    });
  }
}

/**
 * Singleton instance of the Discord bot.
 */
export const discordBot = new DiscordBot();
