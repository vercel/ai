# AI SDK - ACP Harness

`@ai-sdk/harness-acp` adapts a pinned npm implementation of Agent Client
Protocol v1 to the AI SDK `HarnessV1` interface. The ACP client and configured
agent process run inside the sandbox supplied by `HarnessAgent`.

## Setup

```bash
npm i @ai-sdk/harness-acp @ai-sdk/harness @ai-sdk/sandbox-vercel
```

The adapter installs its bridge and the configured ACP npm package in the
sandbox during bootstrap. Simple acquisition requires an exact top-level
package version, but it does not freeze transitive dependency resolution.

## Direct authentication

```ts
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createACP } from '@ai-sdk/harness-acp';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';

const harness = createACP({
  harnessId: 'codex-acp',
  implementation: {
    type: 'npm',
    packageName: '@agentclientprotocol/codex-acp',
    version: '1.1.4',
    executable: 'codex-acp',
    envSources: {
      CODEX_API_KEY: ['CODEX_API_KEY', 'OPENAI_API_KEY'],
    },
    env: {
      INITIAL_AGENT_MODE: 'agent-full-access',
    },
  },
  authentication: {
    methodId: 'api-key',
  },
});

const agent = new HarnessAgent({
  harness,
  sandbox: createVercelSandbox({
    runtime: 'node24',
    ports: [4000],
  }),
});

const session = await agent.createSession();
try {
  const result = await agent.generate({
    session,
    prompt: 'Check the test failures and fix the production code.',
  });
  console.log(result.text);
} finally {
  await session.destroy();
}
```

`INITIAL_AGENT_MODE` is a Codex ACP runtime option, not generic ACP
configuration. This profile uses `agent-full-access` because `HarnessAgent`
already isolates Codex inside Vercel Sandbox; leaving Codex's default nested
sandbox enabled prevents its shell and file tools from starting there.

`authentication` selects an authentication method advertised by the ACP agent.
`auth` separately selects `auto`, `direct`, or `ai-gateway` authentication for
the downstream model provider, while `providerAuthentication` declares the
runtime-specific Gateway route. Bridge WebSocket authentication is managed
internally and is not part of either setting.

`implementation.envSources` maps variables for the ACP process to host
environment-variable names. A source array defines fallback precedence. The
adapter resolves the first populated source only when starting the bridge;
`createACP` settings, bootstrap data, and lifecycle state contain names but
never the resolved values. Put values that are safe to persist and fingerprint
in `implementation.env`.

## Locked acquisition

Provide a package manifest and its matching pnpm lockfile when transitive
dependencies must also be frozen:

```ts
const harness = createACP({
  harnessId: 'locked-acp',
  implementation: {
    type: 'npm',
    mode: 'locked',
    packageJson,
    pnpmLockYaml,
    executable: 'acp-agent',
  },
});
```

Both strings are written into the adapter-owned bootstrap directory and
installed with `pnpm install --frozen-lockfile`. Do not put credentials in
either artifact.

## Sandbox and settings

The sandbox must expose at least one TCP port for the authenticated bridge.
Without `settings.port`, the adapter uses the first port exposed by the sandbox.
If neither is available, session startup throws
`HarnessCapabilityUnsupportedError` with the required configuration.

`createACP` accepts:

- `harnessId`: stable kebab-case identity for the configured implementation.
- `version`: ACP version; it defaults to and currently supports only `"v1"`.
- `implementation`: simple or locked npm acquisition, executable, arguments,
  sensitive `envSources`, and persistent `env`.
- `builtinTools`: optional native tool definitions for static typing and exact
  name matching.
- `authentication`: advertised ACP authentication method, metadata, and client
  capabilities.
- `auth`: downstream provider authentication mode; defaults to `auto`.
- `providerAuthentication`: declarative runtime-specific Gateway route.
- `modelId`: a known implementation model identifier for Harness metadata.
- `permissionModeMapping`: mappings from Harness permission modes to advertised
  ACP session modes or configuration options.
