#!/bin/sh

# Default git user configuration
DEFAULT_GIT_USER_NAME="Discord Coder Bot"
DEFAULT_GIT_USER_EMAIL="bot@discord-coder.local"

# Configure git user (use environment variables if set, otherwise use defaults)
GIT_NAME="${GIT_USER_NAME:-$DEFAULT_GIT_USER_NAME}"
GIT_EMAIL="${GIT_USER_EMAIL:-$DEFAULT_GIT_USER_EMAIL}"

git config --global user.name "$GIT_NAME"
git config --global user.email "$GIT_EMAIL"
echo "Git configured: $GIT_NAME <$GIT_EMAIL>"

# Set default branch name to 'main' to suppress warnings
git config --global init.defaultBranch main

# Execute the main command
exec "$@"
