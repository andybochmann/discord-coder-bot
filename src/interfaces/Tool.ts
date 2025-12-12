import type { FunctionDeclaration } from "@google/genai";

/**
 * Represents the result of a tool execution.
 */
export interface ToolResult {
  /** Whether the tool execution was successful */
  success: boolean;
  /** The output/result data from the tool */
  data: unknown;
  /** Error message if the execution failed */
  error?: string;
}

/**
 * Standard interface for tools that can be called by the Agent.
 * This provides a unified interface for both MCP tools and internal tools (like Shell).
 *
 * @template TParams - The type of parameters the tool accepts
 *
 * @example
 * const readFileTool: AgentTool<{ path: string }> = {
 *   name: 'read_file',
 *   description: 'Read the contents of a file',
 *   parameters: {
 *     type: 'object',
 *     properties: {
 *       path: { type: 'string', description: 'Path to the file' }
 *     },
 *     required: ['path']
 *   },
 *   execute: async (args) => {
 *     // Implementation
 *   }
 * };
 */
export interface AgentTool<TParams = Record<string, unknown>> {
  /** Unique name identifier for the tool */
  name: string;

  /** Human-readable description of what the tool does */
  description: string;

  /** JSON Schema definition of the tool's parameters (Gemini format) */
  parameters: FunctionDeclaration["parameters"];

  /**
   * Executes the tool with the provided arguments.
   *
   * @param args - The arguments to pass to the tool
   * @returns A promise resolving to the tool's result
   */
  execute: (args: TParams) => Promise<ToolResult>;
}

/**
 * Converts an AgentTool to a Gemini FunctionDeclaration.
 *
 * @param tool - The AgentTool to convert
 * @returns A FunctionDeclaration compatible with the Gemini SDK
 *
 * @example
 * const tools = [readFileTool, writeFileTool];
 * const declarations = tools.map(toFunctionDeclaration);
 */
export function toFunctionDeclaration(tool: AgentTool): FunctionDeclaration {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  };
}

/**
 * Type guard to check if a value is a valid ToolResult.
 *
 * @param value - The value to check
 * @returns True if the value is a valid ToolResult
 */
export function isToolResult(value: unknown): value is ToolResult {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return typeof obj["success"] === "boolean" && "data" in obj;
}

/**
 * Creates a successful tool result.
 *
 * @param data - The result data
 * @returns A successful ToolResult
 */
export function successResult(data: unknown): ToolResult {
  return {
    success: true,
    data,
  };
}

/**
 * Creates a failed tool result.
 *
 * @param error - The error message
 * @param data - Optional additional data about the failure
 * @returns A failed ToolResult
 */
export function errorResult(error: string, data?: unknown): ToolResult {
  return {
    success: false,
    data: data ?? null,
    error,
  };
}
