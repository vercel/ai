# run

`run` is a secure and efficient alternative to `eval` for coding agents with
support for TypeScript.

It is suitable for code-mode, code interpreter, or other patterns that require
execution of untrusted JS or TS.

`run` executes JavaScript in a hardened QuickJS sandbox. Guest code starts with
no access to Node.js, the filesystem, environment variables, modules, or the
network; it can call only the host functions you explicitly bind.

Bindings can be any normal JavaScript or TypeScript functions. They can also interrupt 
execution for approval or authentication and resume later without repeating already
invoked bindings.

## Install

```sh
pnpm add run
```

`run` requires Node.js 22.13 or newer.

## Run JavaScript

```ts
import { run } from 'run';

const result = await run({
  source: `
    const total = await tools.sum(1, 2, 3, 4);
    return { total };
  `,
  bindings: {
    tools: {
      sum: (...values: number[]) =>
        values.reduce((total, value) => total + value, 0),
    },
  },
});

if (result.status === 'completed') {
  console.log(result.value); // { total: 10 }
}
```

Each run uses a fresh QuickJS context inside a worker thread. Top-level `await`
and `return` are supported in `source`.

## Bindings

A binding group becomes a global with the same name inside the sandbox. Guest
arguments map one-for-one to the host function:

```text
guest                                 host
tools.sum(1, 2, 3, 4)        ─────▶   sum(1, 2, 3, 4)
users.find({ id: 'user-1' }) ─────▶   find({ id: 'user-1' })
clock.now()                  ─────▶   now()
```

Bindings may be synchronous or asynchronous:

```ts
const bindings = {
  users: {
    find: async (input: { id: string }) => database.users.find(input.id),
  },
  tools: {
    add: (left: number, right: number) => left + right,
    join: (separator: string, ...values: string[]) => values.join(separator),
  },
};
```

Arguments cross the QuickJS boundary as one serialized array. Their count and
positions are preserved, including explicit `undefined` arguments.

### Values across the sandbox boundary

`run` uses the versioned `run-js-v1` format in both directions. It supports:

- primitives, including `undefined`, `BigInt`, `NaN`, infinities, and `-0`;
- plain objects, arrays, sparse arrays, cycles, and repeated references;
- `Date`, `RegExp`, `Map`, and `Set`;
- `ArrayBuffer`, `DataView`, and typed arrays; and
- `Error` values, including `name`, `message`, `cause`, and
  `AggregateError.errors`.

References are preserved within one transferred value graph. Separate binding
calls are separate transfers and do not share object identity. Plain objects
are reconstructed as plain objects rather than retaining custom prototypes.
Error stacks are regenerated in the receiving realm and are not transferred.

Functions, symbols, promises, weak collections, and arbitrary class instances
cannot cross the boundary. Returning one fails with a serialization error that
includes its path when available. Keep capabilities in host bindings and send
data through their arguments and results.

### Binding context

Call `getBindingContext()` when a binding needs runtime metadata, cancellation,
or interruption. Context is not a guest argument, so the binding signature
continues to match the call made in sandboxed JavaScript.

```ts
import { getBindingContext } from 'run';

const bindings = {
  documents: {
    save: async (document: Document) => {
      const { abortSignal, logicalRunId } = getBindingContext();
      return database.save(document, { abortSignal, logicalRunId });
    },
  },
};
```

The context is isolated for each concurrent binding call and follows awaited
asynchronous work. `getBindingContext()` throws outside an active binding and
from detached work after the binding settles or is aborted.

`BindingContext` contains:

| Property             | Meaning                                                     |
| -------------------- | ----------------------------------------------------------- |
| `abortSignal`        | Aborted when the run is cancelled, times out, or fails      |
| `bindingName`        | Fully qualified name such as `tools.sum`                    |
| `logicalRunId`       | Stable across every continuation replay                     |
| `invocationId`       | Identifies the current execution attempt                    |
| `requestId`          | Identifies this binding request in the current attempt      |
| `requestIndex`       | One-based binding request order                             |
| `interrupt(payload)` | Suspends the run; its return type is `never`                |
| `resume`             | Resolution metadata when an interrupted binding is replayed |

## Interrupt and resume

Bindings can pause a run before a protected operation. Configure one shared
secret for every process that can create or resume continuations:

```sh
export RUN_CONTINUATION_SECRET="$(openssl rand -base64 32)"
```

`run()` reads `RUN_CONTINUATION_SECRET` automatically.

