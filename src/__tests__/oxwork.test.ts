/**
 * 0xWork Marketplace Client Tests
 *
 * All HTTP goes through moatFetch, which POSTs to globalThis.fetch (the Moat
 * Gateway). We mock globalThis.fetch to return a wrapped gateway response so
 * we can exercise every code path without real network access.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { PrivateKeyAccount } from "viem";
import {
  oxworkAuth,
  browseOpenTasks,
  getTaskDetail,
  claimTask,
  submitWork,
  getMyTasks,
  type OxworkTask,
  type OxworkAuth,
} from "../conway/oxwork.js";

// ─── Moat Gateway Response Helpers ──────────────────────────────

/**
 * Wrap an API body in the Moat Gateway envelope that moatFetch unpacks.
 * The outer fetch() always returns HTTP 200; the inner status_code is what
 * moatFetch.ok reflects.
 */
function moatResponse(body: unknown, statusCode = 200): Response {
  return new Response(
    JSON.stringify({
      status: "ok",
      result: {
        ok: statusCode >= 200 && statusCode < 400,
        status_code: statusCode,
        headers: {},
        body,
        content_type: "application/json",
      },
    }),
    { status: 200 },
  );
}

/**
 * Simulate the Moat Gateway itself failing (non-200 outer response).
 */
function moatGatewayError(statusCode = 502): Response {
  return new Response("Bad Gateway", { status: statusCode });
}

// ─── Fixtures ───────────────────────────────────────────────────

const SAMPLE_TASK: OxworkTask = {
  id: "task-abc-123",
  title: "Write TypeScript SDK",
  description: "Build a typed client for the 0xWork REST API.",
  category: "engineering",
  bountyUsd: 500,
  status: "open",
  deadlineAt: "2026-04-01T00:00:00.000Z",
  createdAt: "2026-03-01T00:00:00.000Z",
  poster: "0xPosterAddress",
};

const SAMPLE_AUTH: OxworkAuth = {
  address: "0xWorkerAddress",
  nonce: "nonce-xyz-789",
  signature: "0xSignatureHex",
};

function makeAccount(overrides?: Partial<PrivateKeyAccount>): PrivateKeyAccount {
  return {
    address: "0xWorkerAddress" as `0x${string}`,
    signMessage: vi.fn().mockResolvedValue("0xSignatureHex"),
    ...overrides,
  } as unknown as PrivateKeyAccount;
}

// ─── Test Suite ─────────────────────────────────────────────────

