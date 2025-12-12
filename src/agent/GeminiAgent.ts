import {
  GoogleGenAI,
  Content,
  Part,
  FunctionCall,
  GenerateContentResponse,
  FunctionDeclaration,
} from "@google/genai";
import { config, SYSTEM_PROMPT } from "../config.js";
import { createChildLogger } from "../logger.js";
import { ToolRegistry, createToolRegistry } from "../tools/ToolRegistry.js";
import {
  isPlanningRequest,
  isPlanApproval,
  PLANNING_INSTRUCTIONS,
} from "./PlanningUtils.js";
import type { Logger } from "winston";

/**
 * Configuration options for the GeminiAgent.
 */
export interface GeminiAgentConfig {
  /** Maximum number of tool call iterations (default: from config.MAX_ITERATIONS) */
  maxIterations?: number;
  /** The working directory for the agent's tools */
  workingDirectory?: string;
  /** Custom system prompt override */
  systemPrompt?: string;
  /** Model name to use (default: gemini-2.0-flash) */
  modelName?: string;
}

/**
 * Result of an agent execution.
 */
export interface AgentResult {
  /** Whether the execution was successful */
  success: boolean;
  /** The final response text from the agent */
  response: string;
  /** Number of tool calls made during execution */
  toolCallCount: number;
  /** List of tools that were called */
  toolsUsed: string[];
  /** Error message if execution failed */
  error?: string;
}

/**
 * The core Gemini Agent implementing the "Yolo Mode" agentic loop.
 * This class handles the Think -> Act -> Observe -> Repeat cycle.
 *
 * @example
 * const agent = new GeminiAgent({ workingDirectory: '/app/workspace/project' });
 * await agent.initialize();
 * const result = await agent.execute('Create a new TypeScript project');
 * await agent.shutdown();
 */
export class GeminiAgent {
  private _client: GoogleGenAI;
  private _toolRegistry: ToolRegistry | null = null;
  private _conversationHistory: Content[] = [];
  private _config: Required<GeminiAgentConfig>;
  private _logger: Logger;
  private _isInitialized = false;
  private _isPlanningMode = false;

  /**
   * Creates a new GeminiAgent instance.
   *
   * @param agentConfig - Configuration options for the agent
   *
   * @example
   * const agent = new GeminiAgent({
   *   workingDirectory: '/app/workspace/my-project',
   *   maxIterations: 30
   * });
   */
  constructor(agentConfig: GeminiAgentConfig = {}) {
    this._config = {
      maxIterations: agentConfig.maxIterations ?? config.MAX_ITERATIONS,
      workingDirectory: agentConfig.workingDirectory ?? config.WORKSPACE_ROOT,
      systemPrompt: agentConfig.systemPrompt ?? SYSTEM_PROMPT,
      modelName: agentConfig.modelName ?? config.GEMINI_MODEL,
    };

    this._client = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
    this._logger = createChildLogger({ component: "GeminiAgent" });
  }

  /**
   * Gets whether the agent has been initialized.
   */
  public get isInitialized(): boolean {
    return this._isInitialized;
  }

  /**
   * Gets whether the agent is in planning mode (awaiting approval).
   */
  public get isPlanningMode(): boolean {
    return this._isPlanningMode;
  }

  /**
   * Sets the planning mode state.
   * Used to manually exit planning mode after plan approval.
   */
  public set isPlanningMode(value: boolean) {
    this._isPlanningMode = value;
    this._logger.debug("Planning mode changed", { isPlanningMode: value });
  }

  /**
   * Gets the current conversation history.
   */
  public get conversationHistory(): Content[] {
    return [...this._conversationHistory];
  }

  /**
   * Initializes the agent by setting up the tool registry.
   *
   * @throws {Error} If initialization fails
   *
   * @example
   * await agent.initialize();
   */
  public async initialize(): Promise<void> {
    if (this._isInitialized) {
      this._logger.warn("Agent already initialized");
      return;
    }

    this._logger.info("Initializing Gemini Agent...", {
      workingDirectory: this._config.workingDirectory,
      model: this._config.modelName,
    });

    try {
      this._toolRegistry = await createToolRegistry(
        this._config.workingDirectory,
        () => this.clearHistory()
      );
      this._isInitialized = true;
      this._logger.info("Gemini Agent initialized successfully");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      this._logger.error("Failed to initialize agent", { error: message });
      throw new Error(`Failed to initialize Gemini Agent: ${message}`);
    }
  }