```ts
import { getBindingContext, run } from 'run';

const source = `return await documents.publish('draft-1');`;
const bindings = {
  documents: {
    publish: async (draftId: string) => {
      const { interrupt, resume } = getBindingContext();

      if (resume === undefined) {
        interrupt({
          kind: 'approval',
          message: `Publish ${draftId}?`,
        });
      }

      if (resume.resolution !== true) {
        throw new Error('Publishing was not approved.');
      }

      return publishDraft(draftId);
    },
  },
};

const first = await run({ source, bindings });

if (first.status === 'interrupted') {
  const completed = await run({
    source,
    bindings,
    continuation: first.continuation,
    resolutions: first.interruptions.map(interruption => ({
      interruptionId: interruption.id,
      value: true,
    })),
  });
}
```

Ordinary runs need no continuation configuration. If a binding interrupts
without `RUN_CONTINUATION_SECRET`, `continuationSecret`, or a
`continuationCodec`, the run fails with a configuration error.

See [Continuations](#continuations) for replay behavior, multi-process
deployment, multiple interruptions, storage-backed tokens, and key rotation.

## Configure a runner

Use `createRunner()` to share limits and continuation configuration:

```ts
import { createRunner } from 'run';

const runner = createRunner({
  limits: {
    timeoutMs: 10_000,
    memoryLimitBytes: 32 * 1024 * 1024,
  },
  continuationSecret: process.env.RUN_CONTINUATION_SECRET!,
  continuationAudience: 'publish-endpoint-v1',
});

const result = await runner.run({
  source: 'return await api.lookup("item-1");',
  bindings: {
    api: {
      lookup: (id: string) => database.get(id),
    },
  },
});
```

`continuationSecret` must contain at least 32 bytes. It takes precedence over
the environment variable. Supplying both `continuationSecret` and
`continuationCodec` is an error.

Per-run limits override runner defaults. An `abortSignal` cancels an active
invocation and is available through `getBindingContext()`.

| Limit                                  |    Default |
| -------------------------------------- | ---------: |
| Timeout                                | 30 seconds |
| QuickJS memory                         |     64 MiB |
| QuickJS stack                          |      2 MiB |
| Source                                 |    256 KiB |
| Result                                 |      1 MiB |
| Console output                         |     64 KiB |
| Binding arguments                      |      1 MiB |
| Binding output or interruption payload |      4 MiB |
| Bridge requests                        |        256 |
| Concurrent bridge requests             |         32 |
| Continuation                           |     32 MiB |

All limits must be positive integers. The process-wide worker cap rejects
excess invocations with `RunConcurrencyError`; `run` does not retain an
unbounded queue. The cap and worker pool are shared by every runner and by
packages such as `@ai-sdk/code-mode` in the same process.

## Continuations

### Multi-process signing

Set the same `RUN_CONTINUATION_SECRET` on every server instance, worker, and
resume endpoint. The convenience `run()` function and runners without explicit
continuation options use it automatically. This lets any process verify and
resume a continuation produced by another process or by an earlier deployment
instance.

For application-managed configuration, pass the same `continuationSecret` to
each runner. For custom expiry or signing-key rotation, construct the codec
directly:

```ts
import { createRunner, createSignedContinuationCodec } from 'run';

const runner = createRunner({
  continuationCodec: createSignedContinuationCodec({
    secret: process.env.RUN_CONTINUATION_SECRET_CURRENT!,
    verificationSecrets: [process.env.RUN_CONTINUATION_SECRET_PREVIOUS!],
  }),
});
```

New tokens use only `secret`; `verificationSecrets` are accepted only while
verifying old tokens.

### Replay behavior

A continuation contains a replay ledger. On resume, completed and rejected
bindings are read from that ledger instead of being invoked again. The runtime
replays the program and reinvokes only interrupted bindings that now have a
resolution.

Replay verifies the source, binding-name manifest, and complete serialized
argument list for every binding call. Guest `Date`, `Date.now()`, and
`Math.random()` remain deterministic across replay. Divergence is rejected
before a mismatched binding executes.

An interrupted binding itself is reinvoked. Call `interrupt()` before doing
non-idempotent work. For writes that may be retried, use
`getBindingContext().resume.interruptionId` as a stable idempotency key.

`interrupt()` uses an internal throw. Do not catch it inside the binding. The
runtime catches it at the host boundary and returns an interrupted result.

### Multiple interruptions

Concurrent binding calls may interrupt together. The result contains the full
batch and one continuation:

```ts
const result = await run({
  source: `
    return await Promise.all([
      actions.deleteAccount('account-1'),
      actions.sendPayment('payment-1'),
    ]);
  `,
  bindings,
});

if (result.status === 'interrupted') {
  // Present the complete batch to the user, then resolve every item together.
  await run({
    source,
    bindings,
    continuation: result.continuation,
    resolutions: result.interruptions.map(interruption => ({
      interruptionId: interruption.id,
      value: approvals[interruption.id],
    })),
  });
}
```

Every interruption in a returned batch must be resolved together. Bindings
reached later may create another interruption round after replay.
Each interruption also exposes the complete guest call as its `arguments`
array.

### Scope and authorization

Signed continuations are bound to the runner audience, transformed source,
binding-name manifest, and `continuationContext`. For tenant-, user-, or
policy-scoped execution, provide authenticated context on both the initial run
and every resume:

```ts
await runner.run({
  source,
  bindings,
  continuationContext: { tenantId, userId, policyVersion },
});
```

A mismatch is rejected before replayed results are returned or an interrupted
binding is reinvoked. The resume endpoint must still authorize the actor who
submits each resolution. A valid continuation proves integrity and scope; it
does not grant approval by itself.

### Token security and storage

Signed continuations are self-contained, replayable bearer tokens. They
provide integrity, not confidentiality: source, arguments, results, errors,
and interruption payloads are base64-encoded but not encrypted.

For sensitive or at-most-once flows, use `createStoredContinuationCodec()`.
Its storage contract atomically consumes a token during decode and enforces
expiry. Because `take()` happens before later replay validation, any subsequent
failure burns that continuation. Storage implementations should honor the
operation `AbortSignal` and deadline.

> A custom continuation codec used across a trust boundary must authenticate
> its state and reject tampering. An unauthenticated codec lets an attacker
> forge completed effects and resume payloads. Prefer the signed or
> storage-backed codecs unless a custom implementation provides equivalent
> integrity and scope validation.

Custom codecs receive versioned replay state plus an operation context with an
`abortSignal` and `deadlineMs`. Treat continuation tokens as opaque; the replay
state is an advanced API that may evolve between releases.

Replay state identifies its value codec as `run-js-v1`. Serialized binding
arguments, results, interruption payloads, and resolutions remain opaque
strings inside the JSON continuation envelope, so rich and cyclic values do
not weaken canonical signing.

## Security model

Sandboxed code has no ambient access to Node.js, the filesystem, environment
variables, modules, network APIs, timers, `crypto`, or high-resolution clocks.
Dynamic evaluation is disabled and built-in prototypes are frozen. Host access
is limited to declared bindings and serialized values crossing the worker
boundary.

Binding groups and functions must be own properties. Inherited prototype
members are never capabilities. Guest namespaces cannot replace JavaScript
builtins or runtime internals.

Resource limits reduce denial-of-service risk, but bindings remain
security-sensitive capabilities. Validate authentication, authorization, and
application input in the host environment.

## Errors and retries

Runtime failures extend `RunError` and expose a stable `code`:

- `RUN_ABORTED`, `RUN_TIMEOUT`, and `RUN_CONCURRENCY_LIMIT` may be retried when
  host effects are safe to retry.
- `RUN_PROTOCOL_ERROR` indicates malformed, tampered, expired, or divergent
  continuation state. Do not retry unchanged input.
- `RUN_BINDING_ERROR` comes from capability lookup or binding execution.
- `RUN_BRIDGE_LIMIT`, `RUN_SOURCE_TOO_LARGE`, and serialization failures require
  changing the source, values, or limits.
- `RUN_DETACHED_BRIDGE_REQUEST` means guest code returned without correctly
  awaiting bridge work.

Syntax and runtime error stacks use `run.js` and line numbers from the exact
`source` string passed to `run`. Generated wrapper and sandbox-runtime frames
are omitted. The same coordinates are retained after supported TypeScript
syntax is stripped and when an awaited binding rejects:

```text
Error: calculation failed
    at calculate (run.js:4:9)
    at <anonymous> (run.js:7:16)
```

Columns are reported by QuickJS. Stacks belonging to `Error` objects returned
as ordinary data are not transferred; this stack behavior applies to errors
that escape execution.

Workers that cannot reach a verified clean state after abort, timeout, protocol
failure, or detached work are retired. Every invocation receives a fresh
QuickJS context, including invocations on reused worker threads.
