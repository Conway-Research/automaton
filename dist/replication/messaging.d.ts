/**
 * Parent-Child Messaging
 *
 * Relay-based communication between parent and child automatons.
 * Replaces unauthenticated filesystem-based messageChild().
 */
import type { SocialClientInterface } from "../types.js";
/**
 * Send a message to a child via the social relay.
 */
export declare function sendToChild(social: SocialClientInterface, childAddress: string, content: string, type?: string): Promise<{
    id: string;
}>;
/**
 * Send a message to the parent via the social relay.
 */
export declare function sendToParent(social: SocialClientInterface, parentAddress: string, content: string, type?: string): Promise<{
    id: string;
}>;
//# sourceMappingURL=messaging.d.ts.map