  /**
   * Shuts down the agent and cleans up resources.
   *
   * @example
   * await agent.shutdown();
   */
  public async shutdown(): Promise<void> {
    this._logger.info("Shutting down Gemini Agent...");

    if (this._toolRegistry) {
      await this._toolRegistry.shutdown();
      this._toolRegistry = null;
    }

    this._conversationHistory = [];
    this._isInitialized = false;

    this._logger.info("Gemini Agent shut down");
  }

  /**
   * Clears the conversation history.
   *
   * @example
   * agent.clearHistory();
   */
  public clearHistory(): void {
    this._conversationHistory = [];
    this._logger.debug("Conversation history cleared");
  }

  /**
   * Trims the conversation history to stay within token limits.
   * Uses a simple character count approximation (4 chars ~= 1 token).
   * Keeps the most recent messages.
   */
  private _trimHistory(): void {
    const MAX_TOKENS = 100000; // Conservative limit
    const CHARS_PER_TOKEN = 4;
    const MAX_CHARS = MAX_TOKENS * CHARS_PER_TOKEN;

    let currentChars = 0;
    const preservedHistory: Content[] = [];

    // Iterate backwards to keep most recent messages
    for (let i = this._conversationHistory.length - 1; i >= 0; i--) {
      const content = this._conversationHistory[i];
      if (!content) continue;

      // Estimate size based on JSON string length
      const contentSize = JSON.stringify(content).length;

      if (currentChars + contentSize > MAX_CHARS) {
        if (preservedHistory.length > 0) {
          this._logger.info("Trimming conversation history", {
            removedMessages: i + 1,
            newSize: preservedHistory.length,
          });
        }
        break;
      }

      currentChars += contentSize;
      preservedHistory.unshift(content);
    }

    // Ensure we don't start with a function response without a call
    // (Simple heuristic: if first message is 'function', remove it)
    while (
      preservedHistory.length > 0 &&
      preservedHistory[0]?.role === "function"
    ) {
      preservedHistory.shift();
    }

    this._conversationHistory = preservedHistory;
  }

  /**
   * Updates the working directory for the agent's tools.
   *
   * @param directory - The new working directory
   */
  public setWorkingDirectory(directory: string): void {
    this._config.workingDirectory = directory;
    this._logger.info("Updated working directory", { directory });
  }

