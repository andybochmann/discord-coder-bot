# Discord Coder Bot

An autonomous Discord bot powered by **Google Gemini 2.0 Flash** and the **Model Context Protocol (MCP)** for file system access. This bot acts as a coding agent that can read, write files, and execute terminal commands to build software autonomously.

## Features

- 🤖 **Autonomous Coding Agent** - Uses Gemini 2.0 Flash to understand and execute coding tasks
- 📁 **File System Access** - Read, write, and manage files via MCP filesystem server
- 💻 **Terminal Execution** - Run npm, git, and other CLI commands
- 🔄 **Agentic Loop** - Implements Think → Act → Observe → Repeat pattern
- 🔒 **Safety Guards** - Workspace isolation and dangerous command blocking
- 📝 **Session Management** - Per-user sessions with working directory tracking

## Architecture

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
└─────────────────────────────────────────────────────────────┘
```

## Prerequisites

- Node.js 20+
- Docker & Docker Compose (for containerized deployment)
- Discord Bot Token (from [Discord Developer Portal](https://discord.com/developers/applications))
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

Edit `.env`:
```env
DISCORD_TOKEN=your_discord_bot_token
GEMINI_API_KEY=your_google_ai_studio_key
WORKSPACE_ROOT=/app/workspace
LOG_LEVEL=info
```

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
│   └── Session.ts        # User session management
├── discord/
│   ├── Bot.ts            # Discord client setup
│   └── handlers.ts       # Message handlers
├── interfaces/
│   └── Tool.ts           # Tool interface definitions
└── tools/
    ├── McpManager.ts     # MCP filesystem client
    ├── ShellTool.ts      # Terminal command executor
    └── ToolRegistry.ts   # Central tool management
```

## Usage

### Interacting with the Bot

1. **Mention the bot** in a Discord channel where it's present:
   ```
   @CodingBot Create a new Express.js server with TypeScript
   ```

2. **Direct Message** the bot:
   ```
   Build a CLI tool that converts markdown to HTML
   ```

### Example Prompts

- "Create a new Node.js project with TypeScript and ESLint"
- "Build a REST API with Express that has CRUD endpoints for users"
- "Fix the TypeScript compilation errors in the project"
- "Add unit tests for the UserService class"
- "Initialize a git repository and create a .gitignore"

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
- **Timeout Protection**: Commands timeout after 60 seconds
- **Output Truncation**: Large outputs are truncated to prevent memory issues

## License

MIT
