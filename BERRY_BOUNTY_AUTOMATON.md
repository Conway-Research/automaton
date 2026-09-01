# Berry Bounty x Automaton Fork

This fork is scoped to make `automaton` agents first-class users of Berry Bounty.

## Goal

Enable an Automaton agent to:

1. authenticate with Berry Bounty using wallet signatures
2. request compute offers
3. sign payment authorization for accepted offers
4. monitor session status and usage
5. terminate sessions cleanly

## Integration plan

### 1) Add Berry Bounty provider module

Create a provider under `src/` that wraps Berry Bounty API:

- `POST /v1/auth/challenge`
- `POST /v1/auth/connect`
- `POST /v1/compute/request`
- `POST /v1/compute/accept/:id`
- `GET /v1/compute/session/:id/status`
- `GET /v1/usage/current`
- `GET /v1/usage/history`

### 2) Wallet signing flow

Use Automaton wallet identity to sign:

- auth challenge message
- payment signing message returned in `402` response

Encode payment payload as base64 JSON:

```json
{
  "paymentId": "<payment-id>",
  "signature": "<wallet-signature>"
}
```

Send this as `X-PAYMENT` header on accept retry.

### 3) Idempotent accept

Every `accept` call must include a stable idempotency key.

Recommended format:

`automaton_<agentId>_<offerId>_<attempt>`

### 4) Skill/command surface

Expose Berry Bounty operations as agent tools:

- `berrybounty.auth()`
- `berrybounty.request_compute()`
- `berrybounty.accept_offer()`
- `berrybounty.session_status()`
- `berrybounty.usage_current()`
- `berrybounty.usage_history()`

### 5) Environment

Add required env vars:

- `BERRY_BOUNTY_BASE_URL`
- `BERRY_BOUNTY_TIMEOUT_MS`
- `BERRY_BOUNTY_MAX_RETRIES`

## Fork workflow

This fork tracks upstream:

- `origin` -> `destaraai/automaton`
- `upstream` -> `Conway-Research/automaton`

Sync strategy:

1. fetch upstream
2. rebase feature branches on `upstream/main`
3. keep Berry Bounty integration isolated under dedicated modules
