# AI SDK - Local Workspace Sandbox

_This package is **experimental**._

`HarnessV1SandboxProvider` implementation that runs harnesses **on the user's own
machine**, against a project directory they nominate.

Unlike the other sandbox providers, this one creates nothing. It binds to a directory
that already exists, runs processes as the current user, and inherits the environment, so
each harness finds the CLI, credentials, skills and configuration the user already has
installed.

## Setup

```bash
npm i @ai-sdk/sandbox-local-workspace
```

## Usage

```ts
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createClaudeCode } from '@ai-sdk/harness-claude-code';
import { localWorkspace } from '@ai-sdk/sandbox-local-workspace';

const workspace = localWorkspace({ path: '/Users/me/repos/myapp' });

const agent = new HarnessAgent({
  harness: createClaudeCode(),
  sandbox: workspace.sandbox,
  sandboxConfig: workspace.sandboxConfig,
});
```

If you need more of `sandboxConfig`, merge rather than replace:

```ts
sandboxConfig: { ...workspace.sandboxConfig, onSession },
```

### Why this needs `sandboxConfig` when other providers do not

`@ai-sdk/sandbox-vercel` and `@ai-sdk/sandbox-just-bash` are configured by `sandbox:`
alone. This one is not, and that is a genuine wart rather than a style choice.

`HarnessAgent` composes each session's directory as
`<sandbox.defaultWorkingDirectory>/<sandboxConfig.workDir>`. A hosted provider owns a
fresh machine, so it is happy for the framework to invent a per-session subdirectory. This
provider has to land the session on a directory that already exists and that the framework
has no way to name, so `workDir` has to come from the caller.