- `session.meta`: serializable implementation-specific session metadata.
- `port`: exposed bridge port override.
- `startupTimeoutMs`: bridge startup timeout; the default is 120 seconds.

## AI Gateway profile

ACP implementations expose different mechanisms for configuring a downstream
provider. A profile describes that mechanism as serializable data. Prefer an
advertised ACP authentication or provider method when the runtime exposes one.
Use a documented launch environment or session metadata path only as a
runtime-specific fallback.

For example, Codex ACP advertises a `gateway` authentication method when the
client opts into it:

```ts
const harness = createACP({
  harnessId: 'codex-acp-gateway',
  implementation: {
    type: 'npm',
    packageName: '@agentclientprotocol/codex-acp',
    version: '1.1.4',
    executable: 'codex-acp',
    envSources: {
      CODEX_API_KEY: ['CODEX_API_KEY', 'OPENAI_API_KEY'],
    },
  },
  providerAuthentication: {
    gateway: {
      route: {
        type: 'auth-method',
        methodId: 'gateway',
        env: {
          CODEX_CONFIG: JSON.stringify({ model: 'openai/gpt-5.5' }),
        },
        clientCapabilities: {
          auth: { _meta: { gateway: true } },
        },
        meta: {
          gateway: {
            baseUrl: {
              $source: 'gateway-base-url',
              ensureSuffix: '/v1',
            },
            headers: {
              Authorization: { $source: 'gateway-authorization' },
              'User-Agent': { $source: 'client-app' },
              'x-client-app': { $source: 'client-app' },
            },
            providerName: 'AI Gateway',
          },
        },
      },
    },
  },
});
```

Gateway credentials use the shared AI SDK environment behavior:
`AI_GATEWAY_API_KEY` takes precedence over `VERCEL_OIDC_TOKEN`, and
`AI_GATEWAY_BASE_URL` can override the default `https://ai-gateway.vercel.sh`.
Omitting `auth` selects Gateway automatically when either credential source is
available and otherwise selects direct authentication. Explicit `direct`
always remains direct, while explicit `ai-gateway` without credentials fails.
Gateway remains a consumer choice, but a runtime profile must support it
whenever the ACP implementation exposes a safe endpoint and credential path.
The selected credential source and non-secret base URL participate in
compatibility identity, but the resolved key or OIDC token never does.

An advertised `auth-method` or `provider-method` route is validated against the
agent's initialization response. If the configured method or capability is not
advertised, the adapter fails explicitly rather than falling back to direct
authentication. Only declare a `launch` or `session` fallback that the specific
ACP runtime documents. A profile for a runtime with no feasible endpoint and
credential path must reject Gateway selection instead of inventing a generic
mapping.

Every Gateway route can include `env` values that are added to the ACP process
only when Gateway is selected. This lets a profile declare Gateway-only runtime
configuration alongside an advertised authentication or provider method while
keeping its direct launch environment unchanged.

Profile values such as `gateway-api-key`, `gateway-base-url`,
`gateway-authorization`, and `client-app` are placeholders. The adapter resolves
them only after Gateway is selected. The `client-app` value is the versioned
`ai-sdk/harness-acp/${VERSION}` identifier.

Claude Code ACP uses the Anthropic-compatible Gateway root without `/v1` and
can receive the mapping through its supported launch environment:

```ts
import { createACP, VERSION } from '@ai-sdk/harness-acp';

const harness = createACP({
  harnessId: 'claude-code-acp',
  implementation: {
    type: 'npm',
    packageName: '@agentclientprotocol/claude-agent-acp',
    version: '0.61.0',
    executable: 'claude-agent-acp',
    envSources: {
      ANTHROPIC_API_KEY: 'ANTHROPIC_API_KEY',
      ANTHROPIC_AUTH_TOKEN: 'ANTHROPIC_AUTH_TOKEN',
    },
    env: {
      CLAUDE_AGENT_SDK_CLIENT_APP: `ai-sdk/harness-acp/${VERSION}`,
    },
  },
  providerAuthentication: {
    gateway: {
      route: {
        type: 'launch',
        env: {
          ANTHROPIC_API_KEY: { $source: 'gateway-api-key' },
          ANTHROPIC_AUTH_TOKEN: { $source: 'gateway-api-key' },
          ANTHROPIC_BASE_URL: { $source: 'gateway-base-url' },
          CLAUDE_AGENT_SDK_CLIENT_APP: { $source: 'client-app' },
        },
      },
    },
  },
});
```

