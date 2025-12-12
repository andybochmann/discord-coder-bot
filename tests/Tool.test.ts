import { describe, it, expect, vi } from "vitest";
import {
  successResult,
  errorResult,
  isToolResult,
  toFunctionDeclaration,
} from "../src/interfaces/Tool.js";
import type { AgentTool } from "../src/interfaces/Tool.js";
import { Type } from "@google/genai";

describe("Tool Interface", () => {
  describe("successResult", () => {
    it("should create a successful result with data", () => {
      const data = { message: "Hello" };
      const result = successResult(data);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(data);
      expect(result.error).toBeUndefined();
    });

    it("should handle null data", () => {
      const result = successResult(null);

      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });
  });

  describe("errorResult", () => {
    it("should create an error result with message", () => {
      const result = errorResult("Something went wrong");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Something went wrong");
      expect(result.data).toBeNull();
    });

    it("should include optional data in error result", () => {
      const data = { context: "additional info" };
      const result = errorResult("Error occurred", data);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Error occurred");
      expect(result.data).toEqual(data);
    });
  });

  describe("isToolResult", () => {
    it("should return true for valid tool result", () => {
      expect(isToolResult({ success: true, data: "test" })).toBe(true);
      expect(isToolResult({ success: false, data: null, error: "err" })).toBe(
        true
      );
    });

    it("should return false for invalid values", () => {
      expect(isToolResult(null)).toBe(false);
      expect(isToolResult(undefined)).toBe(false);
      expect(isToolResult("string")).toBe(false);
      expect(isToolResult({ data: "test" })).toBe(false);
      expect(isToolResult({ success: "true", data: "test" })).toBe(false);
    });
  });

  describe("toFunctionDeclaration", () => {
    it("should convert AgentTool to FunctionDeclaration", () => {
      const tool: AgentTool = {
        name: "test_tool",
        description: "A test tool",
        parameters: {
          type: Type.OBJECT,
          properties: {
            input: { type: Type.STRING, description: "Input value" },
          },
          required: ["input"],
        },
        execute: vi.fn(),
      };

      const declaration = toFunctionDeclaration(tool);

      expect(declaration.name).toBe("test_tool");
      expect(declaration.description).toBe("A test tool");
      expect(declaration.parameters).toEqual(tool.parameters);
    });
  });
});
