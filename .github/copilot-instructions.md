# GitHub Copilot Instructions

This file contains guidelines and best practices for developing this TypeScript application. Copilot and contributors must follow these rules when writing or modifying code.

---

## Project Overview

### What Is This Project?

**Discord Coder Bot** is an autonomous Discord bot powered by **Google Gemini 2.5 Pro** and the **Model Context Protocol (MCP)** for file system access. The bot acts as a coding agent that can read/write files and execute terminal commands to build software autonomously.

### Key Features

- 🤖 **Autonomous Coding Agent** - Uses Gemini to understand and execute coding tasks
- 📁 **File System Access** - Read, write, and manage files via MCP filesystem server
- 💻 **Terminal Execution** - Run npm, git, and other CLI commands
- 🔄 **Agentic Loop** - Implements Think → Act → Observe → Repeat pattern
- 🔒 **Safety Guards** - Workspace isolation and dangerous command blocking
- 📝 **Session Management** - Per-user sessions with working directory tracking
- 🚀 **Vercel Deployment** - Deploy web apps and share live URLs with users

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Discord Interface                        │
│  (Bot.ts, handlers.ts)                                      │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                      Agent Core                              │
│  (GeminiAgent.ts, Session.ts)                               │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │           Yolo Loop (Think → Act → Observe)             ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                     Tooling Layer                            │
│  ┌─────────────────┐  ┌─────────────────────────────────┐   │
│  │   ShellTool     │  │       McpManager                │   │
│  │ (run commands)  │  │  (filesystem MCP server)        │   │
│  └─────────────────┘  └─────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Project Structure

```
src/
├── index.ts              # Entry point - starts bot and sets up shutdown handlers
├── config.ts             # Environment configuration with Zod validation
├── logger.ts             # Winston logger setup
├── agent/
│   ├── GeminiAgent.ts    # Core AI agent with agentic loop (Think→Act→Observe)
│   ├── Session.ts        # User session management (working directory tracking)
│   └── index.ts          # Barrel export
├── discord/
│   ├── Bot.ts            # Discord client setup and event handling
│   ├── handlers.ts       # Message handlers, routes to GeminiAgent
│   └── index.ts          # Barrel export
├── interfaces/
│   ├── Tool.ts           # AgentTool interface, ToolResult type, helper functions
│   └── index.ts          # Barrel export
└── tools/
    ├── ToolRegistry.ts   # Aggregates all tools for the agent
    ├── ShellTool.ts      # run_terminal_command tool with safety guards
    ├── McpManager.ts     # MCP filesystem server connection
    ├── VercelTool.ts     # Vercel deployment tool
    └── index.ts          # Barrel export
```

### Tech Stack

- **Runtime**: Node.js 20+ in Docker (Ubuntu-based)
- **Language**: TypeScript (Strict Mode)
- **AI**: Google Gemini 2.5 Pro via `@google/genai` SDK
- **Tooling Protocol**: Model Context Protocol (MCP) via `@modelcontextprotocol/sdk`
- **Discord**: `discord.js` v14
- **Validation**: `zod` for environment and schema validation
- **Logging**: `winston` for structured logging
- **Testing**: `vitest` for unit testing
- **Development**: `tsx` for running TypeScript directly

### Environment Variables

Required configuration in `.env`:

```env
DISCORD_TOKEN=your_discord_bot_token      # Discord bot authentication
GEMINI_API_KEY=your_google_ai_studio_key  # Google AI Studio API key
WORKSPACE_ROOT=/app/workspace             # Root directory for bot operations
LOG_LEVEL=info                            # Winston log level
GEMINI_MODEL=gemini-2.5-pro              # Model to use (optional)
MAX_ITERATIONS=50                         # Max tool calls per request (optional)
VERCEL_TOKEN=your_vercel_token           # For deployments (optional)
```

---

## TypeScript Configuration

### Strict Mode

- **Always enable strict mode** in `tsconfig.json`
- Required compiler options:
  ```json
  {
    "compilerOptions": {
      "strict": true,
      "noImplicitAny": true,
      "strictNullChecks": true,
      "strictFunctionTypes": true,
      "strictBindCallApply": true,
      "strictPropertyInitialization": true,
      "noImplicitThis": true,
      "alwaysStrict": true,
      "noUnusedLocals": true,
      "noUnusedParameters": true,
      "noImplicitReturns": true,
      "noFallthroughCasesInSwitch": true,
      "noUncheckedIndexedAccess": true
    }
  }
  ```

### Type Safety

