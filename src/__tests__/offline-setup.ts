import { vi } from "vitest";

// Network access must be explicitly mocked by each test. In particular, do not
// let incomplete blockchain/provider mocks fall through to public endpoints.
vi.stubGlobal("fetch", vi.fn(() => {
  throw new Error("Network disabled in local tests: mock fetch explicitly");
}));