describe("0xWork Marketplace Client", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── oxworkAuth ───────────────────────────────────────────────

  describe("oxworkAuth", () => {
    it("fetches nonce, signs, and returns auth object", async () => {
      mockFetch.mockResolvedValueOnce(
        moatResponse({ nonce: "nonce-xyz-789" }),
      );

      const account = makeAccount();
      const auth = await oxworkAuth(account);

      expect(auth.address).toBe("0xWorkerAddress");
      expect(auth.nonce).toBe("nonce-xyz-789");
      expect(auth.signature).toBe("0xSignatureHex");

      // Verify signMessage was called with the correct EIP-191 message
      expect(account.signMessage).toHaveBeenCalledWith({
        message: "Sign in to 0xWork\nNonce: nonce-xyz-789",
      });
    });

    it("includes the wallet address in the nonce request URL", async () => {
      mockFetch.mockResolvedValueOnce(
        moatResponse({ nonce: "nonce-abc" }),
      );

      const account = makeAccount({ address: "0xMyWallet" as `0x${string}` });
      await oxworkAuth(account);

      // The fetch call goes to the Moat Gateway; the target URL is embedded in
      // the POST body that moatFetch serialises.
      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.params.url).toContain("address=0xMyWallet");
    });

    it("throws when the nonce response is missing the nonce field", async () => {
      mockFetch.mockResolvedValueOnce(moatResponse({}));

      const account = makeAccount();
      await expect(oxworkAuth(account)).rejects.toThrow(
        "Failed to get nonce from 0xWork",
      );
    });

    it("throws when the nonce endpoint returns a 500 error", async () => {
      mockFetch.mockResolvedValueOnce(
        moatResponse({ error: "Internal Server Error" }, 500),
      );

      const account = makeAccount();
      await expect(oxworkAuth(account)).rejects.toThrow(
        "Failed to get nonce from 0xWork",
      );
    });
  });

  // ── browseOpenTasks ──────────────────────────────────────────

  describe("browseOpenTasks", () => {
    it("returns a list of tasks on success", async () => {
      mockFetch.mockResolvedValueOnce(moatResponse([SAMPLE_TASK]));

      const tasks = await browseOpenTasks();

      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe("task-abc-123");
      expect(tasks[0].bountyUsd).toBe(500);
      expect(tasks[0].status).toBe("open");
    });

    it("appends filter params to the request URL", async () => {
      mockFetch.mockResolvedValueOnce(moatResponse([]));

      await browseOpenTasks({
        category: "engineering",
        minBounty: 100,
        maxBounty: 1000,
      });

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      const url: string = body.params.url;

      expect(url).toContain("status=open");
      expect(url).toContain("category=engineering");
      expect(url).toContain("min_bounty=100");
      expect(url).toContain("max_bounty=1000");
    });

    it("always sets status=open in the query string", async () => {
      mockFetch.mockResolvedValueOnce(moatResponse([]));

      await browseOpenTasks({ category: "design" });

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.params.url).toContain("status=open");
    });

    it("returns an empty array when the API returns null body", async () => {
      // moatFetchJSON returns null when status is non-2xx; moatResponse with 404
      mockFetch.mockResolvedValueOnce(moatResponse({ error: "not found" }, 404));

      const tasks = await browseOpenTasks();
      expect(tasks).toEqual([]);
    });

    it("returns an empty array when the API returns an empty list", async () => {
      mockFetch.mockResolvedValueOnce(moatResponse([]));

      const tasks = await browseOpenTasks();
      expect(tasks).toEqual([]);
    });
  });

  // ── getTaskDetail ────────────────────────────────────────────

  describe("getTaskDetail", () => {
    it("returns task details for a valid task ID", async () => {
      mockFetch.mockResolvedValueOnce(moatResponse(SAMPLE_TASK));

      const task = await getTaskDetail("task-abc-123");

      expect(task).not.toBeNull();
      expect(task!.id).toBe("task-abc-123");
      expect(task!.title).toBe("Write TypeScript SDK");
      expect(task!.category).toBe("engineering");
    });

    it("includes the task ID in the request URL", async () => {
      mockFetch.mockResolvedValueOnce(moatResponse(SAMPLE_TASK));

      await getTaskDetail("task-abc-123");

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.params.url).toContain("/tasks/task-abc-123");
    });

    it("returns null for a 404 response", async () => {
      mockFetch.mockResolvedValueOnce(
        moatResponse({ error: "Task not found" }, 404),
      );

      const task = await getTaskDetail("nonexistent-id");
      expect(task).toBeNull();
    });

    it("returns null when the Moat Gateway itself fails", async () => {
      mockFetch.mockResolvedValueOnce(moatGatewayError(502));

      const task = await getTaskDetail("task-abc-123");
      expect(task).toBeNull();
    });
  });

  // ── claimTask ────────────────────────────────────────────────

  describe("claimTask", () => {
    it("returns success: true on a 200 response", async () => {
      mockFetch.mockResolvedValueOnce(
        moatResponse({ claimed: true }),
      );

      const result = await claimTask("task-abc-123", SAMPLE_AUTH);

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("sends auth headers in the request", async () => {
      mockFetch.mockResolvedValueOnce(moatResponse({ claimed: true }));

      await claimTask("task-abc-123", SAMPLE_AUTH);

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.params.headers["X-Address"]).toBe(SAMPLE_AUTH.address);
      expect(body.params.headers["X-Nonce"]).toBe(SAMPLE_AUTH.nonce);
      expect(body.params.headers["X-Signature"]).toBe(SAMPLE_AUTH.signature);
    });

    it("uses POST method for the claim request", async () => {
      mockFetch.mockResolvedValueOnce(moatResponse({ claimed: true }));

      await claimTask("task-abc-123", SAMPLE_AUTH);

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.params.method).toBe("POST");
    });

    it("returns success: false with error message on 409 conflict", async () => {
      mockFetch.mockResolvedValueOnce(
        moatResponse({ error: "Task already claimed" }, 409),
      );

      const result = await claimTask("task-abc-123", SAMPLE_AUTH);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Task already claimed");
    });

    it("returns success: false with message field fallback on 409", async () => {
      mockFetch.mockResolvedValueOnce(
        moatResponse({ message: "Conflict: task is taken" }, 409),
      );

      const result = await claimTask("task-abc-123", SAMPLE_AUTH);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Conflict: task is taken");
    });

    it("returns success: false with HTTP status fallback on 401", async () => {
      mockFetch.mockResolvedValueOnce(
        moatResponse({}, 401),
      );

      const result = await claimTask("task-abc-123", SAMPLE_AUTH);

      expect(result.success).toBe(false);
      expect(result.error).toBe("HTTP 401");
    });
  });

  // ── submitWork ───────────────────────────────────────────────

  describe("submitWork", () => {
    it("returns success: true on a 200 response", async () => {
      mockFetch.mockResolvedValueOnce(moatResponse({ submitted: true }));

      const result = await submitWork(
        "task-abc-123",
        "https://github.com/worker/pr/42",
        "Implemented typed SDK with full test coverage.",
        SAMPLE_AUTH,
      );

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("sends delivery_link and description in the request body", async () => {
      mockFetch.mockResolvedValueOnce(moatResponse({ submitted: true }));

      await submitWork(
        "task-abc-123",
        "https://github.com/worker/pr/42",
        "Completed.",
        SAMPLE_AUTH,
      );

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const envelope = JSON.parse(init.body as string);
      expect(envelope.params.body.delivery_link).toBe(
        "https://github.com/worker/pr/42",
      );
      expect(envelope.params.body.description).toBe("Completed.");
    });

    it("includes the task ID in the submit URL", async () => {
      mockFetch.mockResolvedValueOnce(moatResponse({ submitted: true }));

      await submitWork("task-abc-123", "https://example.com", "Done.", SAMPLE_AUTH);

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const envelope = JSON.parse(init.body as string);
      expect(envelope.params.url).toContain("/tasks/task-abc-123/submit");
    });

    it("returns success: false with error on 422 validation error", async () => {
      mockFetch.mockResolvedValueOnce(
        moatResponse(
          { error: "delivery_link must be a valid URL" },
          422,
        ),
      );

      const result = await submitWork(
        "task-abc-123",
        "not-a-url",
        "Oops.",
        SAMPLE_AUTH,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("delivery_link must be a valid URL");
    });

    it("returns success: false with message fallback on 422", async () => {
      mockFetch.mockResolvedValueOnce(
        moatResponse({ message: "Validation failed" }, 422),
      );

      const result = await submitWork(
        "task-abc-123",
        "not-a-url",
        "Oops.",
        SAMPLE_AUTH,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Validation failed");
    });

    it("sends auth headers on the submit request", async () => {
      mockFetch.mockResolvedValueOnce(moatResponse({ submitted: true }));

      await submitWork("task-abc-123", "https://example.com", "Done.", SAMPLE_AUTH);

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const envelope = JSON.parse(init.body as string);
      expect(envelope.params.headers["X-Signature"]).toBe(SAMPLE_AUTH.signature);
    });
  });

  // ── getMyTasks ───────────────────────────────────────────────

  describe("getMyTasks", () => {
    it("returns tasks claimed by the given address", async () => {
      const claimedTask: OxworkTask = {
        ...SAMPLE_TASK,
        status: "claimed",
        claimedBy: "0xWorkerAddress",
      };
      mockFetch.mockResolvedValueOnce(moatResponse([claimedTask]));

      const tasks = await getMyTasks("0xWorkerAddress");

      expect(tasks).toHaveLength(1);
      expect(tasks[0].status).toBe("claimed");
      expect(tasks[0].claimedBy).toBe("0xWorkerAddress");
    });

    it("includes the worker address in the request URL", async () => {
      mockFetch.mockResolvedValueOnce(moatResponse([]));

      await getMyTasks("0xWorkerAddress");

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.params.url).toContain("/tasks/worker/0xWorkerAddress");
    });

    it("returns an empty array when the worker has no tasks", async () => {
      mockFetch.mockResolvedValueOnce(moatResponse([]));

      const tasks = await getMyTasks("0xWorkerAddress");
      expect(tasks).toEqual([]);
    });

    it("returns an empty array on a 500 server error", async () => {
      mockFetch.mockResolvedValueOnce(
        moatResponse({ error: "Internal Server Error" }, 500),
      );

      const tasks = await getMyTasks("0xWorkerAddress");
      expect(tasks).toEqual([]);
    });

    it("returns an empty array when the Moat Gateway itself fails", async () => {
      mockFetch.mockResolvedValueOnce(moatGatewayError(503));

      const tasks = await getMyTasks("0xWorkerAddress");
      expect(tasks).toEqual([]);
    });
  });
});
