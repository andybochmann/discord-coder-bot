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

## Quick Start

### Using Docker Compose

Create a `compose.yaml` file:

```yaml
services:
  discord-coder-bot:
    image: andybochmann/discord-coder-bot:latest
    restart: unless-stopped
    environment:
      - DISCORD_TOKEN=your_discord_token
      - DISCORD_CLIENT_ID=your_client_id
      - GEMINI_API_KEY=your_gemini_key
      - WORKSPACE_ROOT=/app/workspace
      - LOG_LEVEL=info
    volumes:
      - ./workspace_data:/app/workspace
```

Run the container:

```bash
docker compose up -d
```

### Using Docker Run

```bash
docker run -d \
  --name discord-coder-bot \
  --restart unless-stopped \
  -e DISCORD_TOKEN=your_discord_token \
  -e DISCORD_CLIENT_ID=your_client_id \
  -e GEMINI_API_KEY=your_gemini_key \
  -e WORKSPACE_ROOT=/app/workspace \
  -v $(pwd)/workspace_data:/app/workspace \
  andybochmann/discord-coder-bot:latest
```

## Environment Variables

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

## Links

- **Source Code**: [GitHub Repository](https://github.com/andybochmann/discord-coder-bot)
- **Issues**: [GitHub Issues](https://github.com/andybochmann/discord-coder-bot/issues)

## License

MIT
