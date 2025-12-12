import { exec } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import type { AgentTool, ToolResult } from "../interfaces/Tool.js";
import { successResult, errorResult } from "../interfaces/Tool.js";
import { logger } from "../logger.js";
import { config } from "../config.js";
import { Type } from "@google/genai";

const execAsync = promisify(exec);

/** Base URL for Vercel API */
const VERCEL_API_BASE = "https://api.vercel.com";

/** Maximum execution time for Vercel deployments (10 minutes) */
const DEPLOY_TIMEOUT_MS = 600000;

/** Maximum output size in characters */
const MAX_OUTPUT_SIZE = 50000;

/**
 * Parameters for the deploy_to_vercel tool.
 */
interface VercelToolParams {
  /** Path to the project directory to deploy */
  projectPath: string;
  /** Whether to deploy to production (default: false for preview) */
  production?: boolean;
  /** Optional project name (auto-generated if not provided) */
  projectName?: string;
  /** Skip cleanup of old deployments (default: false - will delete old deployments) */
  skipCleanup?: boolean;
}

/**
 * Vercel deployment object from the API.
 */
interface VercelDeployment {
  uid: string;
  name: string;
  url: string;
  state: string;
  created: number;
}

/**
 * Vercel deployments list response from the API.
 */
interface VercelDeploymentsResponse {
  deployments: VercelDeployment[];
}

/**
 * Parameters for the delete_vercel_project tool.
 */
interface DeleteVercelProjectParams {
  /** The name or ID of the Vercel project to delete */
  projectNameOrId: string;
}

/**
 * Creates the Vercel deployment tool for hosting web applications.
 * Returns null if no Vercel token is configured.
 *
 * @param workingDirectory - The default working directory
 * @returns An AgentTool for deploying to Vercel, or null if no token configured
 *
 * @example
 * const vercelTool = createVercelTool('/app/workspace');
 * if (vercelTool) {
 *   const result = await vercelTool.execute({ projectPath: './my-app' });
 * }
 */
export function createVercelTool(
  workingDirectory: string
): AgentTool<VercelToolParams> | null {
  if (!config.VERCEL_TOKEN) {
    logger.info("Vercel token not configured, deployment tool disabled");
    return null;
  }

  return {
    name: "deploy_to_vercel",
    description:
      "Deploy a web application to Vercel hosting. Returns the live URL where the app can be accessed. " +
      "Use preview deployments by default (unique URL per deploy), or set production=true for stable production URLs. " +
      "Supports React, Next.js, Vue, Svelte, static sites, and most web frameworks.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        projectPath: {
          type: Type.STRING,
          description:
            "Path to the project directory to deploy (relative to workspace or absolute within workspace)",
        },
        production: {
          type: Type.BOOLEAN,
          description:
            "Set to true for production deployment with stable URL. Default is false (preview deployment with unique URL per deploy).",
        },
        projectName: {
          type: Type.STRING,
          description:
            "Optional name for the Vercel project. If not provided, will be auto-generated from the directory name.",
        },
        skipCleanup: {
          type: Type.BOOLEAN,
          description:
            "Set to true to skip deleting old deployments before deploying. Default is false (old deployments will be deleted to keep things clean).",
        },
      },
      required: ["projectPath"],
    },
    execute: async (args: VercelToolParams): Promise<ToolResult> => {
      return deployToVercel(args, workingDirectory);
    },
  };
}

/**
 * Deploys a project to Vercel hosting.
 *
 * @param args - Deployment parameters
 * @param workingDirectory - The working directory for resolving relative paths
 * @returns The deployment result including the live URL
 */
