# AI SDK - Local Workspace Sandbox

_This package is **experimental**._

`HarnessV1SandboxProvider` implementation that runs harnesses **on the user's own
machine**, against a project directory they nominate.

Unlike the other sandbox providers, this one creates nothing. It binds to a directory
that already exists, runs processes as the current user, and inherits the environment —
so each harness finds the CLI, credentials, skills and configuration the user already
has installed.

## Setup

```bash
npm i @ai-sdk/sandbox-local-workspace
```

## Usage

The factory is synchronous and does no filesystem or process work; the session is created
when `provider.createSession()` is called.

```ts
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createClaudeCode } from '@ai-sdk/harness-claude-code';
import {
  createLocalWorkspaceSandbox,
  localWorkspaceWorkDir,
} from '@ai-sdk/sandbox-local-workspace';

const projectPath = '/Users/me/repos/myapp';

const agent = new HarnessAgent({
  harness: createClaudeCode(),
  sandbox: createLocalWorkspaceSandbox({ path: projectPath }),
  sandboxConfig: { workDir: localWorkspaceWorkDir(projectPath) },
  instructions: `Your working directory is ${projectPath}.`,
});
```

You can also use it standalone, to hand an AI SDK tool a local
`Experimental_SandboxSession`:

```ts
const provider = createLocalWorkspaceSandbox({ path: projectPath });
const networkSandboxSession = await provider.createSession();
const sandboxSession = networkSandboxSession.restricted();

await sandboxSession.writeTextFile({ path: 'myapp/hello.txt', content: 'hi' });
const { stdout } = await sandboxSession.run({ command: 'cat myapp/hello.txt' });

await networkSandboxSession.stop();
```

## `workDir` is required

`HarnessAgent` composes each session's working directory as
`<defaultWorkingDirectory>/<workDir>` and rejects a `workDir` of `'.'`. This provider
therefore roots the sandbox at the project's **parent** and enters the project through
`sandboxConfig.workDir`.

Always derive that value with `localWorkspaceWorkDir(path)` rather than calling
`basename()` yourself — the helper applies the same normalisation the provider applies
internally, so the two cannot disagree. If they disagree, the harness silently runs in an
empty sibling directory and reports that the project is empty.

## Settings

| Option      | Description                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------ |
| `path`      | Project directory the harness works in. Required. Created if missing.                            |
| `portCount` | Loopback ports to allocate per session. Defaults to `1`; bridge-backed adapters take `ports[0]`. |
| `env`       | Overlay applied on top of the inherited process environment.                                     |

`path` may not be the filesystem root or the home directory.

## Ports

Each session allocates real free TCP ports on `127.0.0.1`, so bridge-backed adapters
(Claude Code, Codex, OpenCode, DeepAgents) work. `getPortUrl()` returns
`http://127.0.0.1:<port>` or `ws://127.0.0.1:<port>`, and throws for a port outside the
session's pool.

Note that harness bridges bind `0.0.0.0` rather than loopback — that is upstream
behaviour and not configurable from here. They rely on a per-start random token for
access control.

`setNetworkPolicy` and `setPorts` are deliberately **not implemented**. There is no local
enforcement primitive, and a no-op stub would be a claim the framework would act on.

## Credentials

Nothing is copied, faked, or filtered. `HOME`, `PATH` and every credential variable are
inherited as-is, so each harness resolves authentication exactly as its CLI does:
`~/.claude/settings.json`, `~/.codex/config.toml`, `~/.pi/agent/auth.json`,
`ANTHROPIC_AUTH_TOKEN`, `AI_GATEWAY_API_KEY`, `VERCEL_OIDC_TOKEN`, and so on.

Use `env` to add variables; there is no way to remove them. A hermetic mode would be a
different package.

## Bootstrap files land beside your project

Bridge-backed adapters declare a bootstrap recipe with a relative directory
(`.harness-bootstrap/<harnessId>`), which the harness framework resolves against the
sandbox's default working directory. Because this provider roots the sandbox at the
project's parent, that bootstrap — recipe files plus a full `pnpm install`, potentially
hundreds of megabytes — is written to `.harness-bootstrap/` **beside** your project.

This is intentional: it keeps generated content out of your repository's working tree, so
it never shows up in `git status`. Delete the directory to force a clean re-bootstrap.
The same applies to `.harness-local/`, which holds one-time-setup markers.

## Limits

> `@ai-sdk/sandbox-local-workspace` provides **no isolation**. It runs each harness as the
> current user, with exactly the permissions that user already has — the same trust level
> as running `claude`, `codex` or `pi` in a terminal. The `path` option scopes where the
> harness _works_ (its `cwd` and `sandboxConfig.workDir`); it does not limit what the
> harness can _reach_. Bridge-backed harnesses (Claude Code, Codex) execute their
> built-in tools inside their own process and never call this provider's file API, and
> every harness ships a shell tool that can read and write anywhere the user can. The
> only file-path guard in effect is whatever the harness itself enforces. For untrusted
> input or untrusted output, use `@ai-sdk/sandbox-vercel`.
>
> It also writes outside `path`: bridge-backed harnesses bootstrap themselves into
> `.harness-bootstrap/<harnessId>/` **beside** your project directory — recipe files plus
> a full `pnpm install`, which can be hundreds of megabytes. This keeps the bootstrap out
> of your repository's working tree, at the cost of a sibling directory you did not ask
> for. Delete it to force a clean re-bootstrap.

This package deliberately has no path allowlist. One was implemented and removed after
testing: bridge-backed harnesses never route their built-in tools through the provider's
file API, host-runtime harnesses enforce their own workspace check first, and every
harness ships a shell tool that bypasses the file API entirely. It constrained nothing
while breaking adapter bootstrap.

## Choosing a sandbox provider

| Provider                          | Processes             | Ports          | Isolation |
| --------------------------------- | --------------------- | -------------- | --------- |
| `@ai-sdk/sandbox-vercel`          | remote microVM        | yes            | yes       |
| `@ai-sdk/sandbox-local-workspace` | the user's machine    | yes (loopback) | **none**  |
| `@ai-sdk/sandbox-just-bash`       | in-process virtual FS | no             | n/a       |

Bridge-backed harnesses need a provider that can spawn processes **and** expose a
reachable port: `sandbox-vercel` or `sandbox-local-workspace`. `sandbox-just-bash` cannot.
