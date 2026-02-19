/**
 * Social Client Factory
 *
 * Creates a SocialClient for the automaton runtime.
 * Uses ed25519 (tweetnacl) for signing — same as Solana native keys.
 * Messages are signed with the agent's Solana keypair.
 */

import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { createHash } from "crypto";
import type { SocialClientInterface, InboxMessage } from "../types.js";

function sha256hex(data: string): string {
  return createHash("sha256").update(data, "utf-8").digest("hex");
}

/**
 * Create a SocialClient wired to the agent's Solana keypair.
 */
export function createSocialClient(
  relayUrl: string,
  account: Keypair,
): SocialClientInterface {
  const baseUrl = relayUrl.replace(/\/$/, "");
  const fromAddress = account.publicKey.toBase58();

  return {
    send: async (
      to: string,
      content: string,
      replyTo?: string,
    ): Promise<{ id: string }> => {
      const signedAt = new Date().toISOString();
      const contentHash = sha256hex(content);
      const canonical = `automaton:send:${to}:${contentHash}:${signedAt}`;

      // Sign with ed25519 (tweetnacl)
      const sigBytes = nacl.sign.detached(
        Buffer.from(canonical, "utf-8"),
        account.secretKey,
      );
      const signature = bs58.encode(sigBytes);

      const res = await fetch(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: fromAddress,
          to,
          content,
          signature,
          signed_at: signedAt,
          reply_to: replyTo,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(
          `Send failed (${res.status}): ${(err as any).error || res.statusText}`,
        );
      }

      const data = (await res.json()) as { id: string };
      return { id: data.id };
    },

    poll: async (
      cursor?: string,
      limit?: number,
    ): Promise<{ messages: InboxMessage[]; nextCursor?: string }> => {
      const timestamp = new Date().toISOString();
      const canonical = `automaton:poll:${fromAddress}:${timestamp}`;

      const sigBytes = nacl.sign.detached(
        Buffer.from(canonical, "utf-8"),
        account.secretKey,
      );
      const signature = bs58.encode(sigBytes);

      const res = await fetch(`${baseUrl}/v1/messages/poll`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Wallet-Address": fromAddress,
          "X-Signature": signature,
          "X-Timestamp": timestamp,
        },
        body: JSON.stringify({ cursor, limit }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(
          `Poll failed (${res.status}): ${(err as any).error || res.statusText}`,
        );
      }

      const data = (await res.json()) as {
        messages: Array<{
          id: string;
          from: string;
          to: string;
          content: string;
          signedAt: string;
          createdAt: string;
          replyTo?: string;
        }>;
        next_cursor?: string;
      };

      return {
        messages: data.messages.map((m) => ({
          id: m.id,
          from: m.from,
          to: m.to,
          content: m.content,
          signedAt: m.signedAt,
          createdAt: m.createdAt,
          replyTo: m.replyTo,
        })),
        nextCursor: data.next_cursor,
      };
    },

    unreadCount: async (): Promise<number> => {
      const timestamp = new Date().toISOString();
      const canonical = `automaton:poll:${fromAddress}:${timestamp}`;

      const sigBytes = nacl.sign.detached(
        Buffer.from(canonical, "utf-8"),
        account.secretKey,
      );
      const signature = bs58.encode(sigBytes);

      const res = await fetch(`${baseUrl}/v1/messages/count`, {
        method: "GET",
        headers: {
          "X-Wallet-Address": fromAddress,
          "X-Signature": signature,
          "X-Timestamp": timestamp,
        },
      });

      if (!res.ok) return 0;

      const data = (await res.json()) as { unread: number };
      return data.unread;
    },
  };
}

/**
 * Verify an incoming message signature.
 * Returns true if the signature is valid.
 */
export function verifyMessageSignature(msg: {
  from: string;
  to: string;
  content: string;
  signedAt: string;
  signature: string;
}): boolean {
  try {
    const contentHash = sha256hex(msg.content);
    const canonical = `automaton:send:${msg.to}:${contentHash}:${msg.signedAt}`;
    const sigBytes = bs58.decode(msg.signature);
    const pubBytes = bs58.decode(msg.from);
    const msgBytes = Buffer.from(canonical, "utf-8");
    return nacl.sign.detached.verify(msgBytes, sigBytes, pubBytes);
  } catch {
    return false;
  }
}
