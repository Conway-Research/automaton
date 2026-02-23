/**
 * Conway API Client
 *
 * Communicates with Conway's control plane for sandbox management,
 * credits, and infrastructure operations.
 * Adapted from @aiws/sdk patterns.
 */
import { execSync } from "child_process";
import fs from "fs";
import nodePath from "path";
import { ResilientHttpClient } from "./http-client.js";
import { ulid } from "ulid";
export function createConwayClient(options) {
    const { apiUrl, apiKey, sandboxId } = options;
    const httpClient = new ResilientHttpClient();
    async function request(method, path, body, requestOptions) {
        // Conway LB has an intermittent routing bug that returns 404 for valid
        // sandbox endpoints. Retry 404s here (outside ResilientHttpClient) to
        // avoid tripping the circuit breaker on transient routing failures.
        const max404Retries = requestOptions?.retries404 ?? 3;
        for (let attempt = 0; attempt <= max404Retries; attempt++) {
            const resp = await httpClient.request(`${apiUrl}${path}`, {
                method,
                headers: {
                    "Content-Type": "application/json",
                    Authorization: apiKey,
                },
                body: body ? JSON.stringify(body) : undefined,
                idempotencyKey: requestOptions?.idempotencyKey,
            });
            if (resp.status === 404 && attempt < max404Retries) {
                await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
                continue;
            }
            if (!resp.ok) {
                const text = await resp.text();
                const err = new Error(`Conway API error: ${method} ${path} -> ${resp.status}: ${text}`);
                err.status = resp.status;
                err.responseText = text;
                err.method = method;
                err.path = path;
                throw err;
            }
            return resp.headers.get("content-type")?.includes("application/json")
                ? resp.json()
                : resp.text();
        }
        throw new Error("Unreachable");
    }
    // ─── Sandbox Operations (own sandbox) ────────────────────────
    // When sandboxId is empty, automatically fall back to local execution.
    const isLocal = !sandboxId;
    const execLocal = (command, timeout) => {
        try {
            const stdout = execSync(command, {
                timeout: timeout || 30_000,
                encoding: "utf-8",
                maxBuffer: 10 * 1024 * 1024,
                cwd: process.env.HOME || "/root",
            });
            return { stdout: stdout || "", stderr: "", exitCode: 0 };
        }
        catch (err) {
            return {
                stdout: err.stdout || "",
                stderr: err.stderr || err.message || "",
                exitCode: err.status ?? 1,
            };
        }
    };
    const exec = async (command, timeout) => {
        if (isLocal)
            return execLocal(command, timeout);
        try {
            const result = await request("POST", `/v1/sandboxes/${sandboxId}/exec`, { command, timeout }, { idempotencyKey: ulid() });
            return {
                stdout: result.stdout || "",
                stderr: result.stderr || "",
                exitCode: result.exit_code ?? result.exitCode ?? -1,
            };
        }
        catch (err) {
            // SECURITY: Never silently fall back to local execution on auth failure.
            // A 403 indicates a credentials mismatch — falling back to local exec
            // would bypass the sandbox security boundary entirely.
            if (err?.message?.includes("403")) {
                throw new Error(`Conway API authentication failed (403). Sandbox exec refused. ` +
                    `This may indicate a misconfigured or revoked API key. ` +
                    `Command will NOT be executed locally for security reasons.`);
            }
            throw err;
        }
    };
    const resolveLocalPath = (filePath) => filePath.startsWith("~")
        ? nodePath.join(process.env.HOME || "/root", filePath.slice(1))
        : filePath;
    const writeFile = async (filePath, content) => {
        if (isLocal) {
            const resolved = resolveLocalPath(filePath);
            const dir = nodePath.dirname(resolved);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(resolved, content, "utf-8");
            return;
        }
        try {
            await request("POST", `/v1/sandboxes/${sandboxId}/files/upload/json`, {
                path: filePath,
                content,
            });
        }
        catch (err) {
            // SECURITY: Never silently fall back to local FS on auth failure.
            if (err?.message?.includes("403")) {
                throw new Error(`Conway API authentication failed (403). File write refused. ` +
                    `File will NOT be written locally for security reasons.`);
            }
            throw err;
        }
    };
    const readFile = async (filePath) => {
        if (isLocal) {
            return fs.readFileSync(resolveLocalPath(filePath), "utf-8");
        }
        try {
            const result = await request("GET", `/v1/sandboxes/${sandboxId}/files/read?path=${encodeURIComponent(filePath)}`, undefined, { retries404: 0 });
            return typeof result === "string" ? result : result.content || "";
        }
        catch (err) {
            // SECURITY: Never silently fall back to local FS on auth failure.
            if (err?.message?.includes("403")) {
                throw new Error(`Conway API authentication failed (403). File read refused. ` +
                    `File will NOT be read locally for security reasons.`);
            }
            throw err;
        }
    };
    const exposePort = async (port) => {
        if (isLocal) {
            return {
                port,
                publicUrl: `http://localhost:${port}`,
                sandboxId: "local",
            };
        }
        const result = await request("POST", `/v1/sandboxes/${sandboxId}/ports/expose`, { port });
        return {
            port: result.port,
            publicUrl: result.public_url || result.publicUrl || result.url,
            sandboxId,
        };
    };
    const removePort = async (port) => {
        if (isLocal)
            return;
        await request("DELETE", `/v1/sandboxes/${sandboxId}/ports/${port}`);
    };
    // ─── Sandbox Management (other sandboxes) ────────────────────
    const createSandbox = async (options) => {
        const result = await request("POST", "/v1/sandboxes", {
            name: options.name,
            vcpu: options.vcpu || 1,
            memory_mb: options.memoryMb || 512,
            disk_gb: options.diskGb || 5,
            region: options.region,
        });
        return {
            id: result.id || result.sandbox_id,
            status: result.status || "running",
            region: result.region || "",
            vcpu: result.vcpu || options.vcpu || 1,
            memoryMb: result.memory_mb || options.memoryMb || 512,
            diskGb: result.disk_gb || options.diskGb || 5,
            terminalUrl: result.terminal_url,
            createdAt: result.created_at || new Date().toISOString(),
        };
    };
    const deleteSandbox = async (targetId) => {
        await request("DELETE", `/v1/sandboxes/${targetId}`);
    };
    const listSandboxes = async () => {
        const result = await request("GET", "/v1/sandboxes");
        const sandboxes = Array.isArray(result) ? result : result.sandboxes || [];
        return sandboxes.map((s) => ({
            id: s.id || s.sandbox_id,
            status: s.status || "unknown",
            region: s.region || "",
            vcpu: s.vcpu || 0,
            memoryMb: s.memory_mb || 0,
            diskGb: s.disk_gb || 0,
            terminalUrl: s.terminal_url,
            createdAt: s.created_at || "",
        }));
    };
    // ─── Credits ─────────────────────────────────────────────────
    const getCreditsBalance = async () => {
        const result = await request("GET", "/v1/credits/balance");
        return result.balance_cents ?? result.credits_cents ?? 0;
    };
    const getCreditsPricing = async () => {
        const result = await request("GET", "/v1/credits/pricing");
        const tiers = result.tiers || result.pricing || [];
        return tiers.map((t) => ({
            name: t.name || "",
            vcpu: t.vcpu || 0,
            memoryMb: t.memory_mb || 0,
            diskGb: t.disk_gb || 0,
            monthlyCents: t.monthly_cents || 0,
        }));
    };
    const transferCredits = async (toAddress, amountCents, note) => {
        const payload = {
            to_address: toAddress,
            amount_cents: amountCents,
            note,
        };
        const idempotencyKey = ulid();
        const paths = ["/v1/credits/transfer", "/v1/credits/transfers"];
        let lastError = "Unknown transfer error";
        for (const path of paths) {
            const resp = await httpClient.request(`${apiUrl}${path}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: apiKey,
                },
                body: JSON.stringify(payload),
                idempotencyKey,
                retries: 0, // Mutating: do not auto-retry transfers
            });
            if (!resp.ok) {
                const text = await resp.text();
                lastError = `${resp.status}: ${text}`;
                // Try next known endpoint shape before failing.
                if (resp.status === 404)
                    continue;
                throw new Error(`Conway API error: POST ${path} -> ${lastError}`);
            }
            const data = await resp.json().catch(() => ({}));
            return {
                transferId: data.transfer_id || data.id || "",
                status: data.status || "submitted",
                toAddress: data.to_address || toAddress,
                amountCents: data.amount_cents ?? amountCents,
                balanceAfterCents: data.balance_after_cents ?? data.new_balance_cents ?? undefined,
            };
        }
        throw new Error(`Conway API error: POST /v1/credits/transfer -> ${lastError}`);
    };
    // ─── Domains ──────────────────────────────────────────────────
    const searchDomains = async (query, tlds) => {
        const params = new URLSearchParams({ query });
        if (tlds)
            params.set("tlds", tlds);
        const result = await request("GET", `/v1/domains/search?${params}`);
        const results = result.results || result.domains || [];
        return results.map((d) => ({
            domain: d.domain,
            available: d.available ?? d.purchasable ?? false,
            registrationPrice: d.registration_price ?? d.purchase_price,
            renewalPrice: d.renewal_price,
            currency: d.currency || "USD",
        }));
    };
    const registerDomain = async (domain, years = 1) => {
        const result = await request("POST", "/v1/domains/register", {
            domain,
            years,
        });
        return {
            domain: result.domain || domain,
            status: result.status || "registered",
            expiresAt: result.expires_at || result.expiry,
            transactionId: result.transaction_id || result.id,
        };
    };
    const listDnsRecords = async (domain) => {
        const result = await request("GET", `/v1/domains/${encodeURIComponent(domain)}/dns`);
        const records = result.records || result || [];
        return (Array.isArray(records) ? records : []).map((r) => ({
            id: r.id || r.record_id || "",
            type: r.type || "",
            host: r.host || r.name || "",
            value: r.value || r.answer || "",
            ttl: r.ttl,
            distance: r.distance ?? r.priority,
        }));
    };
    const addDnsRecord = async (domain, type, host, value, ttl) => {
        const result = await request("POST", `/v1/domains/${encodeURIComponent(domain)}/dns`, { type, host, value, ttl: ttl || 3600 });
        return {
            id: result.id || result.record_id || "",
            type: result.type || type,
            host: result.host || host,
            value: result.value || value,
            ttl: result.ttl || ttl || 3600,
        };
    };
    const deleteDnsRecord = async (domain, recordId) => {
        await request("DELETE", `/v1/domains/${encodeURIComponent(domain)}/dns/${encodeURIComponent(recordId)}`);
    };
    // ─── Model Discovery ───────────────────────────────────────────
    const listModels = async () => {
        // Try inference.conway.tech first (has availability info), fall back to control plane
        const urls = [
            "https://inference.conway.tech/v1/models",
            `${apiUrl}/v1/models`,
        ];
        for (const url of urls) {
            try {
                const resp = await httpClient.request(url, {
                    headers: { Authorization: apiKey },
                });
                if (!resp.ok)
                    continue;
                const result = (await resp.json());
                const raw = result.data || result.models || [];
                return raw
                    .filter((m) => m.available !== false)
                    .map((m) => ({
                    id: m.id,
                    provider: m.provider || m.owned_by || "unknown",
                    pricing: {
                        inputPerMillion: m.pricing?.input_per_million ??
                            m.pricing?.input_per_1m_tokens_usd ??
                            0,
                        outputPerMillion: m.pricing?.output_per_million ??
                            m.pricing?.output_per_1m_tokens_usd ??
                            0,
                    },
                }));
            }
            catch {
                continue;
            }
        }
        return [];
    };
    const client = {
        exec,
        writeFile,
        readFile,
        exposePort,
        removePort,
        createSandbox,
        deleteSandbox,
        listSandboxes,
        getCreditsBalance,
        getCreditsPricing,
        transferCredits,
        searchDomains,
        registerDomain,
        listDnsRecords,
        addDnsRecord,
        deleteDnsRecord,
        listModels,
    };
    // SECURITY: API credentials are NOT exposed on the client object.
    // If child spawning or other modules need API configuration, pass it
    // explicitly through a dedicated typed interface — never via dynamic getters
    // that any code with a client reference could access.
    return client;
}
//# sourceMappingURL=client.js.map