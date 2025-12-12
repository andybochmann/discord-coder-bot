import { exec } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import type { AgentTool, ToolResult } from "../interfaces/Tool.js";
import { successResult, errorResult } from "../interfaces/Tool.js";
import { logger } from "../logger.js";
import { config } from "../config.js";
import { Type } from "@google/genai";

const execAsync = promisify(exec);

/**
 * Parameters for the get_git_history tool.
 */
interface GitHistoryParams {
  /** Number of commits to retrieve (default: 10) */
  count?: number;
  /** Show full diff for each commit */
  showDiff?: boolean;
}

/**
 * Creates the Git History tool for retrieving recent commits.
 *
 * @param workingDirectory - The project directory to get history from
 * @returns An AgentTool for fetching git history
 */
export function createGitHistoryTool(
  workingDirectory: string
): AgentTool<GitHistoryParams> {
  return {
    name: "get_git_history",
    description:
      "Retrieves the recent git commit history for the current project. Use this to see what changes have been made, when, and by whom.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        count: {
          type: Type.NUMBER,
          description: "Number of commits to retrieve (default: 10, max: 50)",
        },
        showDiff: {
          type: Type.BOOLEAN,
          description:
            "Whether to include the diff for each commit (default: false)",
        },
      },
    },
    execute: async (args: GitHistoryParams): Promise<ToolResult> => {
      return executeGitHistory(workingDirectory, args);
    },
  };
}

/**
 * Executes git log command to retrieve commit history.
 *
 * @param workingDirectory - The directory to run git log in
 * @param args - Parameters for the git log command
 * @returns The git history result
 */
async function executeGitHistory(
  workingDirectory: string,
  args: GitHistoryParams
): Promise<ToolResult> {
  const normalizedWorkspace = path.resolve(config.WORKSPACE_ROOT);
  const normalizedCwd = path.resolve(workingDirectory);

  // Validate working directory is within workspace
  if (!normalizedCwd.startsWith(normalizedWorkspace)) {
    return errorResult("Working directory must be within the workspace.");
  }

  const count = Math.min(Math.max(args.count ?? 10, 1), 50);
  const showDiff = args.showDiff ?? false;

  // Build git log command
  const format = showDiff
    ? "--pretty=format:'%h | %ad | %an | %s' --date=short"
    : "--pretty=format:'%h | %ad | %an | %s' --date=short";

  const diffFlag = showDiff ? "-p" : "--stat";
  const command = `git log -${count} ${format} ${diffFlag}`;

  logger.info("Fetching git history", {
    cwd: normalizedCwd,
    count,
    showDiff,
  });

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: normalizedCwd,
      timeout: 30000,
      maxBuffer: 100000,
    });

    if (stderr && !stdout) {
      return errorResult(`Git error: ${stderr}`);
    }

    if (!stdout.trim()) {
      return successResult({
        message: "No commits found in this repository.",
        commits: [],
      });
    }

    return successResult({
      history: stdout,
      commitCount: count,
    });
  } catch (error) {
    if (error instanceof Error) {
      // Check if it's not a git repository
      if (error.message.includes("not a git repository")) {
        return errorResult(
          "This directory is not a git repository. Initialize with 'git init' first."
        );
      }
      return errorResult(`Failed to get git history: ${error.message}`);
    }
    return errorResult("Unknown error fetching git history");
  }
}

/**
 * Fetches git history for a directory (used by slash command).
 *
 * @param directory - The directory to get history from
 * @param count - Number of commits to retrieve
 * @returns Formatted git log output
 */
export async function getGitLog(
  directory: string,
  count: number = 10
): Promise<string> {
  const normalizedWorkspace = path.resolve(config.WORKSPACE_ROOT);
  const normalizedCwd = path.resolve(directory);

  if (!normalizedCwd.startsWith(normalizedWorkspace)) {
    throw new Error("Directory must be within the workspace.");
  }

  const command = `git log -${count} --pretty=format:'%h | %ad | %an | %s' --date=short --stat`;

  try {
    const { stdout } = await execAsync(command, {
      cwd: normalizedCwd,
      timeout: 30000,
      maxBuffer: 100000,
    });

    return stdout.trim() || "No commits found.";
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("not a git repository")) {
        return "This directory is not a git repository.";
      }
      return `Git error: ${error.message}`;
    }
    return "Unknown error fetching git history.";
  }
}
