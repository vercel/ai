# Example: gating `git` inside `bash`

A worked, runnable example of transitive enforcement: the agent has a coarse
[`bash`](https://github.com/vercel-labs/bash-tool) tool (input `{ command }`)
and could run any git operation through it. This policy allows only **read-only
git** and denies everything else — `git clone`, `git push`, remote mutations —
whether the model shells out via `bash` or calls a granular `git` tool directly.

The key idea: the dispatcher's `toInput` reduces a bash command to a logical
action, and **anything it cannot reduce to a single clean git invocation is
denied by default**. Bash is adversarial to parse, so "can't prove it's safe"
means "deny".

## Files

- `policy.rego` — the policy. Read-only git allowlist + default-deny.
- `policy_test.rego` — OPA unit tests (allow/deny/unparseable paths).
- `parse-git-invocation.ts` — the fail-closed command parser used by `toInput`.
- `parse-git-invocation.test.ts` — unit tests for the parser.
- `git-in-bash.ts` — runnable demo wiring the policy through `generateText`.

## Run the policy tests (no Node deps)

```sh
opa test packages/policy-opa/examples/git-in-bash
```

```
PASS: 8/8
```

## Run the parser tests

```sh
pnpm --filter @ai-sdk/policy-opa test:node parse-git-invocation
```

## Run the end-to-end demo

The OPA HTTP backend is an optional peer dependency, and the demo talks to a
running OPA server:

```sh
pnpm add @open-policy-agent/opa
opa run --server --addr :8181 packages/policy-opa/examples/git-in-bash
pnpm tsx packages/policy-opa/examples/git-in-bash/git-in-bash.ts
```

Expected output:

```
bash: git status                         allowed → ran: git status
bash: git log --oneline                  allowed → ran: git log --oneline
bash: git remote -v                      allowed → ran: git remote -v
bash: git clone https://example.com/x.git   DENIED → git clone is not permitted (read-only git only)
bash: cd /tmp && git clone ...           DENIED → command not permitted by policy
git status                               allowed → git status: ok
git clone https://example.com/x.git      DENIED → git clone is not permitted (read-only git only)
```

## How a decision is reached

The bash `toInput` (`bashCommandToInput`) turns `{ command }` into the action
the policy decides on:

| `command`                        | derived OPA input                                     | decision |
| -------------------------------- | ----------------------------------------------------- | -------- |
| `git status`                     | `{ kind: "git", subcommand: "status", args: [] }`     | allow    |
| `git remote -v`                  | `{ kind: "git", subcommand: "remote", args: ["-v"] }` | allow    |
| `git clone https://x`            | `{ kind: "git", subcommand: "clone", args: [...] }`   | deny     |
| `cd /tmp && git clone https://x` | `{ kind: "bash", command: "cd /tmp && ..." }`         | deny     |
| `git status \| sh`               | `{ kind: "bash", command: "git status \| sh" }`       | deny     |

The last two never become a `git` action: the parser sees shell metacharacters
(`&&`, `|`, `;`, redirects, subshells, command substitution) and returns `null`,
so the command is handed to OPA as `kind: "bash"`, which the policy default-denies.

## The honest limitation

This gates the command the model _asks_ to run. It cannot stop a tool that, once
allowed, performs side effects beyond what its input describes, and the parser is
deliberately conservative rather than a full shell grammar. For untrusted
execution, pair this with an out-of-band sandbox and treat the sandbox boundary
as the trust frontier.
