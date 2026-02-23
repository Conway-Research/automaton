/**
 * Conway API Client
 *
 * Communicates with Conway's control plane for sandbox management,
 * credits, and infrastructure operations.
 * Adapted from @aiws/sdk patterns.
 */
import type { ConwayClient } from "../types.js";
interface ConwayClientOptions {
    apiUrl: string;
    apiKey: string;
    sandboxId: string;
}
export declare function createConwayClient(options: ConwayClientOptions): ConwayClient;
export {};
//# sourceMappingURL=client.d.ts.map