`localWorkspace()` exists to keep the two halves in agreement. See
[Why the provider roots itself one level above your project](#why-the-provider-roots-itself-one-level-above-your-project)
for why the parent directory, rather than the project, is the sandbox root.

You can also use the provider standalone, to hand an AI SDK tool a local
`Experimental_SandboxSession`:

```ts
import { createLocalWorkspaceSandbox } from '@ai-sdk/sandbox-local-workspace';

const provider = createLocalWorkspaceSandbox({ path: '/Users/me/repos/myapp' });
const networkSandboxSession = await provider.createSession();
const sandboxSession = networkSandboxSession.restricted();

await sandboxSession.writeTextFile({ path: 'myapp/hello.txt', content: 'hi' });
const { stdout } = await sandboxSession.run({ command: 'cat myapp/hello.txt' });

await networkSandboxSession.stop();
```

## Settings

| Option      | Description                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------ |
| `path`      | Project directory the harness works in. Required. Created if missing.                            |
| `portCount` | Loopback ports to allocate per session. Defaults to `1`; bridge-backed adapters take `ports[0]`. |
| `env`       | Overlay applied on top of the inherited process environment.                                     |

`path` may not be the filesystem root or the home directory.

## Why the provider roots itself one level above your project

`HarnessAgent` composes each session's working directory as
`<sandbox.defaultWorkingDirectory>/<sandboxConfig.workDir>`. This provider reports the
**parent** of `path` as its default working directory, and names the project itself in
`workDir`. Two things follow from that, and both are deliberate:

1. Adapter bootstrap stays out of your repository. Bridge-backed adapters declare a
   relative bootstrap directory (`.harness-bootstrap/<harnessId>`) that the framework
   resolves against the sandbox default working directory. Rooting at the parent puts a
   full `node_modules` **beside** your project rather than inside it, so it never appears
   in `git status`.
2. `workDir` and `path` have to agree. Deriving `workDir` by hand is easy to get subtly
   wrong, and a mismatch is silent: the harness runs in an empty sibling directory and
   reports that the project is empty. `localWorkspace()` returns both together so that
   cannot happen.

The alternative, rooting at the project itself and passing `workDir: '.'`, is not
available: `normalizeSandboxWorkDir` rejects `'.'` alongside `'..'` and absolute paths.
That looks stricter than necessary, since `'.'` does not escape the default working
directory, and it is worth raising upstream. It would not change this package's default
though, because rooting at the project is what would drag bootstrap into your working
tree.

## Ports

Each session allocates real free TCP ports on `127.0.0.1`, so bridge-backed adapters
(Claude Code, Codex, OpenCode, DeepAgents) work. `getPortUrl()` returns
`http://127.0.0.1:<port>` or `ws://127.0.0.1:<port>`, and throws for a port outside the
session's pool.

Note that harness bridges bind `0.0.0.0` rather than loopback. That is upstream behaviour
and not configurable from here; they rely on a per-start random token for access control.

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

As described above, bridge-backed adapters bootstrap into `.harness-bootstrap/` next to
your project directory. Delete it to force a clean re-bootstrap. The same applies to
`.harness-local/`, which holds one-time-setup markers.

The bootstrap is keyed to that parent directory, so **projects that are siblings share
one bootstrap**, and a project under a fresh parent pays for its own: roughly 40 seconds
and a full `node_modules` for Claude Code. Keeping your projects under a common parent,
the usual `~/repos/<project>` layout, means you pay that once per harness rather than once
per project.

## Harnesses write to your real home directory

Inheriting the user's environment cuts both ways. A harness that persists state in `$HOME`
does so for real, permanently, outside anything this provider scopes. Observed with the
Codex adapter, which appends a trust entry to the user's global `~/.codex/config.toml` for
every project path it is pointed at:

```toml
[projects."/private/var/folders/.../T/lws-e2e-iIapOt/myapp"]
trust_level = "trusted"
```

With a hosted sandbox those writes land in a disposable VM. Here they accumulate in your
real config, including entries for directories that no longer exist. Prune them
periodically if you drive many short-lived projects.

## Host-runtime harnesses patch `node:fs` while a session is live

Host-runtime adapters such as Pi install a global `node:fs` shim so the model's file tools
resolve through their own workspace view. It is scoped to the workspace and reverted when
the session is destroyed, but while a session is **active** any other in-process code that
calls `node:fs` sees that view rather than the disk:

```ts
const session = await agent.createSession();
existsSync(join(projectPath, 'README.md')); // false, even though it is on disk
await session.destroy();
existsSync(join(projectPath, 'README.md')); // true again
```

This provider is immune, because it captures its `node:fs` bindings at module load, so the
model's writes reach the real disk and survive the session. Your own code is not. If you
need to inspect the workspace while a session is live, do it out of process, or capture
your bindings before the adapter loads.

## Limits

> `@ai-sdk/sandbox-local-workspace` provides **no isolation**. It runs each harness as the
> current user, with exactly the permissions that user already has, the same trust level
> as running `claude`, `codex` or `pi` in a terminal. The `path` option scopes where the
> harness _works_ (its `cwd` and `sandboxConfig.workDir`); it does not limit what the
> harness can _reach_. Bridge-backed harnesses (Claude Code, Codex) execute their
> built-in tools inside their own process and never call this provider's file API, and
> every harness ships a shell tool that can read and write anywhere the user can. The
> only file-path guard in effect is whatever the harness itself enforces. For untrusted
> input or untrusted output, use `@ai-sdk/sandbox-vercel`.
>
> It also writes outside `path`: bridge-backed harnesses bootstrap themselves into
> `.harness-bootstrap/<harnessId>/` **beside** your project directory, recipe files plus
> a full `pnpm install`, which can be hundreds of megabytes. This keeps the bootstrap out
> of your repository's working tree, at the cost of a sibling directory you did not ask
> for. Delete it to force a clean re-bootstrap.

## Choosing a sandbox provider

| Provider                          | Runs commands in               | Ports         | Filesystem the harness sees    |
| --------------------------------- | ------------------------------ | ------------- | ------------------------------ |
| `@ai-sdk/sandbox-vercel`          | a remote microVM               | yes           | isolated, disposable           |
| `@ai-sdk/sandbox-local-workspace` | the user's machine             | yes, loopback | the real one, unrestricted     |
| `@ai-sdk/sandbox-just-bash`       | an in-process bash interpreter | no            | a virtual in-memory filesystem |

`sandbox-just-bash` is isolated in the sense that its filesystem is virtual and discarded
with the process, but it cannot expose a port, so bridge-backed harnesses cannot use it.
Bridge-backed harnesses need a provider that can spawn processes **and** expose a
reachable port: `sandbox-vercel` or `sandbox-local-workspace`.
