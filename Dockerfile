FROM node:20-bookworm

# Install basic development tools (git, python, build essentials)
# We need these so the agent can run 'npm install' or compile things inside the container
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    make \
    g++ \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install uv (Python package manager) for running Python-based MCP servers via uvx
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:$PATH"

WORKDIR /app

# Create a directory for the workspace (where the agent will create projects)
RUN mkdir -p /app/workspace

# Copy package definition
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Make entrypoint executable
RUN chmod +x entrypoint.sh

# Build the TypeScript code
RUN npm run build

# Use entrypoint to configure git before starting
ENTRYPOINT ["./entrypoint.sh"]

# Start the bot
CMD ["npm", "start"]