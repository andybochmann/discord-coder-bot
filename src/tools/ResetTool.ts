import { Type } from "@google/genai";
import type { AgentTool, ToolResult } from "../interfaces/Tool.js";
import { successResult } from "../interfaces/Tool.js";

/**
 * Creates a tool that allows the agent to reset its own memory.
 *
 * @param onReset - Callback function to execute when the tool is called
 * @returns The reset_memory tool
 */
export function createResetTool(
  onReset: () => void
): AgentTool<Record<string, never>> {
  return {
    name: "reset_memory",
    description:
      "Resets the agent's memory and conversation history. Use this when asked to start over, forget previous context, or reset.",
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
    execute: async (): Promise<ToolResult> => {
      onReset();
      return successResult({
        message: "Memory cleared successfully. Starting fresh.",
      });
    },
  };
}