async function deployToVercel(
  args: VercelToolParams,
  workingDirectory: string
): Promise<ToolResult> {
  const {
    projectPath,
    production = false,
    projectName,
    skipCleanup = false,
  } = args;

  // Resolve the project path
  const normalizedWorkspace = path.resolve(config.WORKSPACE_ROOT);
  let resolvedPath: string;

  if (path.isAbsolute(projectPath)) {
    resolvedPath = path.resolve(projectPath);
  } else {
    // Resolve relative to working directory
    resolvedPath = path.resolve(workingDirectory, projectPath);
  }

  // Validate path is within workspace
  if (!resolvedPath.startsWith(normalizedWorkspace)) {
    logger.warn("Attempted to deploy project outside workspace", {
      projectPath: resolvedPath,
      workspace: normalizedWorkspace,
    });
    return errorResult(
      `Project path must be within the workspace: ${config.WORKSPACE_ROOT}. ` +
        `Use a path relative to the workspace.`
    );
  }

  // Determine the effective project name for cleanup
  const effectiveProjectName = projectName
    ? projectName
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
    : path
        .basename(resolvedPath)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-");

  // Clean up old deployments before deploying (unless skipped)
  if (!skipCleanup && effectiveProjectName) {
    const cleanupResult = await cleanupOldDeployments(effectiveProjectName);
    if (cleanupResult.deletedCount > 0) {
      logger.info("Cleaned up old deployments", {
        projectName: effectiveProjectName,
        deletedCount: cleanupResult.deletedCount,
      });
    }
  }

  // Build the Vercel command
  // Note: We already checked config.VERCEL_TOKEN exists in createVercelTool
  const vercelToken = config.VERCEL_TOKEN ?? "";
  const cmdParts = [
    "npx",
    "vercel",
    "--yes", // Auto-confirm prompts
    "--token",
    vercelToken,
  ];

  if (production) {
    cmdParts.push("--prod");
  }

  if (projectName) {
    // Sanitize project name
    const sanitizedName = projectName
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    cmdParts.push("--name", sanitizedName);
  }

  const command = cmdParts.join(" ");

  logger.info("Deploying to Vercel", {
    projectPath: resolvedPath,
    production,
    projectName,
  });

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: resolvedPath,
      timeout: DEPLOY_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_SIZE * 2,
      env: {
        ...process.env,
        // Disable Vercel CLI telemetry
        VERCEL_TELEMETRY_DISABLED: "1",
      },
    });

    // Parse the deployment URL from stdout
    // Vercel CLI outputs the URL as the last line
    const lines = stdout.trim().split("\n");
    const url = lines[lines.length - 1]?.trim();

    if (url && url.startsWith("https://")) {
      logger.info("Vercel deployment successful", { url, production });

      return successResult({
        url,
        production,
        message: production
          ? `Successfully deployed to production: ${url}`
          : `Successfully deployed preview: ${url}`,
        stdout: truncateOutput(stdout.trim(), MAX_OUTPUT_SIZE),
      });
    }

    // If we couldn't find a URL in the last line, try to find it anywhere
    const urlMatch = stdout.match(/https:\/\/[^\s]+\.vercel\.app[^\s]*/);
    if (urlMatch) {
      const foundUrl = urlMatch[0];
      logger.info("Vercel deployment successful", {
        url: foundUrl,
        production,
      });

      return successResult({
        url: foundUrl,
        production,
        message: production
          ? `Successfully deployed to production: ${foundUrl}`
          : `Successfully deployed preview: ${foundUrl}`,
        stdout: truncateOutput(stdout.trim(), MAX_OUTPUT_SIZE),
      });
    }

    // If we couldn't find a URL, still return success with full output
    logger.warn("Deployment completed but could not parse URL", {
      stdout: stdout.substring(0, 500),
    });

    return successResult({
      message: "Deployment completed but could not parse URL from output",
      stdout: truncateOutput(stdout.trim(), MAX_OUTPUT_SIZE),
      stderr: stderr.trim() || undefined,
    });
  } catch (error) {
    if (error instanceof Error) {
      const execError = error as Error & {
        stdout?: string;
        stderr?: string;
        code?: number;
        killed?: boolean;
      };

      if (execError.killed) {
        logger.error("Vercel deployment timed out", {
          projectPath: resolvedPath,
        });
        return errorResult("Deployment timed out after 10 minutes", {
          stdout: truncateOutput(execError.stdout ?? "", MAX_OUTPUT_SIZE),
          stderr: truncateOutput(execError.stderr ?? "", MAX_OUTPUT_SIZE),
        });
      }

      logger.error("Vercel deployment failed", {
        error: execError.message,
        exitCode: execError.code,
        projectPath: resolvedPath,
      });

      const stderrContent = truncateOutput(
        execError.stderr ?? "",
        MAX_OUTPUT_SIZE
      );
      const stdoutContent = truncateOutput(
        execError.stdout ?? "",
        MAX_OUTPUT_SIZE
      );

      let errorMessage = `Deployment failed with exit code ${
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

    return errorResult("Unknown error during deployment");
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

/**
 * Result of cleaning up old deployments.
 */
interface CleanupResult {
  deletedCount: number;
  errors: string[];
}

/**
 * Lists all deployments for a project from the Vercel API.
 *
 * @param projectName - The name of the project to list deployments for
 * @returns Array of deployment objects
 */
async function listProjectDeployments(
  projectName: string
): Promise<VercelDeployment[]> {
  const vercelToken = config.VERCEL_TOKEN ?? "";
  const url = `${VERCEL_API_BASE}/v6/deployments?projectId=${encodeURIComponent(
    projectName
  )}&limit=100`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${vercelToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      logger.warn("Failed to list deployments", {
        projectName,
        status: response.status,
      });
      return [];
    }

    const data = (await response.json()) as VercelDeploymentsResponse;
    return data.deployments ?? [];
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.warn("Error listing deployments", { projectName, error: message });
    return [];
  }
}

/**
 * Deletes a single deployment from Vercel.
 *
 * @param deploymentId - The ID of the deployment to delete
 * @returns True if deletion was successful
 */
async function deleteDeployment(deploymentId: string): Promise<boolean> {
  const vercelToken = config.VERCEL_TOKEN ?? "";
  const url = `${VERCEL_API_BASE}/v13/deployments/${encodeURIComponent(
    deploymentId
  )}`;

  try {
    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${vercelToken}`,
        "Content-Type": "application/json",
      },
    });

    if (response.status === 200 || response.status === 204) {
      return true;
    }

    logger.debug("Failed to delete deployment", {
      deploymentId,
      status: response.status,
    });
    return false;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.debug("Error deleting deployment", { deploymentId, error: message });
    return false;
  }
}

