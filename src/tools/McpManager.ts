import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { ChildProcess } from "node:child_process";
import type { AgentTool, ToolResult } from "../interfaces/Tool.js";
import { successResult, errorResult } from "../interfaces/Tool.js";
import { logger } from "../logger.js";
import { config } from "../config.js";

/**
 * Configuration for an MCP server connection.
 */
interface McpServerConfig {
  /** Unique identifier for this server */
  name: string;
  /** Command to spawn the server */
  command: string;
  /** Arguments for the command */
  args: string[];
  /** Whether this server is enabled */
  enabled: boolean;
  /** Environment variables to pass to the server */
  env?: Record<string, string>;
}

/**
 * Tracks a connected MCP server instance.
 */
interface McpServerConnection {
  config: McpServerConfig;
  client: Client;
  transport: StdioClientTransport;
  process: ChildProcess | null;
}

/**
 * Manages connections to multiple MCP servers.
 * Spawns servers as subprocesses and communicates via stdio transport.
 *
 * @example
 * const mcpManager = new McpManager();
 * await mcpManager.connect();
 * const tools = mcpManager.getTools();
 * await mcpManager.disconnect();
 */
export class McpManager {
  private _connections = new Map<string, McpServerConnection>();
  private _tools = new Map<string, AgentTool>();
  private _toolToServer = new Map<string, string>();
  private _isConnected = false;

  /**
   * Gets whether the MCP client is currently connected.
   */
  public get isConnected(): boolean {
    return this._isConnected;
  }

  /**
   * Gets the list of MCP server configurations to connect to.
   *
   * @returns Array of server configurations
   */
  private _getServerConfigs(): McpServerConfig[] {
    return [
      {
        name: "filesystem",
        command: "npx",
        args: [
          "-y",
          "@modelcontextprotocol/server-filesystem",
          config.WORKSPACE_ROOT,
        ],
        enabled: true,
      },
      {
        name: "fetch",
        command: "uvx",
        args: ["mcp-server-fetch"],
        enabled: config.ENABLE_WEB_FETCH,
      },
      {
        name: "context7",
        command: "npx",
        args: ["-y", "@upstash/context7-mcp@latest"],
        enabled: config.ENABLE_CONTEXT7,
        env: config.CONTEXT7_API_KEY
          ? { CONTEXT7_API_KEY: config.CONTEXT7_API_KEY }
          : undefined,
      },
    ];
  }

  /**
   * Connects to all configured MCP servers.
   * Spawns server subprocesses and initializes client connections.
   *
   * @throws {Error} If connection to required servers fails
   *
   * @example
   * const manager = new McpManager();
   * await manager.connect();
   */
  public async connect(): Promise<void> {
    if (this._isConnected) {
      logger.warn("MCP Manager is already connected");
      return;
    }

    const serverConfigs = this._getServerConfigs();
    const enabledServers = serverConfigs.filter((s) => s.enabled);

    logger.info("Starting MCP servers...", {
      servers: enabledServers.map((s) => s.name),
      workspaceRoot: config.WORKSPACE_ROOT,
    });

    const connectionPromises = enabledServers.map((serverConfig) =>
      this._connectToServer(serverConfig)
    );

    const results = await Promise.allSettled(connectionPromises);

    // Check results and log any failures
    let successCount = 0;
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const serverConfig = enabledServers[i];

      if (!result || !serverConfig) continue;

      if (result.status === "fulfilled") {
        successCount++;
      } else {
        logger.error(`Failed to connect to MCP server: ${serverConfig.name}`, {
          error: result.reason,
        });
      }
    }

    if (successCount === 0) {
      throw new Error("Failed to connect to any MCP servers");
    }

