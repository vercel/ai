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

The profiles pin the exact implementations exercised by this matrix:

| Profile           | Package                                        | Executable         |
| ----------------- | ---------------------------------------------- | ------------------ |
| `acp-claude-code` | `@agentclientprotocol/claude-agent-acp@0.61.0` | `claude-agent-acp` |
| `acp-codex`       | `@agentclientprotocol/codex-acp@1.1.4`         | `codex-acp`        |
| `acp-grok-build`  | `@xai-official/grok@0.2.111`                   | `grok agent stdio` |

Claude Code uses the pinned implementation's Anthropic launch environment and
the Gateway root endpoint. Codex uses its API-key launch environment and a
configured OpenAI-compatible Gateway provider ending in `/v1`. Codex ACP
supports only `permissionMode: 'allow-all'` because restrictive Codex modes
enable its internal sandbox.

The installed Grok package's npm trampoline can reuse an older binary already
present in the default Grok home. Verification therefore used an isolated
`GROK_HOME`; `grok --version` reported `0.2.111 (94172f2aa4e5)`. That exact
binary exposes `XAI_API_KEY` for direct authentication,
`GROK_XAI_API_BASE_URL` and `GROK_MODELS_BASE_URL` for its
OpenAI-compatible inference and model endpoints, and `GROK_CLIENT_NAME` plus
`GROK_CLIENT_VERSION` for attribution. The Gateway launch route maps both
endpoints to the configured Gateway URL ending in `/v1` and supplies the client
attribution, while direct mode leaves those values untouched.
