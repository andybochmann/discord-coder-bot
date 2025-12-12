import path from "node:path";
import { config } from "../config.js";
import { createChildLogger } from "../logger.js";
import type { Logger } from "winston";

/**
 * Represents a user's active session with the bot.
 * Tracks the current working directory and project context.
 */
export interface SessionData {
  /** The Discord user ID */
  userId: string;
  /** The current working directory for this session */
  workingDirectory: string;
  /** Timestamp when the session was created */
  createdAt: Date;
  /** Timestamp of the last activity */
  lastActivityAt: Date;
  /** Optional project name if set */
  projectName?: string;
}

/**
 * Manages user sessions for the Discord bot.
 * Each user can have one active session that tracks their working directory.
 *
 * @example
 * const sessionManager = new SessionManager();
 * const session = sessionManager.getOrCreateSession('user123');
 * sessionManager.setWorkingDirectory('user123', '/app/workspace/my-project');
 */
export class SessionManager {
  private _sessions = new Map<string, SessionData>();
  private _sessionTimeout: number;
  private _logger: Logger;

  /**
   * Creates a new SessionManager instance.
   *
   * @param sessionTimeoutMs - Session timeout in milliseconds (default: 1 hour)
   */
  constructor(sessionTimeoutMs: number = 60 * 60 * 1000) {
    this._sessionTimeout = sessionTimeoutMs;
    this._logger = createChildLogger({ component: "SessionManager" });
  }

  /**
   * Gets an existing session or creates a new one for the user.
   *
   * @param userId - The Discord user ID
   * @returns The user's session data
   *
   * @example
   * const session = sessionManager.getOrCreateSession('user123');
   * console.log(session.workingDirectory);
   */
  public getOrCreateSession(userId: string): SessionData {
    const existing = this._sessions.get(userId);

    if (existing) {
      // Update last activity
      existing.lastActivityAt = new Date();
      return existing;
    }

    // Create new session with default workspace root
    const session: SessionData = {
      userId,
      workingDirectory: config.WORKSPACE_ROOT,
      createdAt: new Date(),
      lastActivityAt: new Date(),
    };

    this._sessions.set(userId, session);
    this._logger.info("Created new session", { userId });

    return session;
  }

  /**
   * Gets a session for the user if it exists.
   *
   * @param userId - The Discord user ID
   * @returns The session data or undefined if not found
   */
  public getSession(userId: string): SessionData | undefined {
    const session = this._sessions.get(userId);

    if (session) {
      // Check if session has expired
      const now = new Date().getTime();
      const lastActivity = session.lastActivityAt.getTime();

      if (now - lastActivity > this._sessionTimeout) {
        this._logger.info("Session expired", { userId });
        this._sessions.delete(userId);
        return undefined;
      }

      // Update last activity
      session.lastActivityAt = new Date();
    }

    return session;
  }

  /**
   * Sets the working directory for a user's session.
   *
   * @param userId - The Discord user ID
   * @param directory - The new working directory (must be within workspace root)
   * @returns True if the directory was set, false if invalid
   *
   * @example
   * const success = sessionManager.setWorkingDirectory('user123', '/app/workspace/project');
   */
  public setWorkingDirectory(userId: string, directory: string): boolean {
    const session = this.getOrCreateSession(userId);

    // Validate the directory is within the workspace
    const normalizedDir = path.resolve(directory);
    const normalizedWorkspace = path.resolve(config.WORKSPACE_ROOT);

    if (!normalizedDir.startsWith(normalizedWorkspace)) {
      this._logger.warn(
        "Attempted to set working directory outside workspace",
        {
          userId,
          directory: normalizedDir,
          workspace: normalizedWorkspace,
        }
      );
      return false;
    }

    session.workingDirectory = normalizedDir;
    session.lastActivityAt = new Date();

    this._logger.info("Updated working directory", {
      userId,
      directory: normalizedDir,
    });

    return true;
  }

  /**
   * Sets the project name for a user's session.
   *
   * @param userId - The Discord user ID
   * @param projectName - The project name
   *
   * @example
   * sessionManager.setProjectName('user123', 'my-awesome-project');
   */
  public setProjectName(userId: string, projectName: string): void {
    const session = this.getOrCreateSession(userId);
    session.projectName = projectName;
    session.lastActivityAt = new Date();

    this._logger.info("Updated project name", { userId, projectName });
  }

  /**
   * Creates a new project directory for the user.
   *
   * @param userId - The Discord user ID
   * @param projectName - The name of the new project
   * @returns The full path to the new project directory
   *
   * @example
   * const projectPath = sessionManager.createProjectPath('user123', 'my-project');
   * // Returns: '/app/workspace/my-project'
   */
  public createProjectPath(userId: string, projectName: string): string {
    // Sanitize project name
    const sanitizedName = projectName
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    const projectPath = path.join(config.WORKSPACE_ROOT, sanitizedName);

    // Update session
    const session = this.getOrCreateSession(userId);
    session.workingDirectory = projectPath;
    session.projectName = sanitizedName;
    session.lastActivityAt = new Date();

    this._logger.info("Created project path", {
      userId,
      projectName: sanitizedName,
      path: projectPath,
    });

    return projectPath;
  }

  /**
   * Removes a user's session.
   *
   * @param userId - The Discord user ID
   * @returns True if a session was removed
   */
  public removeSession(userId: string): boolean {
    const existed = this._sessions.has(userId);
    this._sessions.delete(userId);

    if (existed) {
      this._logger.info("Removed session", { userId });
    }

    return existed;
  }

  /**
   * Gets all active sessions.
   *
   * @returns Array of all active session data
   */
  public getAllSessions(): SessionData[] {
    return Array.from(this._sessions.values());
  }

  /**
   * Cleans up expired sessions.
   *
   * @returns The number of sessions cleaned up
   */
  public cleanupExpiredSessions(): number {
    const now = new Date().getTime();
    let cleaned = 0;

    for (const [userId, session] of this._sessions) {
      const lastActivity = session.lastActivityAt.getTime();

      if (now - lastActivity > this._sessionTimeout) {
        this._sessions.delete(userId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this._logger.info("Cleaned up expired sessions", { count: cleaned });
    }

    return cleaned;
  }
}

/**
 * Singleton instance of the SessionManager for application-wide use.
 */
export const sessionManager = new SessionManager();
