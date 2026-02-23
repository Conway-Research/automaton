/**
 * Conway Inference Client
 *
 * Wraps Conway's /v1/chat/completions endpoint (OpenAI-compatible).
 * The automaton pays for its own thinking through Conway credits.
 */
import { ResilientHttpClient } from "./http-client.js";
const INFERENCE_TIMEOUT_MS = 60_000;
export function createInferenceClient(options) {
    const { apiUrl, apiKey, openaiApiKey, anthropicApiKey } = options;
    const httpClient = new ResilientHttpClient({
        baseTimeout: INFERENCE_TIMEOUT_MS,
        retryableStatuses: [429, 500, 502, 503, 504],
    });
    let currentModel = options.defaultModel;
    let maxTokens = options.maxTokens;
    const chat = async (messages, opts) => {
        const model = opts?.model || currentModel;
        const tools = opts?.tools;
        // Newer models (o-series, gpt-5.x, gpt-4.1) require max_completion_tokens
        const usesCompletionTokens = /^(o[1-9]|gpt-5|gpt-4\.1)/.test(model);
        const tokenLimit = opts?.maxTokens || maxTokens;
        const body = {
            model,
            messages: messages.map(formatMessage),
            stream: false,
        };
        if (usesCompletionTokens) {
            body.max_completion_tokens = tokenLimit;
        }
        else {
            body.max_tokens = tokenLimit;
        }
        if (opts?.temperature !== undefined) {
            body.temperature = opts.temperature;
        }
        if (tools && tools.length > 0) {
            body.tools = tools;
            body.tool_choice = "auto";
        }
        const backend = resolveInferenceBackend(model, {
            openaiApiKey,
            anthropicApiKey,
            openaiApiBaseUrl: options.openaiApiBaseUrl,
        });
        if (backend === "anthropic") {
            return chatViaAnthropic({
                model,
                tokenLimit,
                messages,
                tools,
                temperature: opts?.temperature,
                anthropicApiKey: anthropicApiKey,
                httpClient,
            });
        }
        const openAiLikeApiUrl = backend === "openai" ? (options.openaiApiBaseUrl || "https://api.openai.com") : apiUrl;
        const openAiLikeApiKey = backend === "openai" ? openaiApiKey : apiKey;
        return chatViaOpenAiCompatible({
            model,
            body,
            apiUrl: openAiLikeApiUrl,
            apiKey: openAiLikeApiKey,
            backend,
            httpClient,
        });
    };
    /**
     * @deprecated Use InferenceRouter for tier-based model selection.
     * Still functional as a fallback; router takes priority when available.
     */
    const setLowComputeMode = (enabled) => {
        if (enabled) {
            currentModel = options.lowComputeModel || "gpt-5-mini";
            maxTokens = 4096;
        }
        else {
            currentModel = options.defaultModel;
            maxTokens = options.maxTokens;
        }
    };
    const getDefaultModel = () => {
        return currentModel;
    };
    return {
        chat,
        setLowComputeMode,
        getDefaultModel,
    };
}
function formatMessage(msg) {
    const formatted = {
        role: msg.role,
        content: msg.content,
    };
    if (msg.name)
        formatted.name = msg.name;
    if (msg.tool_calls)
        formatted.tool_calls = msg.tool_calls;
    if (msg.tool_call_id)
        formatted.tool_call_id = msg.tool_call_id;
    return formatted;
}
/**
 * Resolve which backend to use for a model.
 * When InferenceRouter is available, it uses the model registry's provider field.
 * This function is kept for backward compatibility with direct inference calls.
 */