  /**
   * Executes the agent with the given user prompt.
   * Implements the Yolo Mode loop: Think -> Act -> Observe -> Repeat.
   *
   * @param prompt - The user's prompt/request
   * @returns The result of the agent execution
   *
   * @example
   * const result = await agent.execute('Create a REST API with Express');
   * console.log(result.response);
   */
  public async execute(prompt: string): Promise<AgentResult> {
    if (!this._isInitialized || !this._toolRegistry) {
      return {
        success: false,
        response: "",
        toolCallCount: 0,
        toolsUsed: [],
        error: "Agent not initialized. Call initialize() first.",
      };
    }

    this._logger.info("Executing agent", { promptLength: prompt.length });

    // Check if user is requesting a planning phase
    const wantsPlan = isPlanningRequest(prompt);
    if (wantsPlan && !this._isPlanningMode) {
      this._isPlanningMode = true;
      this._logger.info("Planning mode activated", {
        prompt: prompt.substring(0, 100),
      });
    }

    // Check if user is approving a plan (only relevant if we're in planning mode)
    if (this._isPlanningMode && !wantsPlan && isPlanApproval(prompt)) {
      this._isPlanningMode = false;
      this._logger.info(
        "Plan approved, exiting planning mode to begin execution"
      );
    }

    // Inject working directory context if history is empty (new session or after reset)
    if (this._conversationHistory.length === 0) {
      this._conversationHistory.push({
        role: "user",
        parts: [
          {
            text: `[System Context: You are currently working in the project directory: ${this._config.workingDirectory}. All file operations and commands should be relative to this directory unless otherwise specified.]`,
          },
        ],
      });
      this._conversationHistory.push({
        role: "model",
        parts: [
          {
            text: `Understood. I'm now working in the project directory: ${this._config.workingDirectory}. I'll use this as my base for all file operations and commands. How can I help you with this project?`,
          },
        ],
      });
    }

    // Prepare the prompt with planning instructions if in planning mode
    let effectivePrompt = prompt;
    if (this._isPlanningMode && wantsPlan) {
      effectivePrompt = `${prompt}\n\n${PLANNING_INSTRUCTIONS}`;
      this._logger.debug("Injected planning instructions into prompt");
    }

    // Add user message to history
    this._conversationHistory.push({
      role: "user",
      parts: [{ text: effectivePrompt }],
    });

    const toolsUsed: string[] = [];
    let toolCallCount = 0;
    let iterations = 0;

    try {
      // Get function declarations for Gemini
      const functionDeclarations = this._toolRegistry.getFunctionDeclarations();

      // Main agentic loop
      while (iterations < this._config.maxIterations) {
        iterations++;
        this._logger.debug("Agent iteration", { iteration: iterations });

        // Ensure history is within limits before generating content
        this._trimHistory();

        // Generate content from Gemini
        const response = await this._generateContent(functionDeclarations);

        // Check if response contains function calls
        const functionCalls = this._extractFunctionCalls(response);

        // In planning mode, don't execute tools - just return the plan
        if (this._isPlanningMode && functionCalls.length > 0) {
          const textResponse = this._extractTextResponse(response);

          // If there's a text response with the plan, return it
          if (textResponse.trim()) {
            this._conversationHistory.push({
              role: "model",
              parts: [{ text: textResponse }],
            });

            this._logger.info(
              "Planning mode - returning plan without executing tools",
              {
                iterations,
                blockedToolCalls: functionCalls.length,
              }
            );

            return {
              success: true,
              response: textResponse,
              toolCallCount: 0,
              toolsUsed: [],
            };
          }

          // If the model only wants to call tools, ask it to provide a plan first
          this._conversationHistory.push({
            role: "model",
            parts: [
              {
                text: "Let me create a detailed plan for you first before starting implementation.",
              },
            ],
          });
          continue;
        }

        if (functionCalls.length === 0) {
          // No function calls - extract text response and return
          const textResponse = this._extractTextResponse(response);

          // Add assistant response to history
          this._conversationHistory.push({
            role: "model",
            parts: [{ text: textResponse }],
          });

          // If we're in planning mode and this is a plan response, stay in planning mode
          // The user needs to approve before we continue
          if (this._isPlanningMode) {
            this._logger.info("Plan delivered, awaiting user approval");
          }

          this._logger.info("Agent execution completed", {
            iterations,
            toolCallCount,
            responseLength: textResponse.length,
          });

          return {
            success: true,
            response: textResponse,
            toolCallCount,
            toolsUsed: [...new Set(toolsUsed)],
          };
        }

        // Execute function calls and collect results
        const functionResponses: Part[] = [];
        let historyWasCleared = false;

        for (const functionCall of functionCalls) {
          const toolName = functionCall.name ?? "unknown";
          toolCallCount++;
          toolsUsed.push(toolName);

          this._logger.debug("Executing tool", {
            tool: toolName,
            args: functionCall.args,
          });

          const result = await this._executeTool(
            toolName,
            functionCall.args as Record<string, unknown>
          );

          // Check if history was cleared during tool execution (e.g. reset_memory)
          if (this._conversationHistory.length === 0) {
            historyWasCleared = true;
          }

          functionResponses.push({
            functionResponse: {
              name: functionCall.name,
              response: result,
            },
          });
        }

        if (historyWasCleared) {
          this._logger.info("History cleared during execution, stopping loop");
          return {
            success: true,
            response: "Memory cleared successfully. Starting fresh.",
            toolCallCount,
            toolsUsed: [...new Set(toolsUsed)],
          };
        }

        // Add assistant's function call to history
        this._conversationHistory.push({
          role: "model",
          parts: functionCalls.map((fc) => ({ functionCall: fc })),
        });

        // Add function responses to history
        this._conversationHistory.push({
          role: "user",
          parts: functionResponses,
        });
      }

      // Max iterations reached
      this._logger.warn("Max iterations reached", {
        maxIterations: this._config.maxIterations,
      });

      return {
        success: false,
        response:
          "I've reached the maximum number of steps for this task. Here's what I've accomplished so far. Please provide additional guidance if needed.",
        toolCallCount,
        toolsUsed: [...new Set(toolsUsed)],
        error: "Maximum iterations reached",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      this._logger.error("Agent execution failed", { error: message });

      return {
        success: false,
        response: `I encountered an error while processing your request: ${message}`,
        toolCallCount,
        toolsUsed: [...new Set(toolsUsed)],
        error: message,
      };
    }
  }

  /**
   * Generates content from Gemini with the current conversation history.
   *
   * @param functionDeclarations - The function declarations for tools
   * @returns The Gemini response
   */
  private async _generateContent(
    functionDeclarations: FunctionDeclaration[]
  ): Promise<GenerateContentResponse> {
    const response = await this._client.models.generateContent({
      model: this._config.modelName,
      contents: this._conversationHistory,
      config: {
        systemInstruction: this._config.systemPrompt,
        tools: [{ functionDeclarations }],
      },
    });

    return response;
  }

  /**
   * Extracts function calls from a Gemini response.
   *
   * @param response - The Gemini response
   * @returns Array of function calls
   */
  private _extractFunctionCalls(
    response: GenerateContentResponse
  ): FunctionCall[] {
    const functionCalls: FunctionCall[] = [];

    if (!response.candidates || response.candidates.length === 0) {
      return functionCalls;
    }

    const candidate = response.candidates[0];
    if (!candidate?.content?.parts) {
      return functionCalls;
    }

    for (const part of candidate.content.parts) {
      if (part.functionCall) {
        functionCalls.push(part.functionCall);
      }
    }

    return functionCalls;
  }

  /**
   * Extracts text response from a Gemini response.
   *
   * @param response - The Gemini response
   * @returns The text response
   */
  private _extractTextResponse(response: GenerateContentResponse): string {
    if (!response.candidates || response.candidates.length === 0) {
      return "I was unable to generate a response.";
    }

    const candidate = response.candidates[0];
    if (!candidate?.content?.parts) {
      return "I was unable to generate a response.";
    }

    const textParts: string[] = [];

    for (const part of candidate.content.parts) {
      if (part.text) {
        textParts.push(part.text);
      }
    }

    return textParts.join("\n") || "Task completed.";
  }

  /**
   * Executes a tool and handles errors gracefully.
   *
   * @param toolName - The name of the tool to execute
   * @param args - The arguments for the tool
   * @returns The tool result (formatted for Gemini)
   */
  private async _executeTool(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    if (!this._toolRegistry) {
      return {
        success: false,
        error: "Tool registry not available",
      };
    }

    try {
      const result = await this._toolRegistry.executeTool(toolName, args);

      // Format result for Gemini function response
      return {
        success: result.success,
        data: result.data,
        ...(result.error ? { error: result.error } : {}),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      this._logger.error("Tool execution failed", {
        tool: toolName,
        error: message,
      });

      // Return error to the LLM so it can attempt to fix it
      return {
        success: false,
        error: `Tool "${toolName}" failed: ${message}`,
      };
    }
  }
}

/**
 * Creates and initializes a new GeminiAgent.
 *
 * @param agentConfig - Configuration options for the agent
 * @returns An initialized GeminiAgent instance
 *
 * @example
 * const agent = await createGeminiAgent({ workingDirectory: '/app/workspace' });
 * const result = await agent.execute('Build a Node.js server');
 */
export async function createGeminiAgent(
  agentConfig: GeminiAgentConfig = {}
): Promise<GeminiAgent> {
  const agent = new GeminiAgent(agentConfig);
  await agent.initialize();
  return agent;
}