- Never use `any` type unless absolutely necessary; prefer `unknown` when type is uncertain
- Always define explicit return types for functions
- Use type guards and narrowing instead of type assertions
- Prefer interfaces for object shapes; use types for unions, intersections, and mapped types
- Use `readonly` for properties that should not be modified
- Avoid non-null assertions (`!`); handle null/undefined explicitly

---

## Code Documentation

### JSDoc Requirements

- **Every exported function, class, interface, and type must have JSDoc documentation**
- Include the following in JSDoc comments:
  - `@description` - Brief explanation of what it does
  - `@param` - For each parameter with type and description
  - `@returns` - Return value description
  - `@throws` - Document any exceptions that may be thrown
  - `@example` - Provide usage examples for complex functions

### Documentation Standards

```typescript
/**
 * Calculates the sum of two numbers.
 *
 * @param a - The first number to add
 * @param b - The second number to add
 * @returns The sum of a and b
 * @throws {RangeError} If either number exceeds safe integer limits
 *
 * @example
 * const result = add(2, 3);
 * console.log(result); // 5
 */
export function add(a: number, b: number): number {
  // implementation
}
```

### Inline Comments

- Use inline comments to explain **why**, not **what**
- Complex algorithms must have step-by-step explanations
- Mark TODOs with `// TODO:` and include context

---

## Unit Testing

### Testing Requirements

- **Every feature must have corresponding unit tests**
- Aim for **minimum 80% code coverage**
- Test files must be co-located or in a `__tests__` directory
- Use descriptive test names that explain the expected behavior

### Testing Best Practices

- Follow the **Arrange-Act-Assert** pattern
- Test both success and failure paths
- Mock external dependencies (APIs, databases, file system)
- Write tests before or alongside implementation (TDD encouraged)
- Each test should be independent and not rely on other tests

### Test Naming Convention

```typescript
describe("FunctionName", () => {
  it("should return expected result when given valid input", () => {
    // test implementation
  });

  it("should throw an error when given invalid input", () => {
    // test implementation
  });
});
```

---

## Code Style & Conventions

### Naming Conventions

- **Variables and functions**: camelCase
- **Classes and interfaces**: PascalCase
- **Constants**: UPPER_SNAKE_CASE
- **Private members**: prefix with underscore `_privateMember`
- **Boolean variables**: prefix with `is`, `has`, `should`, `can`
- **Files**: kebab-case for files, PascalCase for class files

### Function Guidelines

- Functions should do one thing and do it well (Single Responsibility)
- Maximum function length: ~50 lines (prefer smaller)
- Maximum parameters: 3 (use an options object for more)
- Prefer pure functions where possible
- Use arrow functions for callbacks and short functions

### Error Handling

- Always use typed errors or custom error classes
- Never swallow errors silently
- Provide meaningful error messages with context
- Use try-catch at appropriate boundaries

---

## Architecture & Patterns

### Module Organization

- One class/component per file
- Group related functionality in directories
- Use barrel exports (`index.ts`) for clean imports
- Separate concerns: business logic, data access, presentation

### Dependency Injection

- Prefer constructor injection for dependencies
- Use interfaces for external dependencies to enable testing
- Avoid global state and singletons where possible

### Async/Await

- Always use async/await over raw promises
- Handle errors with try-catch in async functions
- Avoid mixing callbacks with promises
- Use `Promise.all()` for concurrent operations

---

## Security Best Practices

- Never hardcode secrets, API keys, or credentials
- Validate and sanitize all external inputs
- Use environment variables for configuration
- Implement proper authentication and authorization checks
- Log security-relevant events without exposing sensitive data

---

## Git & Version Control

- Write meaningful commit messages
- Keep commits atomic and focused
- Branch naming: `feature/`, `bugfix/`, `hotfix/`, `chore/`
- Always create pull requests for code review

---

## Performance Considerations

- Avoid premature optimization, but be mindful of obvious inefficiencies
- Use appropriate data structures for the use case
- Implement pagination for large data sets
- Cache expensive computations when appropriate
- Profile before optimizing

---

## Reminders for Copilot

When generating code:

1. ✅ Always include proper TypeScript types
2. ✅ Add JSDoc documentation for all exports
3. ✅ Suggest or generate corresponding unit tests
4. ✅ Follow the naming conventions above
5. ✅ Handle errors explicitly
6. ❌ Never use `any` without justification
7. ❌ Never ignore potential null/undefined values
8. ❌ Never generate code without considering edge cases

---

## Project-Specific Guidelines

### Working with the Agent Core

#### GeminiAgent Class (`src/agent/GeminiAgent.ts`)

