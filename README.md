# Discord Coder Bot

An autonomous Discord bot powered by **Google Gemini 2.0 Flash** and the **Model Context Protocol (MCP)** for file system access. This bot acts as a coding agent that can read, write files, and execute terminal commands to build software autonomously.

## Features

- 🤖 **Autonomous Coding Agent** - Uses Gemini 2.0 Flash to understand and execute coding tasks
- 📁 **File System Access** - Read, write, and manage files via MCP filesystem server
- 💻 **Terminal Execution** - Run npm, git, and other CLI commands
- 🔄 **Agentic Loop** - Implements Think → Act → Observe → Repeat pattern
- 🧠 **Planning Mode** - Optional planning phase to outline approach before execution
- 🔒 **Safety Guards** - Workspace isolation and dangerous command blocking
- 📝 **Session Management** - Per-user sessions with working directory tracking
- 🚀 **Vercel Deployment** - Deploy web apps to production or preview URLs
- 📜 **Git Integration** - View git history and manage version control

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Discord Interface                        │
│  (Bot.ts, handlers.ts, commands.ts)                         │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                      Agent Core                              │
│  (GeminiAgent.ts, Session.ts, PlanningUtils.ts)             │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │           Yolo Loop (Think → Act → Observe)         │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                     Tooling Layer                            │
│  ┌─────────────────┐  ┌─────────────────────────────────┐   │
│  │   ShellTool     │  │       McpManager                │   │
│  │ (run commands)  │  │  (filesystem MCP server)        │   │
│  └─────────────────┘  └─────────────────────────────────┘   │
│  ┌─────────────────┐  ┌─────────────────────────────────┐   │
│  │   VercelTool    │  │       GitTool                   │   │
│  │ (deployments)   │  │  (version control)              │   │
│  └─────────────────┘  └─────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Prerequisites

- Node.js 20+
- Docker & Docker Compose (for containerized deployment)
- Discord Bot Token (from [Discord Developer Portal](https://discord.com/developers/applications))
- Discord Client ID (Application ID)
- Google AI Studio API Key (from [Google AI Studio](https://aistudio.google.com/))

## Quick Start

### 1. Clone and Install

```bash
git clone <repository-url>
cd discord-coder-bot
npm install
```

### 2. Configure Environment

Copy the example environment file and fill in your credentials:

```bash
cp .env.example .env
```

Edit `.env` with your configuration.

**Required Variables:**

| Variable | Description |
|----------|-------------|
| `DISCORD_TOKEN` | Your Discord Bot Token |
| `DISCORD_CLIENT_ID` | Your Discord Application ID (Client ID) |
| `GEMINI_API_KEY` | Google AI Studio API Key |
| `WORKSPACE_ROOT` | Absolute path to the workspace directory (e.g., `/app/workspace`) |

**Optional Variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `GEMINI_MODEL` | `gemini-2.5-pro` | The Gemini model version to use |
| `LOG_LEVEL` | `info` | Logging verbosity (`debug`, `info`, `warn`, `error`) |
| `MAX_ITERATIONS` | `50` | Max tool calls per request to prevent loops |
| `COMMAND_TIMEOUT_MS` | `60000` | Timeout for shell commands in milliseconds |
| `VERCEL_TOKEN` | - | Vercel API Token (required for deployment features) |
| `ENABLE_WEB_FETCH` | `true` | Enable fetching content from URLs |
| `ENABLE_CONTEXT7` | `true` | Enable Context7 for library documentation |
| `CONTEXT7_API_KEY` | - | API Key for Context7 (optional, for higher limits) |
| `GIT_USER_NAME` | `Discord Coder Bot` | Name for git commits |
| `GIT_USER_EMAIL` | `bot@example.com` | Email for git commits |

### 3. Run with Docker (Recommended)

```bash
docker compose up --build
```

### 4. Run Locally (Development)

```bash
npm run dev
```

## Project Structure

```
src/
├── index.ts              # Entry point
├── config.ts             # Environment configuration
├── logger.ts             # Winston logger setup
├── agent/
│   ├── GeminiAgent.ts    # Core AI agent with agentic loop
│   ├── Session.ts        # User session management
│   └── PlanningUtils.ts  # Planning mode utilities
├── discord/
│   ├── Bot.ts            # Discord client setup
│   ├── handlers.ts       # Message handlers
│   └── commands.ts       # Slash command definitions
├── interfaces/
│   └── Tool.ts           # Tool interface definitions
└── tools/
    ├── McpManager.ts     # MCP filesystem client
    ├── ShellTool.ts      # Terminal command executor
    ├── VercelTool.ts     # Vercel deployment tool
    ├── GitTool.ts        # Git history tool
    ├── ResetTool.ts      # Memory reset tool
    └── ToolRegistry.ts   # Central tool management
```

## Usage

### Slash Commands

| Command | Description |
|---------|-------------|
| `/reset` | Resets the agent's memory and conversation history |
| `/status` | Shows the current status of the agent (working directory, planning mode, etc.) |
| `/logs` | Shows the last few lines of logs (console only) |
| `/tree` | Shows the file structure of the current directory |
| `/summarize` | Summarizes the current session and work done |
| `/list-projects` | Lists all projects in the workspace |
| `/new-project` | Creates a new project and switches to it |
| `/delete-project` | Deletes a project folder |
| `/switch-project` | Switches the working directory to an existing project |
| `/git-log` | Shows recent git commits for the current project |
| `/planning` | Toggles planning mode (agent creates a plan before executing) |

### Interacting with the Bot

1. **Mention the bot** in a Discord channel where it's present:
   ```
   @CodingBot Create a new Express.js server with TypeScript
   ```

2. **Direct Message** the bot:
   ```
   Build a CLI tool that converts markdown to HTML
   ```

3. **Planning Mode**:
   ```
   @CodingBot Build a todo app, but plan it out first
   ```
   Or enable it explicitly:
   ```
   /planning enabled:True
   ```

### Example Prompts

- "Create a new Node.js project with TypeScript and ESLint"
- "Build a REST API with Express that has CRUD endpoints for users"
- "Fix the TypeScript compilation errors in the project"
- "Add unit tests for the UserService class"
- "Initialize a git repository and create a .gitignore"
- "Deploy this project to Vercel production"

## Development

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start in development mode with hot reload |
| `npm run build` | Compile TypeScript to JavaScript |
| `npm start` | Run the compiled application |
| `npm test` | Run unit tests |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run typecheck` | Check TypeScript types |

### Running Tests

```bash
npm test
```

### Building

```bash
npm run build
```

## Docker Deployment

The project includes a `Dockerfile` and `compose.yaml` for containerized deployment:

```bash
# Build and run
docker compose up --build

# Run in background
docker compose up -d

# View logs
docker compose logs -f

# Stop
docker compose down
```

The Docker setup:
- Uses `node:20-bookworm` (Ubuntu-based with git, python, build-essential)
- Mounts `./workspace_data` to `/app/workspace` for persistent file access
- Automatically restarts unless stopped

## Security Considerations

- **Workspace Isolation**: The agent can only access files within `WORKSPACE_ROOT`
- **Command Blocking**: Dangerous commands (rm -rf /, sudo, etc.) are blocked
- **Timeout Protection**: Commands timeout after 60 seconds (configurable via `COMMAND_TIMEOUT_MS`)
- **Output Truncation**: Large outputs are truncated to prevent memory issues

## License

MIT
