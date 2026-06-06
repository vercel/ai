# TWZRD Agent Intel MCP Example

Demonstrates connecting to [TWZRD Agent Intel](https://intel.twzrd.xyz) — a zero-install
remote MCP server for trust scoring and x402 payment verification of AI agents on Solana.

## What it shows

1. **Trust scoring** — call `score_agent` to get a 0-100 trust score for any Solana wallet
2. **Preflight check** — call `preflight_check` before transacting with an unknown agent
3. **LLM-driven trust gate** — use the AI SDK to let the model decide whether to trust an agent

## Run it

```bash
cd examples/mcp
pnpm install

# No API key needed for TWZRD trust scoring
# Set your OpenAI key for the LLM parts
export OPENAI_API_KEY=sk-...

pnpm tsx src/twzrd-trust-check/client.ts
```

## TWZRD MCP config

```json
{"mcpServers": {"twzrd-agent-intel": {"url": "https://intel.twzrd.xyz/mcp"}}}
```

## Available tools

| Tool | Description | Paid? |
|------|-------------|-------|
| `score_agent(wallet)` | Trust score (0-100) + reputation data | Free |
| `resolve_agent(wallet)` | Agent identity resolution | Free |
| `preflight_check(wallet)` | Pre-transaction safety check | Free |
| `verify_trust_receipt(receipt)` | Verify x402 payment receipt | Free |
| `get_trust_receipt(wallet)` | Full trust receipt (identity proof) | x402 |

PyPI: `pip install twzrd-agent-intel`