Without Gateway credentials, this profile uses direct `ANTHROPIC_API_KEY` or
`ANTHROPIC_AUTH_TOKEN`. Codex similarly uses direct `CODEX_API_KEY` or
`OPENAI_API_KEY`. Gateway credentials are resolved for every fresh start,
bridge respawn, lossy rerun, and cold restore. Resolved credentials and headers
never enter bootstrap or lifecycle artifacts, replay logs, diagnostics, or the
session workspace.

## Native tools and raw events

Optional `builtinTools` definitions retain static tool typing when an ACP
runtime supplies a programmatic tool name that exactly matches either the
tool-set key or its configured `nativeName`. Display titles, tool kinds, and
raw-input shapes are never used for matching.

ACP-side calls without an authoritative matching name remain valid
provider-executed dynamic calls. This includes unnamed native tools and
third-party MCP tools. Their stable ACP call IDs, partial updates, results,
diffs, and edit locations are translated without making the host responsible
for execution. Original ACP session updates are also available as Harness raw
events.

ACP does not report model-step boundaries, so the adapter infers them
conservatively. Text, reasoning, and native tool calls open a step; a tool
phase remains open while any announced call is pending, and contiguous or
parallel calls stay in the same step. A completed tool phase closes before the
next assistant phase, while the final open step closes immediately before the
turn finish. Inferred per-step usage is unknown; only the terminal ACP
`PromptResponse` supplies total usage.

Aborting a turn sends ACP `session/cancel` and continues draining final session
updates until the original prompt returns or the connection fails. The public
`HarnessAgent` stream then settles through its standard abort path.

## Permissions and approvals

ACP agents choose their own session mode and configuration identifiers. Map all
three Harness permission modes declaratively when the implementation can
reliably request approval for restricted native operations:

```ts
const harness = createACP({
  // implementation and authentication settings
  permissionModeMapping: {
    'allow-reads': { type: 'session-mode', modeId: 'read-only' },
    'allow-edits': { type: 'session-mode', modeId: 'agent' },
    'allow-all': { type: 'session-mode', modeId: 'agent-full-access' },
  },
});
```

Each target can instead use
`{ type: 'session-config-option', configId, value }`, where `value` is an
advertised select value or boolean. After ACP creates or resumes a session,
its permission configuration path validates every configured target
against that response before applying the requested Harness mode through
`session/set_mode` or `session/set_config_option`. Process-loss rerun reuses
the same validation for `session/resume` responses; stopped-session loading is
not part of this lifecycle path. Missing modes, options, and values fail with
`HarnessCapabilityUnsupportedError` before the prompt executes.

A complete mapping enables built-in approval support. ACP native permission
requests become standard Harness approval requests and remain pending until
`submitToolApproval`. Boolean acceptance selects only an advertised
`allow_once`; rejection selects only `reject_once`. Persistent `always` choices
are never inferred from a boolean decision, and requests without both one-time
choices fail closed. Cancelling a turn returns ACP's cancelled outcome to every
pending permission request.

ACP v1 does not standardize native tool filtering, so this adapter does not
advertise built-in filtering even when approvals are enabled. Custom
host-executed tools continue to use `HarnessAgent`'s independent
`toolApproval` setting.

## Host-defined tools

`HarnessAgent` host tools are exposed to the ACP agent through one
harness-owned stdio MCP server. The server starts with the first prompt's
active tool catalog and passes each call back to the host, where executable
tools use the standard AI SDK execution path. Generator yields remain
preliminary consumer events; only the final result returns to the ACP agent.

