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

WORKDIR /app

# Create a directory for the workspace (where the agent will create projects)
RUN mkdir -p /app/workspace

# Copy package definition
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build the TypeScript code
RUN npm run build

# Start the bot
CMD ["npm", "start"]