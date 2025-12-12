import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { ChildProcess } from "node:child_process";
import type { AgentTool, ToolResult } from "../interfaces/Tool.js";
import { successResult, errorResult } from "../interfaces/Tool.js";
import { logger } from "../logger.js";
import { config } from "../config.js";

/**
 * Manages the connection to the MCP filesystem server.
 * Spawns the server as a subprocess and communicates via stdio transport.
 *
 * @example
 * const mcpManager = new McpManager();
 * await mcpManager.connect();
 * const tools = mcpManager.getTools();
 * await mcpManager.disconnect();
 */
export class McpManager {
  private _client: Client | null = null;
  private _transport: StdioClientTransport | null = null;
  private _process: ChildProcess | null = null;
  private _tools = new Map<string, AgentTool>();
  private _isConnected = false;

  /**
   * Gets whether the MCP client is currently connected.
   */
  public get isConnected(): boolean {
    return this._isConnected;
  }

  /**
   * Connects to the MCP filesystem server.
   * Spawns the server subprocess and initializes the client connection.
   *
   * @throws {Error} If connection fails or server cannot be spawned
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

    try {
      logger.info("Starting MCP filesystem server...", {
        workspaceRoot: config.WORKSPACE_ROOT,
      });

      // Create the stdio transport that spawns the MCP server
      this._transport = new StdioClientTransport({
        command: "npx",
        args: [
          "-y",
          "@modelcontextprotocol/server-filesystem",
          config.WORKSPACE_ROOT,
        ],
      });

      // Create the MCP client
      this._client = new Client(
        {
          name: "discord-coder-bot",
          version: "1.0.0",
        },
        {
          capabilities: {},
        }
      );

      // Connect to the server
      await this._client.connect(this._transport);
      this._isConnected = true;

      logger.info("MCP filesystem server connected successfully");

      // Discover available tools from the server
      await this._discoverTools();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error occurred";
      logger.error("Failed to connect to MCP server", { error: message });
      await this.disconnect();
      throw new Error(`Failed to connect to MCP server: ${message}`);
    }
  }

  /**
   * Disconnects from the MCP filesystem server.
   * Cleans up the client, transport, and subprocess.
   *
   * @example
   * await manager.disconnect();
   */
  public async disconnect(): Promise<void> {
    logger.info("Disconnecting from MCP server...");

    if (this._client) {
      try {
        await this._client.close();
      } catch (error) {
        logger.warn("Error closing MCP client", {
          error: error instanceof Error ? error.message : "Unknown",
        });
      }
      this._client = null;
    }

    if (this._transport) {
      try {
        await this._transport.close();
      } catch (error) {
        logger.warn("Error closing MCP transport", {
          error: error instanceof Error ? error.message : "Unknown",
        });
      }
      this._transport = null;
    }

    if (this._process) {
      this._process.kill();
      this._process = null;
    }

    this._tools.clear();
    this._isConnected = false;

    logger.info("MCP server disconnected");
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
    if (!this._isConnected || !this._client) {
      return errorResult("MCP server is not connected");
    }

    const tool = this._tools.get(toolName);
    if (!tool) {
      return errorResult(`Tool not found: ${toolName}`);
    }

    try {
      logger.debug("Executing MCP tool", { toolName, args });

      const result = await this._client.callTool({
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
   * Discovers available tools from the MCP server and creates AgentTool wrappers.
   */
  private async _discoverTools(): Promise<void> {
    if (!this._client) {
      throw new Error("Client not initialized");
    }

    try {
      const toolsResult = await this._client.listTools();

      logger.info("Discovered MCP tools", {
        count: toolsResult.tools.length,
        tools: toolsResult.tools.map((t) => t.name),
      });

      for (const mcpTool of toolsResult.tools) {
        const agentTool: AgentTool = {
          name: mcpTool.name,
          description: mcpTool.description ?? `MCP tool: ${mcpTool.name}`,
          parameters: mcpTool.inputSchema as unknown as AgentTool["parameters"],
          execute: async (args: Record<string, unknown>) => {
            return this.executeTool(mcpTool.name, args);
          },
        };

        this._tools.set(mcpTool.name, agentTool);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error occurred";
      logger.error("Failed to discover MCP tools", { error: message });
      throw new Error(`Failed to discover MCP tools: ${message}`);
    }
  }
}

/**
 * Singleton instance of the MCP Manager for application-wide use.
 */
export const mcpManager = new McpManager();
