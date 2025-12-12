import { exec } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import type { AgentTool, ToolResult } from "../interfaces/Tool.js";
import { successResult, errorResult } from "../interfaces/Tool.js";
import { logger } from "../logger.js";
import { config } from "../config.js";
import { Type } from "@google/genai";

const execAsync = promisify(exec);

/** Maximum execution time for shell commands in milliseconds */
const COMMAND_TIMEOUT_MS = 60000;

/** Maximum output size in characters to prevent memory issues */
const MAX_OUTPUT_SIZE = 50000;

/**
 * Parameters for the run_terminal_command tool.
 */
interface ShellToolParams {
  /** The command to execute in the terminal */
  command: string;
  /** Optional working directory (defaults to current project directory) */
  cwd?: string;
}

/**
 * Creates the Shell tool for executing terminal commands.
 * This tool allows the agent to run npm, git, and other CLI commands.
 * Commands are always executed within the configured workspace root.
 *
 * @returns An AgentTool for executing shell commands
 *
 * @example
 * const shellTool = createShellTool();
 * const result = await shellTool.execute({ command: 'npm install' });
 */
export function createShellTool(): AgentTool<ShellToolParams> {
  return {
    name: "run_terminal_command",
    description:
      "Execute a terminal command in the workspace. Use this to run npm, git, build commands, and other CLI tools. The command runs in the current project directory by default.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        command: {
          type: Type.STRING,
          description:
            "The shell command to execute (e.g., 'npm install', 'git status', 'ls -la')",
        },
        cwd: {
          type: Type.STRING,
          description:
            "Optional working directory for the command. Defaults to the current project directory.",
        },
      },
      required: ["command"],
    },
    execute: async (args: ShellToolParams): Promise<ToolResult> => {
      // Use workspace directory if cwd is not provided or is empty
      const effectiveCwd = args.cwd?.trim() || "";
      return executeShellCommand(args.command, effectiveCwd);
    },
  };
}

/**
 * Executes a shell command safely within the workspace.
 *
 * @param command - The command to execute
 * @param cwd - The working directory for the command (relative to workspace or absolute within workspace)
 * @returns The result of the command execution
 *
 * @example
 * const result = await executeShellCommand('npm install', 'project');
 */
async function executeShellCommand(
  command: string,
  cwd: string
): Promise<ToolResult> {
  // Normalize workspace path
  const normalizedWorkspace = path.resolve(config.WORKSPACE_ROOT);
  let normalizedCwd: string;

  // Handle cwd resolution:
  // - Empty or "." -> use workspace root
  // - Relative paths -> resolve relative to workspace root
  // - Absolute paths within workspace -> use as-is
  // - Absolute paths outside workspace -> reject
  const trimmedCwd = cwd.trim();

  if (!trimmedCwd || trimmedCwd === "." || trimmedCwd === "./") {
    // Use workspace root
    normalizedCwd = normalizedWorkspace;
  } else if (path.isAbsolute(trimmedCwd)) {
    // Absolute path - check if it's within workspace
    normalizedCwd = path.resolve(trimmedCwd);
  } else {
    // Relative path - resolve relative to workspace root (not workspaceRoot param)
    normalizedCwd = path.resolve(normalizedWorkspace, trimmedCwd);
  }

  // Validate the working directory is within the workspace
  if (!normalizedCwd.startsWith(normalizedWorkspace)) {
    logger.warn("Attempted to execute command outside workspace", {
      cwd: normalizedCwd,
      workspace: normalizedWorkspace,
    });
    return errorResult(
      `Working directory must be within the workspace: ${config.WORKSPACE_ROOT}. ` +
        `The provided path "${cwd}" resolves to "${normalizedCwd}" which is outside the workspace. ` +
        `Use a relative path like "." or "my-project" or leave cwd empty.`
    );
  }

  // Block only truly dangerous system-level commands
  // File operations within workspace are allowed (including rm -rf)
  const blockedPatterns = [
    /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*)?\s+\/(?!app\/workspace)/i, // rm -rf / (but allow /app/workspace)
    /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*)?\s+~\//i, // rm -rf ~/
    /\bsudo\b/i, // sudo commands
    /\b(shutdown|reboot|halt|poweroff)\b/i, // system commands
    /\bchmod\s+.*777\s+\//i, // dangerous permissions on system dirs
    /\b(curl|wget)\s+.*\|\s*(ba)?sh/i, // piped remote execution
  ];

  for (const pattern of blockedPatterns) {
    if (pattern.test(command)) {
      logger.warn("Blocked dangerous command", { command });
      return errorResult(
        "This command has been blocked for safety reasons. Please use a safer alternative."
      );
    }
  }

  logger.info("Executing shell command", { command, cwd: normalizedCwd });

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: normalizedCwd,
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_SIZE * 2,
      shell: process.platform === "win32" ? "cmd.exe" : "/bin/bash",
      env: {
        ...process.env,
        // Ensure consistent environment
        NODE_ENV: process.env["NODE_ENV"] ?? "development",
        PATH: process.env["PATH"],
      },
    });

    // Truncate output if too long
    const truncatedStdout = truncateOutput(stdout, MAX_OUTPUT_SIZE);
    const truncatedStderr = truncateOutput(stderr, MAX_OUTPUT_SIZE);

    logger.debug("Shell command completed", {
      command,
      stdoutLength: stdout.length,
      stderrLength: stderr.length,
    });

    // If there's stderr but command succeeded (exit code 0), include both
    if (truncatedStderr && !truncatedStdout) {
      return successResult({
        output: truncatedStderr,
        type: "stderr",
      });
    }

    return successResult({
      stdout: truncatedStdout,
      stderr: truncatedStderr || undefined,
    });
  } catch (error) {
    if (error instanceof Error) {
      // Handle exec errors which include exit codes
      const execError = error as Error & {
        stdout?: string;
        stderr?: string;
        code?: number;
        killed?: boolean;
      };

      if (execError.killed) {
        logger.warn("Command timed out", { command });
        return errorResult(
          `Command timed out after ${COMMAND_TIMEOUT_MS / 1000} seconds`,
          {
            stdout: truncateOutput(execError.stdout ?? "", MAX_OUTPUT_SIZE),
            stderr: truncateOutput(execError.stderr ?? "", MAX_OUTPUT_SIZE),
          }
        );
      }

      logger.error("Command execution failed", {
        command,
        error: execError.message,
        exitCode: execError.code,
      });

      // Include stderr in the error message so the agent can understand what went wrong
      const stderrContent = truncateOutput(
        execError.stderr ?? "",
        MAX_OUTPUT_SIZE
      );
      const stdoutContent = truncateOutput(
        execError.stdout ?? "",
        MAX_OUTPUT_SIZE
      );

      let errorMessage = `Command failed with exit code ${
        execError.code ?? "unknown"
      }`;
      if (stderrContent) {
        errorMessage += `\n\nError output:\n${stderrContent}`;
      }
      if (stdoutContent) {
        errorMessage += `\n\nStandard output:\n${stdoutContent}`;
      }

      return errorResult(errorMessage, {
        stdout: stdoutContent,
        stderr: stderrContent,
        exitCode: execError.code,
      });
    }

    return errorResult("Unknown error executing command");
  }
}

/**
 * Truncates output to a maximum length with an indicator.
 *
 * @param output - The output string to truncate
 * @param maxLength - Maximum allowed length
 * @returns The truncated string
 */
function truncateOutput(output: string, maxLength: number): string {
  if (output.length <= maxLength) {
    return output;
  }
  return (
    output.substring(0, maxLength) +
    `\n... [Output truncated, ${output.length - maxLength} characters omitted]`
  );
}