function resolveInferenceBackend(model, keys) {
    // Anthropic models: claude-*
    if (keys.anthropicApiKey && /^claude/i.test(model)) {
        return "anthropic";
    }
    // OpenAI models: gpt-*, o[1-9]*, chatgpt-*
    if (keys.openaiApiKey && /^(gpt|o[1-9]|chatgpt)/i.test(model)) {
        return "openai";
    }
    // GLM models (智谱): glm-* - 使用 OpenAI 兼容 API
    if (keys.openaiApiKey && /^glm/i.test(model)) {
        return "openai";
    }
    // 如果配置了自定义 OpenAI API URL，也走 openai 后端
    if (keys.openaiApiKey && keys.openaiApiBaseUrl) {
        return "openai";
    }
    // Default: Conway proxy (handles all models including unknown ones)
    return "conway";
}
async function chatViaOpenAiCompatible(params) {
    // GLM 编码套餐使用 /chat/completions 而不是 /v1/chat/completions
    // 检测是否是 GLM URL（包含 /v4 或 bigmodel.cn）
    const isGlmApi = params.apiUrl.includes('bigmodel.cn') || params.apiUrl.includes('/v4');
    const endpoint = isGlmApi ? '/chat/completions' : '/v1/chat/completions';
    const resp = await params.httpClient.request(`${params.apiUrl}${endpoint}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: params.backend === "openai"
                ? `Bearer ${params.apiKey}`
                : params.apiKey,
        },
        body: JSON.stringify(params.body),
        timeout: INFERENCE_TIMEOUT_MS,
    });
    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Inference error (${params.backend}): ${resp.status}: ${text}`);
    }
    const data = await resp.json();
    const choice = data.choices?.[0];
    if (!choice) {
        throw new Error("No completion choice returned from inference");
    }
    const message = choice.message;
    const usage = {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
    };
    const toolCalls = message.tool_calls?.map((tc) => ({
        id: tc.id,
        type: "function",
        function: {
            name: tc.function.name,
            arguments: tc.function.arguments,
        },
    }));
    return {
        id: data.id || "",
        model: data.model || params.model,
        message: {
            role: message.role,
            content: message.content || "",
            tool_calls: toolCalls,
        },
        toolCalls,
        usage,
        finishReason: choice.finish_reason || "stop",
    };
}
async function chatViaAnthropic(params) {
    const transformed = transformMessagesForAnthropic(params.messages);
    const body = {
        model: params.model,
        max_tokens: params.tokenLimit,
        messages: transformed.messages.length > 0
            ? transformed.messages
            : (() => { throw new Error("Cannot send empty message array to Anthropic API"); })(),
    };
    if (transformed.system) {
        body.system = transformed.system;
    }
    if (params.temperature !== undefined) {
        body.temperature = params.temperature;
    }
    if (params.tools && params.tools.length > 0) {
        body.tools = params.tools.map((tool) => ({
            name: tool.function.name,
            description: tool.function.description,
            input_schema: tool.function.parameters,
        }));
        body.tool_choice = { type: "auto" };
    }
    const resp = await params.httpClient.request("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": params.anthropicApiKey,
            "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
        timeout: INFERENCE_TIMEOUT_MS,
    });
    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Inference error (anthropic): ${resp.status}: ${text}`);
    }
    const data = await resp.json();
    const content = Array.isArray(data.content) ? data.content : [];
    const textBlocks = content.filter((c) => c?.type === "text");
    const toolUseBlocks = content.filter((c) => c?.type === "tool_use");
    const toolCalls = toolUseBlocks.length > 0
        ? toolUseBlocks.map((tool) => ({
            id: tool.id,
            type: "function",
            function: {
                name: tool.name,
                arguments: JSON.stringify(tool.input || {}),
            },
        }))
        : undefined;
    const textContent = textBlocks
        .map((block) => String(block.text || ""))
        .join("\n")
        .trim();
    if (!textContent && !toolCalls?.length) {
        throw new Error("No completion content returned from anthropic inference");
    }
    const promptTokens = data.usage?.input_tokens || 0;
    const completionTokens = data.usage?.output_tokens || 0;
    const usage = {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
    };
    return {
        id: data.id || "",
        model: data.model || params.model,
        message: {
            role: "assistant",
            content: textContent,
            tool_calls: toolCalls,
        },
        toolCalls,
        usage,
        finishReason: normalizeAnthropicFinishReason(data.stop_reason),
    };
}
function transformMessagesForAnthropic(messages) {
    const systemParts = [];
    const transformed = [];
    for (const msg of messages) {
        if (msg.role === "system") {
            if (msg.content)
                systemParts.push(msg.content);
            continue;
        }
        if (msg.role === "user") {
            // Merge consecutive user messages
            const last = transformed[transformed.length - 1];
            if (last && last.role === "user" && typeof last.content === "string") {
                last.content = last.content + "\n" + msg.content;
                continue;
            }
            transformed.push({
                role: "user",
                content: msg.content,
            });
            continue;
        }
        if (msg.role === "assistant") {
            const content = [];
            if (msg.content) {
                content.push({ type: "text", text: msg.content });
            }
            for (const toolCall of msg.tool_calls || []) {
                content.push({
                    type: "tool_use",
                    id: toolCall.id,
                    name: toolCall.function.name,
                    input: parseToolArguments(toolCall.function.arguments),
                });
            }
            if (content.length === 0) {
                content.push({ type: "text", text: "" });
            }
            // Merge consecutive assistant messages
            const last = transformed[transformed.length - 1];
            if (last && last.role === "assistant" && Array.isArray(last.content)) {
                last.content.push(...content);
                continue;
            }
            transformed.push({
                role: "assistant",
                content,
            });
            continue;
        }
        if (msg.role === "tool") {
            // Merge consecutive tool messages into a single user message
            // with multiple tool_result content blocks
            const toolResultBlock = {
                type: "tool_result",
                tool_use_id: msg.tool_call_id || "unknown_tool_call",
                content: msg.content,
            };
            const last = transformed[transformed.length - 1];
            if (last && last.role === "user" && Array.isArray(last.content)) {
                // Append tool_result to existing user message with content blocks
                last.content.push(toolResultBlock);
                continue;
            }
            transformed.push({
                role: "user",
                content: [toolResultBlock],
            });
        }
    }
    return {
        system: systemParts.length > 0 ? systemParts.join("\n\n") : undefined,
        messages: transformed,
    };
}
function parseToolArguments(raw) {
    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return parsed;
        }
        return { value: parsed };
    }
    catch {
        return { _raw: raw };
    }
}
function normalizeAnthropicFinishReason(reason) {
    if (typeof reason !== "string")
        return "stop";
    if (reason === "tool_use")
        return "tool_calls";
    return reason;
}
//# sourceMappingURL=inference.js.map