/**
 * Tests for the 0xWork API client — conway/oxwork module.
 *
 * Covers: browseOpenTasks, getTaskDetail, oxworkAuth, claimTask,
 * submitWork, getMyTasks.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  browseOpenTasks,
  getTaskDetail,
  oxworkAuth,
  claimTask,
  submitWork,
  getMyTasks,
} from "../conway/oxwork.js";

// ─── Mock fetch ────────────────────────────────────────────────

const originalFetch = globalThis.fetch;

function mockResponse(
  status: number,
  body: unknown = {},
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: new Headers({
      "content-type": "application/json",
      ...headers,
    }),
  });
}

beforeEach(() => {
  globalThis.fetch = vi.fn();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

// ─── Mock data ─────────────────────────────────────────────────

const mockTask = {
  id: 137,
  chain_task_id: 28,
  poster_address: "0x84631A26Fab1525449063c7Dce50019c6CeeDc9C",
  worker_address: null,
  description: "Write a 500+ word article about AI agents",
  category: "Writing",
  bounty_amount: "20.0",
  deadline: Math.floor(Date.now() / 1000) + 86400 * 7,
  status: "Open",
  delivery_link: null,
  delivery_description: null,
  created_at: new Date().toISOString(),
};

const mockClaimedTask = {
  ...mockTask,
  id: 200,
  chain_task_id: 45,
  worker_address: "0x1234567890abcdef1234567890abcdef12345678",
  status: "Claimed",
};

const mockCompletedTask = {
  ...mockTask,
  id: 201,
  chain_task_id: 46,
  worker_address: "0x1234567890abcdef1234567890abcdef12345678",
  status: "Completed",
  delivery_link: "https://example.com/delivery",
  delivery_description: "Article delivered as requested",
};

const mockAuth = {
  address: "0x1234567890abcdef1234567890abcdef12345678",
  signature: "0xsigned",
  nonce: "nonce-123",
};

// ─── Tests ─────────────────────────────────────────────────────

describe("browseOpenTasks", () => {
  it("returns open tasks with no filters", async () => {
    const tasks = [mockTask, { ...mockTask, id: 138, category: "Development" }];

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockResponse(200, tasks),
    );

    const result = await browseOpenTasks();

    expect(result).toEqual(tasks);
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    const callUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(callUrl).toContain("/tasks?");
    expect(callUrl).toContain("status=open");
  });

  it("filters by category", async () => {
    const tasks = [mockTask];

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockResponse(200, tasks),
    );

    const result = await browseOpenTasks({ category: "Writing" });

    expect(result).toEqual(tasks);
    const callUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(callUrl).toContain("category=Writing");
  });

  it("filters by bounty range", async () => {
    const tasks = [mockTask];

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockResponse(200, tasks),
    );

    const result = await browseOpenTasks({ minBounty: 10, maxBounty: 50 });

    expect(result).toEqual(tasks);
    const callUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(callUrl).toContain("min_bounty=10");
    expect(callUrl).toContain("max_bounty=50");
  });

  it("handles empty results", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockResponse(200, []),
    );

    const result = await browseOpenTasks();

    expect(result).toEqual([]);
  });

  it("handles API errors gracefully", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockResponse(500, { error: "Internal server error" }),
    );

    await expect(browseOpenTasks()).rejects.toThrow("Failed to browse tasks: HTTP 500");
  });
});

describe("getTaskDetail", () => {
  it("returns full task detail", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockResponse(200, mockTask),
    );

    const result = await getTaskDetail(137);

    expect(result).toEqual(mockTask);
    const callUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(callUrl).toContain("/tasks/137");
  });

  it("handles non-existent task (404)", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockResponse(404, { error: "Task not found" }),
    );

    await expect(getTaskDetail(99999)).rejects.toThrow("Failed to get task 99999: HTTP 404");
  });
});

describe("oxworkAuth", () => {
  it("gets nonce and signs it with account", async () => {
    const mockNonce = "abc123-nonce-value";

    // Nonce endpoint
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockResponse(200, { nonce: mockNonce }),
    );

    const mockAccount = {
      address: "0x1234567890abcdef1234567890abcdef12345678" as const,
      signMessage: vi.fn().mockResolvedValue("0xsigned-message-hex"),
    } as unknown as import("viem").PrivateKeyAccount;

    const result = await oxworkAuth(mockAccount);

    expect(result.address).toBe(mockAccount.address);
    expect(result.nonce).toBe(mockNonce);
    expect(result.signature).toBe("0xsigned-message-hex");
    expect(mockAccount.signMessage).toHaveBeenCalledWith({ message: mockNonce });

    const callUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(callUrl).toContain("/auth/nonce");
    expect(callUrl).toContain(mockAccount.address);
  });

  it("throws on nonce fetch failure", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockResponse(500, { error: "Server error" }),
    );

    const mockAccount = {
      address: "0xabcdef1234567890abcdef1234567890abcdef12" as const,
      signMessage: vi.fn(),
    } as unknown as import("viem").PrivateKeyAccount;

    await expect(oxworkAuth(mockAccount)).rejects.toThrow("Failed to fetch nonce: HTTP 500");
    expect(mockAccount.signMessage).not.toHaveBeenCalled();
  });
});

describe("claimTask", () => {
  it("successfully claims a task", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockResponse(200, mockClaimedTask),
    );

    const result = await claimTask(137, mockAuth);

    expect(result.status).toBe("Claimed");
    expect(result.worker_address).toBe(mockAuth.address);

    const [url, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("/tasks/137/claim");
    expect(options.method).toBe("POST");
    expect(options.headers["X-Address"]).toBe(mockAuth.address);
    expect(options.headers["X-Nonce"]).toBe(mockAuth.nonce);
    expect(options.headers["X-Signature"]).toBe(mockAuth.signature);
  });

  it("handles already-claimed task error", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockResponse(409, { error: "Task already claimed by another worker" }),
    );

    await expect(claimTask(137, mockAuth)).rejects.toThrow("Failed to claim task 137: HTTP 409");
  });

  it("rejects with invalid auth (401)", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockResponse(401, { error: "Invalid or expired authentication" }),
    );

    const badAuth = { address: "", signature: "", nonce: "" };

    await expect(claimTask(137, badAuth)).rejects.toThrow("Failed to claim task 137: HTTP 401");
  });
});

describe("submitWork", () => {
  it("successfully submits work", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockResponse(200, mockCompletedTask),
    );

    const result = await submitWork(
      137,
      "https://example.com/delivery",
      "Article delivered as requested",
      mockAuth,
    );

    expect(result.status).toBe("Completed");
    expect(result.delivery_link).toBe("https://example.com/delivery");
    expect(result.delivery_description).toBe("Article delivered as requested");

    const [url, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("/tasks/137/submit");
    expect(options.method).toBe("POST");
    const body = JSON.parse(options.body as string);
    expect(body.delivery_link).toBe("https://example.com/delivery");
    expect(body.delivery_description).toBe("Article delivered as requested");
  });

  it("handles validation errors", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockResponse(422, {
        error: "Validation failed",
        details: { delivery_link: "Must be a valid URL" },
      }),
    );

    await expect(
      submitWork(137, "not-a-url", "", mockAuth),
    ).rejects.toThrow("Failed to submit work for task 137: HTTP 422");
  });
});

describe("getMyTasks", () => {
  const mockWorkerAddress = "0x1234567890abcdef1234567890abcdef12345678";

  it("returns tasks for worker address", async () => {
    const tasks = [mockClaimedTask, mockCompletedTask];

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockResponse(200, tasks),
    );

    const result = await getMyTasks(mockWorkerAddress);

    expect(result).toEqual(tasks);
    expect(result).toHaveLength(2);
    const callUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(callUrl).toContain(`/tasks/worker/${mockWorkerAddress}`);
  });

  it("returns empty array for address with no tasks", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      mockResponse(200, []),
    );

    const result = await getMyTasks("0x0000000000000000000000000000000000000000");

    expect(result).toEqual([]);
    expect(result).toHaveLength(0);
  });
});