- The `GeminiAgent` class implements the "Yolo Mode" agentic loop
- Key methods:
  - `initialize()` - Sets up the tool registry (MCP + Shell tools)
  - `execute(prompt)` - Main entry point for processing user requests
  - `shutdown()` - Cleans up MCP connections
- The agent maintains conversation history in `_conversationHistory`
- Always call `initialize()` before `execute()` and `shutdown()` when done

#### Session Management (`src/agent/Session.ts`)

- Each Discord user has their own session with a working directory
- Sessions track the current project directory for the user
- Use `sessionManager.getOrCreateSession(userId)` to get user sessions

### Working with Tools

#### Tool Interface (`src/interfaces/Tool.ts`)

All tools must implement the `AgentTool<TParams>` interface:

```typescript
interface AgentTool<TParams = Record<string, unknown>> {
  name: string; // Unique identifier
  description: string; // For LLM context
  parameters: FunctionDeclaration["parameters"]; // Gemini schema format
  execute: (args: TParams) => Promise<ToolResult>;
}
```

Use helper functions for consistent results:

- `successResult(data)` - Creates a successful ToolResult
- `errorResult(message)` - Creates a failed ToolResult

#### Creating New Tools

1. Create a new file in `src/tools/` (e.g., `MyTool.ts`)
2. Export a factory function: `createMyTool(): AgentTool<MyToolParams>`
3. Define parameters using `@google/genai` `Type` enum
4. Register the tool in `ToolRegistry.ts`

Example structure:

```typescript
import { Type } from "@google/genai";
import type { AgentTool, ToolResult } from "../interfaces/Tool.js";
import { successResult, errorResult } from "../interfaces/Tool.js";

interface MyToolParams {
  param1: string;
  param2?: number;
}

export function createMyTool(): AgentTool<MyToolParams> {
  return {
    name: "my_tool_name",
    description: "Description for the LLM",
    parameters: {
      type: Type.OBJECT,
      properties: {
        param1: { type: Type.STRING, description: "..." },
        param2: { type: Type.NUMBER, description: "..." },
      },
      required: ["param1"],
    },
    execute: async (args: MyToolParams): Promise<ToolResult> => {
      // Implementation
      return successResult({ result: "..." });
    },
  };
}
```

#### ShellTool Safety (`src/tools/ShellTool.ts`)

- Commands are sandboxed to `WORKSPACE_ROOT`
- Dangerous commands are blocked (rm -rf /, etc.)
- Command timeout is 60 seconds
- Output is truncated at 50,000 characters

#### McpManager (`src/tools/McpManager.ts`)

- Spawns `@modelcontextprotocol/server-filesystem` as subprocess
- Communicates via stdio transport
- Provides file system tools: `read_file`, `write_file`, `list_directory`, etc.
- Always call `disconnect()` on shutdown

### Discord Integration

#### Message Handling (`src/discord/handlers.ts`)

- Bot responds to @mentions and DMs only
- Each user gets their own `GeminiAgent` instance (stored in `userAgents` Map)
- Long responses are automatically chunked to fit Discord's 2000 char limit
- Typing indicator is shown during processing

#### Adding New Commands

For simple commands, add handling in `setupMessageHandler()`.
For complex features, consider:

1. Creating a new handler function
2. Using Discord.js slash commands (future enhancement)

### Docker Deployment

- **Dockerfile**: Ubuntu-based Node.js 20 with git, curl, python3, build-essential
- **compose.yaml**: Mounts local workspace to `/app/workspace`
- **entrypoint.sh**: Configures git user from environment variables

Run with:

```bash
docker compose up --build -d
```

### Running Tests

```bash
npm test              # Run tests in watch mode
npm run test:coverage # Run with coverage report
```

Tests are in the `tests/` directory. Mock external dependencies (Gemini API, MCP, Discord).

### Common Patterns in This Codebase

1. **Factory Functions**: Tools use `createXxxTool()` pattern
2. **Barrel Exports**: Each directory has `index.ts` for clean imports
3. **Private Members**: Prefixed with `_` (e.g., `_client`, `_isInitialized`)
4. **Logging**: Use `logger` from `./logger.js` or `createChildLogger({ component: "Name" })`
5. **Error Recovery**: Feed errors back to LLM context, don't crash the bot
6. **Configuration**: All config via `config` object from `./config.js`

### Import Conventions

Always use `.js` extension in imports (ESM requirement):

```typescript
import { config } from "./config.js";
import { logger } from "../logger.js";
import type { AgentTool } from "../interfaces/Tool.js";
```