    this._isConnected = true;
    logger.info("MCP servers connected", {
      connected: successCount,
      total: enabledServers.length,
    });
  }

  /**
   * Connects to a single MCP server.
   *
   * @param serverConfig - Configuration for the server to connect to
   */
  private async _connectToServer(serverConfig: McpServerConfig): Promise<void> {
    try {
      logger.info(`Starting MCP server: ${serverConfig.name}...`);

      // Build environment variables for the server
      // Filter out undefined values from process.env and merge with server-specific env
      const baseEnv: Record<string, string> = {};
      for (const [key, value] of Object.entries(process.env)) {
        if (value !== undefined) {
          baseEnv[key] = value;
        }
      }
      const serverEnv = serverConfig.env
        ? { ...baseEnv, ...serverConfig.env }
        : undefined;

      // Create the stdio transport that spawns the MCP server
      const transport = new StdioClientTransport({
        command: serverConfig.command,
        args: serverConfig.args,
        env: serverEnv,
      });

      // Create the MCP client
      const client = new Client(
        {
          name: `discord-coder-bot-${serverConfig.name}`,
          version: "1.0.0",
        },
        {
          capabilities: {},
        }
      );

      // Connect to the server
      await client.connect(transport);

      // Store the connection
      this._connections.set(serverConfig.name, {
        config: serverConfig,
        client,
        transport,
        process: null,
      });

      logger.info(`MCP server connected: ${serverConfig.name}`);

      // Discover available tools from this server
      await this._discoverToolsFromServer(serverConfig.name, client);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error occurred";
      logger.error(`Failed to connect to MCP server: ${serverConfig.name}`, {
        error: message,
      });
      throw new Error(
        `Failed to connect to MCP server ${serverConfig.name}: ${message}`
      );
    }
  }

  /**
   * Disconnects from all MCP servers.
   * Cleans up clients, transports, and subprocesses.
   *
   * @example
   * await manager.disconnect();
   */
  public async disconnect(): Promise<void> {
    logger.info("Disconnecting from MCP servers...");

    const disconnectPromises = Array.from(this._connections.entries()).map(
      async ([name, connection]) => {
        try {
          await connection.client.close();
        } catch (error) {
          logger.warn(`Error closing MCP client: ${name}`, {
            error: error instanceof Error ? error.message : "Unknown",
          });
        }

        try {
          await connection.transport.close();
        } catch (error) {
          logger.warn(`Error closing MCP transport: ${name}`, {
            error: error instanceof Error ? error.message : "Unknown",
          });
        }

        if (connection.process) {
          connection.process.kill();
        }
      }
    );

    await Promise.allSettled(disconnectPromises);

    this._connections.clear();
    this._tools.clear();
    this._toolToServer.clear();
    this._isConnected = false;

    logger.info("MCP servers disconnected");
  }

  /**
   * Gets all available tools from the MCP server as AgentTool objects.
   *
   * @returns Array of AgentTool objects that can be used by the agent
   *
   * @example
   * const tools = manager.getTools();
   * console.log(tools.map(t => t.name)); // ['read_file', 'write_file', ...]
   */
  public getTools(): AgentTool[] {
    return Array.from(this._tools.values());
  }

  /**
   * Executes a tool by name with the provided arguments.
   *
   * @param toolName - The name of the tool to execute
   * @param args - The arguments to pass to the tool
   * @returns The result of the tool execution
   *
   * @example
   * const result = await manager.executeTool('read_file', { path: '/workspace/file.txt' });
   */
  public async executeTool(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<ToolResult> {
    if (!this._isConnected) {
      return errorResult("MCP servers are not connected");
    }

    const tool = this._tools.get(toolName);
    if (!tool) {
      return errorResult(`Tool not found: ${toolName}`);
    }

    // Find which server has this tool
    const serverName = this._toolToServer.get(toolName);
    if (!serverName) {
      return errorResult(`No server found for tool: ${toolName}`);
    }

    const connection = this._connections.get(serverName);
    if (!connection) {
      return errorResult(`Server not connected: ${serverName}`);
    }

    try {
      logger.debug("Executing MCP tool", { toolName, serverName, args });

      const result = await connection.client.callTool({
        name: toolName,
        arguments: args,
      });

      logger.debug("MCP tool execution completed", { toolName, result });

      // Handle the MCP result format
      if (result.isError) {
        return errorResult(
          typeof result.content === "string"
            ? result.content
            : JSON.stringify(result.content)
        );
      }

      return successResult(result.content);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error occurred";
      logger.error("MCP tool execution failed", {
        toolName,
        error: message,
      });
      return errorResult(message);
    }
  }

  /**
   * Discovers available tools from a specific MCP server and creates AgentTool wrappers.
   *
   * @param serverName - The name of the server to discover tools from
   * @param client - The MCP client for this server
   */
  private async _discoverToolsFromServer(
    serverName: string,
    client: Client
  ): Promise<void> {
    try {
      const toolsResult = await client.listTools();

      logger.info(`Discovered tools from MCP server: ${serverName}`, {
        count: toolsResult.tools.length,
        tools: toolsResult.tools.map((t) => t.name),
      });

      for (const mcpTool of toolsResult.tools) {
        // Sanitize the input schema for Gemini compatibility
        const sanitizedSchema = this._sanitizeSchemaForGemini(
          mcpTool.inputSchema as Record<string, unknown>
        );

        const agentTool: AgentTool = {
          name: mcpTool.name,
          description: mcpTool.description ?? `MCP tool: ${mcpTool.name}`,
          parameters: sanitizedSchema as unknown as AgentTool["parameters"],
          execute: async (args: Record<string, unknown>) => {
            return this.executeTool(mcpTool.name, args);
          },
        };

        this._tools.set(mcpTool.name, agentTool);
        this._toolToServer.set(mcpTool.name, serverName);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error occurred";
      logger.error(`Failed to discover tools from MCP server: ${serverName}`, {
        error: message,
      });
      throw new Error(
        `Failed to discover tools from ${serverName}: ${message}`
      );
    }
  }

  /**
   * Sanitizes a JSON Schema for Gemini API compatibility.
   * Removes unsupported properties like exclusiveMinimum, exclusiveMaximum, etc.
   *
   * @param schema - The original JSON Schema from MCP
   * @returns A sanitized schema compatible with Gemini
   */
  private _sanitizeSchemaForGemini(
    schema: Record<string, unknown>
  ): Record<string, unknown> {
    // Properties not supported by Gemini's function calling
    const unsupportedProperties = [
      "exclusiveMinimum",
      "exclusiveMaximum",
      "$schema",
      "additionalProperties",
      "patternProperties",
      "allOf",
      "anyOf",
      "oneOf",
      "not",
      "if",
      "then",
      "else",
      "dependentSchemas",
      "dependentRequired",
      "unevaluatedProperties",
      "unevaluatedItems",
      "contentEncoding",
      "contentMediaType",
      "contentSchema",
      "default",
      "deprecated",
      "readOnly",
      "writeOnly",
      "examples",
      "$id",
      "$ref",
      "$defs",
      "definitions",
      "$comment",
      "$anchor",
      "$dynamicRef",
      "$dynamicAnchor",
    ];

    const sanitize = (obj: unknown): unknown => {
      if (obj === null || typeof obj !== "object") {
        return obj;
      }

      if (Array.isArray(obj)) {
        return obj.map(sanitize);
      }

      const sanitized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        // Skip unsupported properties
        if (unsupportedProperties.includes(key)) {
          continue;
        }
        // Recursively sanitize nested objects
        sanitized[key] = sanitize(value);
      }
      return sanitized;
    };

    return sanitize(schema) as Record<string, unknown>;
  }
}

/**
 * Singleton instance of the MCP Manager for application-wide use.
 */
export const mcpManager = new McpManager();
