import { describe, it, expect, beforeEach, vi } from "vitest";
import { SessionManager } from "../src/agent/Session.js";

// Mock the config module
vi.mock("../src/config.js", () => ({
  config: {
    WORKSPACE_ROOT: "/app/workspace",
    LOG_LEVEL: "error",
  },
}));

// Mock the logger
vi.mock("../src/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  createChildLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe("SessionManager", () => {
  let sessionManager: SessionManager;

  beforeEach(() => {
    sessionManager = new SessionManager();
  });

  describe("getOrCreateSession", () => {
    it("should create a new session for a new user", () => {
      const session = sessionManager.getOrCreateSession("user123");

      expect(session.userId).toBe("user123");
      expect(session.workingDirectory).toBe("/app/workspace");
      expect(session.createdAt).toBeInstanceOf(Date);
      expect(session.lastActivityAt).toBeInstanceOf(Date);
    });

    it("should return existing session for known user", () => {
      const session1 = sessionManager.getOrCreateSession("user123");
      const session2 = sessionManager.getOrCreateSession("user123");

      expect(session1.createdAt.getTime()).toBe(session2.createdAt.getTime());
    });

    it("should update lastActivityAt on access", () => {
      const session1 = sessionManager.getOrCreateSession("user123");
      const firstActivity = session1.lastActivityAt;

      // Wait a small amount of time
      const session2 = sessionManager.getOrCreateSession("user123");

      expect(session2.lastActivityAt.getTime()).toBeGreaterThanOrEqual(
        firstActivity.getTime()
      );
    });
  });

  describe("setWorkingDirectory", () => {
    it("should update working directory within workspace", () => {
      sessionManager.getOrCreateSession("user123");

      const result = sessionManager.setWorkingDirectory(
        "user123",
        "/app/workspace/project"
      );

      expect(result).toBe(true);

      const session = sessionManager.getSession("user123");
      expect(session?.workingDirectory).toContain("workspace");
    });

    it("should reject directories outside workspace", () => {
      sessionManager.getOrCreateSession("user123");

      const result = sessionManager.setWorkingDirectory(
        "user123",
        "/etc/passwd"
      );

      expect(result).toBe(false);
    });
  });

  describe("createProjectPath", () => {
    it("should create a sanitized project path", () => {
      const path = sessionManager.createProjectPath(
        "user123",
        "My Cool Project!"
      );

      expect(path).toMatch(/my-cool-project/);
    });

    it("should update session with new project info", () => {
      sessionManager.createProjectPath("user123", "test-project");

      const session = sessionManager.getSession("user123");
      expect(session?.projectName).toBe("test-project");
    });
  });

  describe("removeSession", () => {
    it("should remove existing session", () => {
      sessionManager.getOrCreateSession("user123");

      const result = sessionManager.removeSession("user123");

      expect(result).toBe(true);
      expect(sessionManager.getSession("user123")).toBeUndefined();
    });

    it("should return false for non-existent session", () => {
      const result = sessionManager.removeSession("unknown");

      expect(result).toBe(false);
    });
  });

  describe("getAllSessions", () => {
    it("should return all active sessions", () => {
      sessionManager.getOrCreateSession("user1");
      sessionManager.getOrCreateSession("user2");
      sessionManager.getOrCreateSession("user3");

      const sessions = sessionManager.getAllSessions();

      expect(sessions).toHaveLength(3);
    });
  });
});
