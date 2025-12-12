import type { AgentTool, ToolResult } from "../interfaces/Tool.js";
import { toFunctionDeclaration, errorResult } from "../interfaces/Tool.js";
import type { FunctionDeclaration } from "@google/genai";
import { McpManager, mcpManager } from "./McpManager.js";
import { createShellTool } from "./ShellTool.js";
import { logger } from "../logger.js";
import { config } from "../config.js";

/**
 * Central registry for all tools available to the agent.
 * Manages both MCP-based tools and internal tools (like Shell).
 *
 * @example
 * const registry = new ToolRegistry();
 * await registry.initialize();
 * const tools = registry.getAllTools();
 * const result = await registry.executeTool('read_file', { path: '/file.txt' });
 */
export class ToolRegistry {
  private _tools = new Map<string, AgentTool>();
  private _mcpManager: McpManager;
  private _isInitialized = false;

  /**
   * Creates a new ToolRegistry instance.
   *
   * @param customMcpManager - Optional custom MCP manager for testing
   */
  constructor(customMcpManager?: McpManager) {
    this._mcpManager = customMcpManager ?? mcpManager;
  }

  /**
   * Gets whether the registry has been initialized.
   */
  public get isInitialized(): boolean {
    return this._isInitialized;
  }

  /**
   * Initializes the tool registry by connecting to MCP and registering all tools.
   *
   * @param workingDirectory - The working directory for shell commands
   * @throws {Error} If initialization fails
   *
   * @example
   * await registry.initialize('/app/workspace/my-project');
   */
  public async initialize(
    workingDirectory: string = config.WORKSPACE_ROOT
  ): Promise<void> {
    if (this._isInitialized) {
      logger.warn("ToolRegistry already initialized");
      return;
    }

    logger.info("Initializing tool registry...", { workingDirectory });

    try {
      // Connect to MCP server
      await this._mcpManager.connect();

      // Register MCP tools
      const mcpTools = this._mcpManager.getTools();
      for (const tool of mcpTools) {
        this._registerTool(tool);
      }

      // Register internal tools
      this._registerInternalTools(workingDirectory);

      this._isInitialized = true;
      logger.info("Tool registry initialized", {
        toolCount: this._tools.size,
        tools: Array.from(this._tools.keys()),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("Failed to initialize tool registry", { error: message });
      throw new Error(`Failed to initialize tool registry: ${message}`);
    }
  }

  /**
   * Shuts down the tool registry and disconnects from MCP.
   *
   * @example
   * await registry.shutdown();
   */
  public async shutdown(): Promise<void> {
    logger.info("Shutting down tool registry...");

    await this._mcpManager.disconnect();
    this._tools.clear();
    this._isInitialized = false;

    logger.info("Tool registry shut down");
  }

  /**
   * Gets all registered tools.
   *
   * @returns Array of all registered AgentTool objects
   *
   * @example
   * const tools = registry.getAllTools();
   */
  public getAllTools(): AgentTool[] {
    return Array.from(this._tools.values());
  }

  /**
   * Gets all tools as Gemini FunctionDeclaration objects.
   *
   * @returns Array of FunctionDeclaration objects for Gemini
   *
   * @example
   * const declarations = registry.getFunctionDeclarations();
   * // Use with Gemini generateContent
   */
  public getFunctionDeclarations(): FunctionDeclaration[] {
    return this.getAllTools().map(toFunctionDeclaration);
  }

  /**
   * Gets a tool by name.
   *
   * @param name - The name of the tool to get
   * @returns The tool if found, undefined otherwise
   *
   * @example
   * const tool = registry.getTool('read_file');
   */
  public getTool(name: string): AgentTool | undefined {
    return this._tools.get(name);
  }

  /**
   * Checks if a tool exists in the registry.
   *
   * @param name - The name of the tool to check
   * @returns True if the tool exists
   */
  public hasTool(name: string): boolean {
    return this._tools.has(name);
  }

  /**
   * Executes a tool by name with the provided arguments.
   *
   * @param name - The name of the tool to execute
   * @param args - The arguments to pass to the tool
   * @returns The result of the tool execution
   *
   * @example
   * const result = await registry.executeTool('read_file', { path: '/file.txt' });
   */
  public async executeTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<ToolResult> {
    const tool = this._tools.get(name);

    if (!tool) {
      logger.warn("Attempted to execute unknown tool", { name });
      return errorResult(`Unknown tool: ${name}`);
    }

    logger.debug("Executing tool", { name, args });

    try {
      const result = await tool.execute(args);
      logger.debug("Tool execution completed", {
        name,
        success: result.success,
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("Tool execution threw an error", { name, error: message });
      return errorResult(`Tool execution failed: ${message}`);
    }
  }

  /**
   * Registers a tool in the registry.
   *
   * @param tool - The tool to register
   */
  private _registerTool(tool: AgentTool): void {
    if (this._tools.has(tool.name)) {
      logger.warn("Overwriting existing tool", { name: tool.name });
    }
    this._tools.set(tool.name, tool);
    logger.debug("Registered tool", { name: tool.name });
  }

  /**
   * Registers internal tools that are not from MCP.
   *
   * @param workingDirectory - The working directory for shell commands
   */
  private _registerInternalTools(workingDirectory: string): void {
    // Register the shell tool
    const shellTool = createShellTool(workingDirectory);
    this._registerTool(shellTool as unknown as AgentTool);
  }
}

/**
 * Creates and initializes a tool registry for the specified working directory.
 *
 * @param workingDirectory - The working directory for tools
 * @returns An initialized ToolRegistry instance
 *
 * @example
 * const registry = await createToolRegistry('/app/workspace/project');
 */
export async function createToolRegistry(
  workingDirectory: string = config.WORKSPACE_ROOT
): Promise<ToolRegistry> {
  const registry = new ToolRegistry();
  await registry.initialize(workingDirectory);
  return registry;
}
