# **Project Specification: Agentic Discord Bot (Gemini \+ MCP)**

## **1\. Project Overview**

We are building a Discord bot that acts as an interface for an autonomous "Coding Agent".

* **Core Brain:** Google Gemini 2.0 Flash (via @google/genai SDK).  
* **Tooling Protocol:** Model Context Protocol (MCP) to connect to the filesystem.  
* **Runtime:** Node.js (v20+) inside an Ubuntu Docker container.  
* **Language:** TypeScript (Strict Mode).

## **2\. Architecture**

The system consists of three main layers:

1. **The Discord Interface (src/discord/)**:  
   * Listens for messages/commands.  
   * Manages user sessions.  
   * Forwards tasks to the Agent.  
2. **The Agent Core (src/agent/)**:  
   * Maintains the context window with Gemini.  
   * Converts natural language into Tool Calls.  
   * Implements the "Yolo" loop (Think \-\> Act \-\> Observe \-\> Repeat).  
3. **The Tooling Layer (src/tools/)**:  
   * **MCP Client:** Connects to @modelcontextprotocol/server-filesystem to give the agent read/write access to the host's files.  
   * **Shell Executor:** A custom tool to allow the agent to run terminal commands (npm, git, etc.).

## **3\. Tech Stack & Dependencies**

**package.json Requirements:**

* discord.js: For the bot interface.  
* @google/genai: The official Gemini SDK (v1.0.0+).  
* @modelcontextprotocol/sdk: To implement the MCP Client.  
* zod: For schema validation.  
* dotenv: For environment variables.  
* simple-git: For git operations.  
* winston: For structured logging.

**Dev Dependencies:**

* typescript  
* tsx: For running TS directly.  
* vitest: For unit testing.

## **4\. Environment Configuration**

The application must load these variables from .env:

DISCORD\_TOKEN=your\_discord\_token  
GEMINI\_API\_KEY=your\_google\_ai\_studio\_key  
\# The root directory where the bot is allowed to work/create projects  
WORKSPACE\_ROOT=/app/workspace

## **5\. Implementation Details**

### **A. The Tool Interface**

We need a standard interface for tools so the Agent can call them seamlessly, whether they come from an MCP server or are internal (like the Shell).

// src/interfaces/Tool.ts  
import { FunctionDeclaration, SchemaType } from "@google/genai";

export interface AgentTool {  
  name: string;  
  description: string;  
  parameters: FunctionDeclaration\['parameters'\];  
  execute: (args: any) \=\> Promise\<any\>;  
}

### **B. The Gemini Agent Class**

This is the heart of the "Yolo Mode". It must implement a recursive loop.

**Logic Flow:**

1. Initialize GoogleGenAI client.  
2. Load available tools (MCP tools \+ Shell tools).  
3. Convert tools to Gemini FunctionDeclaration format.  
4. Send prompt \+ History.  
5. Check response:  
   * If functionCall: Execute tool \-\> Add result to history \-\> **Recursively call generateContent again**.  
   * If text: Return text to Discord user.

### **C. The MCP Client Wrapper**

The bot needs to spawn the filesystem MCP server as a subprocess and communicate via Stdio.

**Required Logic:**

* Spawn npx \-y @modelcontextprotocol/server-filesystem \<allowed\_path\>.  
* Use Client from @modelcontextprotocol/sdk/client/index.js.  
* Use StdioClientTransport from @modelcontextprotocol/sdk/client/stdio.js.  
* Expose read\_file, write\_file, list\_directory, etc., as AgentTool objects.

### **D. The Shell Tool (Critical)**

Since MCP filesystem doesn't run commands, we need a custom "Shell" tool.

Safety: This tool should default to the current active project directory.  
Tool Definition:

* Name: run\_terminal\_command  
* Params: command (string)  
* Logic: Use Node.js child\_process.exec. Return stdout or stderr.

## **6\. Docker Setup**

Since we want full filesystem access in a container:

**Dockerfile:**

* Base image: node:20-bookworm (Ubuntu based, includes git/build-essentials).  
* Install system deps: git, curl, python3, build-essential.  
* Set working directory to /app.

**compose.yaml:**

* Mount the local workspace folder to /app/workspace.  
* Pass .env file.

## **7\. Folder Structure**

/  
├── Dockerfile  
├── compose.yaml  
├── package.json  
├── tsconfig.json  
├── src/  
│   ├── index.ts           \# Entry point  
│   ├── config.ts          \# Env vars  
│   ├── agent/  
│   │   ├── GeminiAgent.ts \# The AI Logic  
│   │   └── Session.ts     \# Manages active repo per user  
│   ├── discord/  
│   │   ├── Bot.ts  
│   │   └── handlers.ts  
│   └── tools/  
│       ├── ToolRegistry.ts  
│       ├── ShellTool.ts  
│       └── McpManager.ts  \# Handles the filesystem MCP connection  
└── tests/

## **8\. Specific Coding Instructions for the Agent**

1. **Strict Typing:** Do not use any. Use generic types for tool definitions.  
2. **Error Handling:** If the LLM produces invalid JSON or a tool fails, catch the error, feed it back to the LLM context ("Tool failed: "), and let the LLM try to fix it. Do not crash the bot.  
3. **System Prompt:** Configure Gemini with a system instruction:"You are a Senior Agentic Developer. You have access to the file system and terminal. You do not ask for permission; you execute commands to build the requested software. If a compilation fails, you read the error and fix it. You always write clean, documented TypeScript."

## **9\. Next Steps for Implementation**

1. Initialize the Node.js project.  
2. Set up the MCP Client to connect to server-filesystem.  
3. Implement the GeminiAgent loop.  
4. Connect the Discord messageCreate event to trigger the Agent.