Before each later prompt, the same MCP server compares the complete active
catalog, including descriptions and recursive schemas. A changed or removed
tool sends the standard MCP tool-list-change notification, and the prompt
waits until the ACP implementation requests the new list. Implementations
that do not refresh fail with `HarnessCapabilityUnsupportedError`; calls from
stale catalog revisions are rejected rather than executed. Unchanged catalogs
do not send a notification.

Codex ACP 1.1.4 with `@openai/codex` 0.144.6 receives the notification but
does not refresh its cached MCP tool list. A changed catalog therefore fails
precisely with `HarnessCapabilityUnsupportedError`, while consecutive prompts
with an unchanged catalog continue normally.

Tools without `execute` pause the local turn. Submit their result with
`agent.continueStream` on the same live session. Recursive JSON Schemas are
forwarded to MCP without schema conversion.

The MCP relay is authoritative for host-tool events. ACP display events are
suppressed only when an opaque result token or portable server, tool, and
normalized-input evidence correlates them to an in-flight relay invocation.
Unproven events leave the bounded correlation buffer as independent
provider-executed dynamic calls.

## Instructions and skills

ACP prompts are projected onto the protocol's portable text content blocks.
Strings and text-only `UserModelMessage` values are supported while preserving
the boundaries between text parts. Image, audio, file/resource, and other
content parts fail with `HarnessCapabilityUnsupportedError`; the adapter does
not infer multimodal support from implementation-specific ACP capabilities.

`HarnessAgent` instructions are placed in a delimited operating-guidance block
before the first prompt of a fresh session. The block is not repeated on later
turns or resumed sessions.

Skills are also portable across ACP implementations. Supply them on
`HarnessAgent`:

```ts
const agent = new HarnessAgent({
  harness,
  sandbox,
  instructions: 'Prefer concise answers.',
  skills: [
    {
      name: 'release-notes',
      description: 'Use when drafting release notes.',
      content: 'Read `references/style.md` before drafting.',
      files: [
        {
          path: 'references/style.md',
          content: 'Use active voice.',
        },
      ],
    },
  ],
});
```

The adapter writes each complete skill under
`$HOME/.ai-sdk/harness-acp/<harness-id>/<session-key>/skills`, outside the
session project directory. The first guidance block contains only each skill's
name, description, and absolute `SKILL.md` location so the agent can load it on
demand. Skill bodies and attached-file contents are never copied into the
prompt or project workspace. Kebab-case skill names and relative POSIX file
paths are required; absolute paths, parent traversal, duplicate paths, and an
attached `SKILL.md` are rejected before skill files are written.

Lifecycle state records whether guidance was applied, whether skills were
materialized, and a content fingerprint. Matching resumed sessions therefore
reuse the existing files without reannouncing the catalog. The runnable
`examples/ai-functions/src/harness-agent/codex-acp/with-skills.ts` example
verifies both real skill use and project-workspace isolation with Codex ACP.

ACP v1 supports new text sessions, prompting, streaming, cancellation,
reasoning/text translation, host tools, ACP-side tool observation, live
detach/reattach, completed disk replay after bridge respawn, and explicitly
lossy in-flight rerun through advertised `session/resume`. Capabilities that
require additional protocol mapping fail with
`HarnessCapabilityUnsupportedError` rather than being advertised
optimistically.

## Live cross-process detach and reattach

`session.detach()` closes only the current host connection between turns. The
bridge, ACP process, and ACP session remain alive in the sandbox, and the
returned state can be persisted and supplied to a new host process:

```ts
const resumeFrom = await session.detach();

const attached = await agent.createSession({
  sessionId: session.sessionId,
  resumeFrom,
});
```

For an in-flight turn, `session.suspendTurn()` drains events already delivered
to the host and freezes the connection at their exact sequence cursor. It does
not cancel the ACP prompt. A new process attaches with `continueFrom`, then
continues the existing operation without a new prompt:

```ts
const continueFrom = await session.suspendTurn();

const attached = await agent.createSession({
  sessionId: session.sessionId,
  continueFrom,
});
const result = await agent.continueStream({ session: attached });
```