/**
 * Cleans up old deployments for a project before deploying a new one.
 *
 * @param projectName - The name of the project to clean up
 * @returns Result containing count of deleted deployments and any errors
 */
async function cleanupOldDeployments(
  projectName: string
): Promise<CleanupResult> {
  const result: CleanupResult = { deletedCount: 0, errors: [] };

  logger.info("Cleaning up old deployments", { projectName });

  const deployments = await listProjectDeployments(projectName);

  if (deployments.length === 0) {
    logger.debug("No existing deployments found", { projectName });
    return result;
  }

  logger.info("Found existing deployments to clean up", {
    projectName,
    count: deployments.length,
  });

  // Delete all deployments (we'll create a fresh one after)
  for (const deployment of deployments) {
    const success = await deleteDeployment(deployment.uid);
    if (success) {
      result.deletedCount++;
    } else {
      result.errors.push(`Failed to delete deployment ${deployment.uid}`);
    }
  }

  return result;
}

/**
 * Creates the Vercel delete project tool for removing projects from Vercel.
 * Returns null if no Vercel token is configured.
 *
 * @param workingDirectory - The default working directory (not used but kept for consistency)
 * @returns An AgentTool for deleting Vercel projects, or null if no token configured
 *
 * @example
 * const deleteVercelTool = createDeleteVercelProjectTool('/app/workspace');
 * if (deleteVercelTool) {
 *   const result = await deleteVercelTool.execute({ projectNameOrId: 'my-project' });
 * }
 */
export function createDeleteVercelProjectTool(
  _workingDirectory: string
): AgentTool<DeleteVercelProjectParams> | null {
  if (!config.VERCEL_TOKEN) {
    logger.info("Vercel token not configured, delete project tool disabled");
    return null;
  }

  return {
    name: "delete_vercel_project",
    description:
      "Delete a project from Vercel. This permanently removes the project and all its deployments. " +
      "Use the project name or ID to identify which project to delete. " +
      "WARNING: This action is irreversible.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        projectNameOrId: {
          type: Type.STRING,
          description:
            "The name or ID of the Vercel project to delete. This is typically the project name shown in the Vercel dashboard.",
        },
      },
      required: ["projectNameOrId"],
    },
    execute: async (args: DeleteVercelProjectParams): Promise<ToolResult> => {
      return deleteVercelProject(args);
    },
  };
}

/**
 * Deletes a project from Vercel using the Vercel API.
 *
 * @param args - Delete parameters containing the project name or ID
 * @returns The result of the deletion operation
 */
async function deleteVercelProject(
  args: DeleteVercelProjectParams
): Promise<ToolResult> {
  const { projectNameOrId } = args;

  if (!projectNameOrId || projectNameOrId.trim() === "") {
    return errorResult("Project name or ID is required");
  }

  const trimmedProjectNameOrId = projectNameOrId.trim();

  logger.info("Deleting Vercel project", {
    projectNameOrId: trimmedProjectNameOrId,
  });

  try {
    const vercelToken = config.VERCEL_TOKEN ?? "";
    const url = `${VERCEL_API_BASE}/v9/projects/${encodeURIComponent(
      trimmedProjectNameOrId
    )}`;

    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${vercelToken}`,
        "Content-Type": "application/json",
      },
    });

    if (response.status === 204 || response.status === 200) {
      logger.info("Vercel project deleted successfully", {
        projectNameOrId: trimmedProjectNameOrId,
      });

      return successResult({
        message: `Successfully deleted project: ${trimmedProjectNameOrId}`,
        projectNameOrId: trimmedProjectNameOrId,
      });
    }

    if (response.status === 404) {
      logger.warn("Vercel project not found", {
        projectNameOrId: trimmedProjectNameOrId,
      });
      return errorResult(
        `Project not found: ${trimmedProjectNameOrId}. Please verify the project name or ID is correct.`
      );
    }

    if (response.status === 403) {
      logger.error("Forbidden to delete Vercel project", {
        projectNameOrId: trimmedProjectNameOrId,
      });
      return errorResult(
        `Access denied: You don't have permission to delete project '${trimmedProjectNameOrId}'. ` +
          "Ensure your Vercel token has the necessary permissions."
      );
    }

    // Handle other error responses
    let errorBody: string;
    try {
      const errorJson = (await response.json()) as {
        error?: { message?: string };
      };
      errorBody = errorJson.error?.message ?? JSON.stringify(errorJson);
    } catch {
      errorBody = await response.text();
    }

    logger.error("Vercel project deletion failed", {
      projectNameOrId: trimmedProjectNameOrId,
      status: response.status,
      error: errorBody,
    });

    return errorResult(
      `Failed to delete project '${trimmedProjectNameOrId}': ${errorBody} (HTTP ${response.status})`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Error deleting Vercel project", {
      projectNameOrId: trimmedProjectNameOrId,
      error: message,
    });

    return errorResult(`Failed to delete project: ${message}`);
  }
}
