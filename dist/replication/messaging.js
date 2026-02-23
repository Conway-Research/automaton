/**
 * Parent-Child Messaging
 *
 * Relay-based communication between parent and child automatons.
 * Replaces unauthenticated filesystem-based messageChild().
 */
import { MESSAGE_LIMITS } from "../types.js";
/**
 * Send a message to a child via the social relay.
 */
export async function sendToChild(social, childAddress, content, type = "parent_message") {
    if (content.length > MESSAGE_LIMITS.maxContentLength) {
        throw new Error(`Message too long: ${content.length} bytes (max ${MESSAGE_LIMITS.maxContentLength})`);
    }
    const result = await social.send(childAddress, JSON.stringify({
        type,
        content,
        sentAt: new Date().toISOString(),
    }));
    return { id: result.id };
}
/**
 * Send a message to the parent via the social relay.
 */
export async function sendToParent(social, parentAddress, content, type = "child_message") {
    if (content.length > MESSAGE_LIMITS.maxContentLength) {
        throw new Error(`Message too long: ${content.length} bytes (max ${MESSAGE_LIMITS.maxContentLength})`);
    }
    const result = await social.send(parentAddress, JSON.stringify({
        type,
        content,
        sentAt: new Date().toISOString(),
    }));
    return { id: result.id };
}
//# sourceMappingURL=messaging.js.map