Only events after the saved cursor are replayed. Pending results for
non-executable host tools and pending native approvals are stored by
`HarnessAgent` alongside the adapter payload and can be submitted through
`continueStream`. Initial guidance and materialized skills are retained without
being announced or written again.

The adapter payload includes the stable implementation identity, ACP session
ID, authenticated bridge port and token, exact cursor, sandbox ID when
available, and a safe authentication-profile descriptor. The descriptor
contains only named routing and credential-source facts plus a compatibility
digest. Provider keys, Gateway keys, OIDC tokens, resolved environment values,
and authenticated ACP header values are never serialized.

The following Codex ACP examples split each detach/reattach or
suspend/continue scenario into two processes. Run each command twice while the
named Vercel Sandbox is still live. The first invocation writes its
scenario-specific state file; the second detects that file, resumes the
session, and removes it:

```bash
aif examples/ai-functions/src/harness-agent/codex-acp/live-attach.ts
aif examples/ai-functions/src/harness-agent/codex-acp/live-attach.ts

aif examples/ai-functions/src/harness-agent/codex-acp/live-suspend.ts
aif examples/ai-functions/src/harness-agent/codex-acp/live-suspend.ts

aif examples/ai-functions/src/harness-agent/codex-acp/live-client-tool-handoff.ts
aif examples/ai-functions/src/harness-agent/codex-acp/live-client-tool-handoff.ts

aif examples/ai-functions/src/harness-agent/codex-acp/live-native-approval-handoff.ts
aif examples/ai-functions/src/harness-agent/codex-acp/live-native-approval-handoff.ts
```

Set `AI_SDK_ACP_HANDOFF_STATE_PATH` to use a different fresh path. Each resume
phase destroys only its own sandbox session and removes only its scenario's
state file.

## Stopped-session restoration

`session.stop()` ends the current bridge and ACP process while returning
prompt-free lifecycle state for restoration in a later host and sandbox
process. The adapter payload retains the ACP session ID, implementation and
configuration fingerprints, permission mapping and mode, model/session
selection, active host tools, and instruction/skill materialization state. It
does not retain a prompt, resolved provider or Gateway credential, OIDC token,
or authenticated request header.

The replacement bridge initializes the same ACP implementation and restores the
native session before accepting a new Harness turn. It prefers advertised
`session/resume`, falls back to the legacy advertised `session/load`, and
throws `HarnessCapabilityUnsupportedError` when neither capability is
available. A load implementation may stream the existing conversation during
restoration; the bridge consumes every historical message, tool update, usage
notification, unknown raw notification, and the restoration exchange's own
finish internally. None of those frames appear in the first new Harness turn.

Cold restoration validates the persisted non-secret direct-or-Gateway routing
identity against the new host configuration. Gateway base URL and client
attribution remain stable, while Gateway API keys or OIDC tokens are resolved
again in the replacement host before the ACP process starts. Active tools are
bootstrapped from lifecycle state and can still change on the first new turn.
Permission modes, model/session options, instructions, and skills are
revalidated before use.

`session.destroy()` releases the adapter-owned bridge and ACP processes without
returning lifecycle state. Sandbox lifecycle remains owned by the Harness
framework; when a caller supplies an existing Vercel Sandbox, the caller
remains responsible for stopping it. Repeated stop or destroy calls retain the
Harness session contract's ended-session behavior. Standard ACP v1 has no
portable manual compaction operation, so `session.compact()` throws
`HarnessCapabilityUnsupportedError` without guessing a slash command or
implementation-specific method.

These examples cover same-process cold restoration, a two-process named Vercel
Sandbox restoration through AI Gateway, caller-provided sandbox ownership, and
the expected compaction error:

```bash
aif examples/ai-functions/src/harness-agent/codex-acp/resume.ts

AI_SDK_ACP_HANDOFF_PHASE=start AI_SDK_ACP_HANDOFF_STATE_PATH=/tmp/ai-sdk-acp-cold-resume.json aif examples/ai-functions/src/harness-agent/codex-acp/vercel-sandbox-resume.ts
AI_SDK_ACP_HANDOFF_PHASE=resume AI_SDK_ACP_HANDOFF_STATE_PATH=/tmp/ai-sdk-acp-cold-resume.json aif examples/ai-functions/src/harness-agent/codex-acp/vercel-sandbox-resume.ts

aif examples/ai-functions/src/harness-agent/codex-acp/with-provided-sandbox.ts
aif examples/ai-functions/src/harness-agent/codex-acp/compaction.ts
```

## Bridge respawn recovery

Mutable ACP bridge configuration, event logs, and tool catalogs live under
`$HOME/.ai-sdk/harness-acp/<harness-id>/<session-key>/bridge`, alongside the
adapter-owned skill root but outside `sessionWorkDir`. Recovery files use
owner-only permissions. Their start envelope includes the original unguided
prompt, exact active tool catalog, debug and permission settings, a
configuration fingerprint, and the selected direct-or-Gateway profile. A
Gateway profile retains only its non-secret base URL, versioned client
attribution, route kind, and credential-source identity. Resolved provider
keys, Gateway keys, OIDC tokens, launch credentials, and authenticated ACP
headers are not persisted.

When a suspended turn cannot attach to its original bridge, recovery follows
two explicit rungs:

1. A coherent completed event log with contiguous sequence numbers and exact
   cursor coverage is served by a replay-only replacement bridge. Malformed,
   truncated, gapped, or non-terminal logs are never presented as lossless
   replay. A replay-only session cannot silently start a later ACP prompt,
   because no ACP process was restored.
2. An unfinished turn can be rerun only after starting a replacement ACP
   process, re-resolving current host credentials, and restoring the recorded
   ACP session through advertised `session/resume`. The original unguided
   prompt is then submitted again. Lifecycle state, a raw stream marker, a
   warning, and diagnostics identify this as `lossy-rerun`, because runtime
   work may be repeated. If `session/resume` is unavailable, recovery fails
   rather than creating an unrelated session.

These phase-separated examples terminate the scenario's bridge process before
the second invocation. The first waits for a completed disconnected-host tail;
the second terminates an unfinished Gateway-authenticated turn and proves the
replacement authenticates from the resume process environment without stored
credentials:

```bash
AI_SDK_ACP_HANDOFF_PHASE=start AI_SDK_ACP_HANDOFF_STATE_PATH=/tmp/ai-sdk-acp-respawn-replay.json aif examples/ai-functions/src/harness-agent/codex-acp/bridge-respawn-replay.ts
AI_SDK_ACP_HANDOFF_PHASE=resume AI_SDK_ACP_HANDOFF_STATE_PATH=/tmp/ai-sdk-acp-respawn-replay.json aif examples/ai-functions/src/harness-agent/codex-acp/bridge-respawn-replay.ts

AI_SDK_ACP_HANDOFF_PHASE=start AI_SDK_ACP_HANDOFF_STATE_PATH=/tmp/ai-sdk-acp-respawn-rerun.json aif examples/ai-functions/src/harness-agent/codex-acp/bridge-respawn-lossy-rerun.ts
AI_SDK_ACP_HANDOFF_PHASE=resume AI_SDK_ACP_HANDOFF_STATE_PATH=/tmp/ai-sdk-acp-respawn-rerun.json aif examples/ai-functions/src/harness-agent/codex-acp/bridge-respawn-lossy-rerun.ts
```

## Known ACP v1 limitations

- The initial adapter supports npm-installed stdio ACP v1 implementations only.
- Portable prompts are text-only. Image, audio, resource, and other prompt
  content fails with `HarnessCapabilityUnsupportedError`.
- ACP v1 does not report model-step boundaries or per-step usage. The adapter
  infers step boundaries and reports unknown per-step usage.
- ACP v1 does not standardize native tool filtering, manual compaction, or
  mid-turn steering.
- The adapter does not advertise ACP filesystem or terminal client capabilities.
- Cold restoration and process-loss rerun require optional agent capabilities.
- A changed host-tool catalog requires the implementation to refresh its MCP
  tool list; stale catalogs fail explicitly.
