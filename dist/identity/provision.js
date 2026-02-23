/**
 * Automaton SIWE Provisioning
 *
 * Uses the automaton's wallet to authenticate via Sign-In With Ethereum (SIWE)
 * and create an API key for Conway API access.
 * Adapted from conway-mcp/src/cli/provision.ts
 */
import fs from "fs";
import path from "path";
import { SiweMessage } from "siwe";
import { getWallet, getAutomatonDir } from "./wallet.js";
import { ResilientHttpClient } from "../conway/http-client.js";
const httpClient = new ResilientHttpClient();
const DEFAULT_API_URL = "https://api.conway.tech";
/**
 * Load API key from ~/.automaton/config.json if it exists.
 */
export function loadApiKeyFromConfig() {
    const configPath = path.join(getAutomatonDir(), "config.json");
    if (!fs.existsSync(configPath))
        return null;
    try {
        const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        return config.apiKey || null;
    }
    catch {
        return null;
    }
}
/**
 * Save API key and wallet address to ~/.automaton/config.json
 */
function saveConfig(apiKey, walletAddress) {
    const dir = getAutomatonDir();
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    const configPath = path.join(dir, "config.json");
    const config = {
        apiKey,
        walletAddress,
        provisionedAt: new Date().toISOString(),
    };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), {
        mode: 0o600,
    });
}
/**
 * Run the full SIWE provisioning flow:
 * 1. Load wallet
 * 2. Get nonce from Conway API
 * 3. Sign SIWE message
 * 4. Verify signature -> get JWT
 * 5. Create API key
 * 6. Save to config.json
 */
export async function provision(apiUrl) {
    const url = apiUrl || process.env.CONWAY_API_URL || DEFAULT_API_URL;
    // 1. Load wallet
    const { account } = await getWallet();
    const address = account.address;
    // 2. Get nonce
    const nonceResp = await httpClient.request(`${url}/v1/auth/nonce`, {
        method: "POST",
    });
    if (!nonceResp.ok) {
        throw new Error(`Failed to get nonce: ${nonceResp.status} ${await nonceResp.text()}`);
    }
    const { nonce } = (await nonceResp.json());
    // 3. Construct and sign SIWE message
    const siweMessage = new SiweMessage({
        domain: "conway.tech",
        address,
        statement: "Sign in to Conway as an Automaton to provision an API key.",
        uri: `${url}/v1/auth/verify`,
        version: "1",
        chainId: 8453, // Base
        nonce,
        issuedAt: new Date().toISOString(),
    });
    const messageString = siweMessage.prepareMessage();
    const signature = await account.signMessage({ message: messageString });
    // 4. Verify signature -> get JWT
    const verifyResp = await httpClient.request(`${url}/v1/auth/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: messageString, signature }),
    });
    if (!verifyResp.ok) {
        throw new Error(`SIWE verification failed: ${verifyResp.status} ${await verifyResp.text()}`);
    }
    const { access_token } = (await verifyResp.json());
    // 5. Create API key
    const keyResp = await httpClient.request(`${url}/v1/auth/api-keys`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${access_token}`,
        },
        body: JSON.stringify({ name: "conway-automaton" }),
    });
    if (!keyResp.ok) {
        throw new Error(`Failed to create API key: ${keyResp.status} ${await keyResp.text()}`);
    }
    const { key, key_prefix } = (await keyResp.json());
    // 6. Save to config
    saveConfig(key, address);
    return { apiKey: key, walletAddress: address, keyPrefix: key_prefix };
}
/**
 * Register the automaton's creator as its parent with Conway.
 * This allows the creator to see automaton logs and inference calls.
 */
export async function registerParent(creatorAddress, apiUrl) {
    const url = apiUrl || process.env.CONWAY_API_URL || DEFAULT_API_URL;
    const apiKey = loadApiKeyFromConfig();
    if (!apiKey) {
        throw new Error("Must provision API key before registering parent");
    }
    const resp = await httpClient.request(`${url}/v1/automaton/register-parent`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: apiKey,
        },
        body: JSON.stringify({ creatorAddress }),
    });
    // Endpoint may not exist yet -- fail gracefully
    if (!resp.ok && resp.status !== 404) {
        throw new Error(`Failed to register parent: ${resp.status} ${await resp.text()}`);
    }
}
//# sourceMappingURL=provision.js.map