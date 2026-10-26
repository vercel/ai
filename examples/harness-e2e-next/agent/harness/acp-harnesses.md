# ACP harnesses

These examples keep runtime-specific ACP configuration next to the consuming
application. Each runtime has one `createACP` profile that declares its direct
credential environment variables and its AI Gateway configuration:

- `AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN` selects AI Gateway automatically
  and `AI_GATEWAY_BASE_URL` overrides its endpoint.
- Without either Gateway credential, the profile forwards only the runtime's
  configured direct credentials.
- Set `auth` to `direct` or `ai-gateway` when a caller must override automatic
  selection.

The profiles install these ACP agents:

| Profile          | Source                                                                           | Executable         |
| ---------------- | -------------------------------------------------------------------------------- | ------------------ |
| `acp-codex`      | `npm-locked` from `acp-codex/bridge` with `@agentclientprotocol/codex-acp@1.1.4` | `codex-acp`        |
| `acp-grok-build` | `install-command` with the official Grok Build installer                         | `grok agent stdio` |

Codex uses its API-key launch environment and a configured OpenAI-compatible
Gateway provider ending in `/v1`. Codex ACP supports only
`permissionMode: 'allow-all'` because restrictive Codex modes enable its
internal sandbox.

Grok Build exposes `XAI_API_KEY` for direct authentication,
`GROK_XAI_API_BASE_URL` and `GROK_MODELS_BASE_URL` for its
OpenAI-compatible inference and model endpoints, and `GROK_CLIENT_NAME` plus
`GROK_CLIENT_VERSION` for attribution. The Gateway launch route maps both
endpoints to the configured Gateway URL ending in `/v1` and supplies the client
attribution, while direct mode leaves those values untouched.
