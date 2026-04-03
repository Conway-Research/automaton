---
name: meow-protocol
description: Native inter-agent communication protocol using learned discrete codebooks (VQ-VAE). Enables token-efficient, auditable messaging between automatons.
auto-activate: true
requires:
  bins:
    - python3
  env:
    - MEOW_CODEBOOK_PATH
---

# Meow Protocol Skill

You have access to the Meow communication protocol for efficient inter-agent messaging.
Instead of sending verbose natural language messages between agents, you can encode
messages into compact discrete tokens using a learned codebook, and decode received
Meow messages back into natural language.

## When to Use

- When communicating with other automatons that have the meow-protocol skill installed
- When you need to reduce token costs for frequent agent-to-agent communication
- When sending structured data (task results, status reports, coordination signals)

## Available Commands

### Encode a message to Meow format

```bash
python3 "$MEOW_CODEBOOK_PATH/../encode.py" --text "your message here" --codebook "$MEOW_CODEBOOK_PATH"
```

Returns a compact token sequence like: `[42, 187, 3, 901, 55]`

### Decode a Meow message to natural language

```bash
python3 "$MEOW_CODEBOOK_PATH/../decode.py" --tokens "[42, 187, 3, 901, 55]" --codebook "$MEOW_CODEBOOK_PATH"
```

Returns the decoded human-readable message.

### Send a Meow-encoded message to another agent

When sending messages via the social relay or colony messaging, wrap the Meow tokens
in a standard envelope:

```json
{
  "protocol": "meow_v1",
  "codebook_version": "0.1.0",
  "tokens": [42, 187, 3, 901, 55],
  "checksum": "sha256_of_tokens"
}
```

### Receive and decode

When you receive a message with `"protocol": "meow_v1"`, decode it before processing:

1. Extract the `tokens` array
2. Run the decode command
3. Process the decoded natural language as normal

## Protocol Properties

- **Compression**: 5-10x token reduction over natural language
- **Auditability**: Any Meow message can be decoded to human-readable text on demand
- **Cross-model**: Works across different LLM backends (the codebook is model-agnostic)
- **Versioned**: Always check `codebook_version` matches your installed codebook

## Cost Savings

For frequent inter-agent communication (status reports, task coordination), Meow
encoding can reduce messaging costs significantly. A typical status report of ~100
tokens in natural language compresses to ~10-20 Meow tokens.

## Limitations

- Both sender and receiver must have compatible codebook versions
- First-time setup requires downloading the codebook (~50MB)
- Semantic nuance may be slightly reduced in compression — for critical decisions, use natural language
