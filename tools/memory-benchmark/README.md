# AI SDK application memory benchmark

This tool records a reproducible memory baseline for external applications that
use the AI SDK. It does not modify or instrument the applications.

It samples the complete application process group every 100 ms by default. This
is important because package-manager launchers, Next.js workers, Cloudflare
workers, browser processes, and coding-agent subprocesses would otherwise be
missed.

## Recorded data

Each run produces:

- total resident set size (RSS) across the process group
- virtual memory size (VSZ)
- process count
- mean, p50, p95, and peak RSS for every workload
- idle baseline, post-run RSS, and peak/retained deltas for server workloads
- the per-process snapshot at peak RSS
- raw timestamped samples in CSV
- application and workload logs
- command, Git commit, dirty state, host, CPU, OS, and Node version

The top-level `report.json` and `report.md` aggregate medians, minima, maxima,
and p95 values across iterations.

## Quick smoke test

From the repository root:

```bash
pnpm --dir tools/memory-benchmark smoke
```

The smoke workload allocates memory in a child Node process and runs twice. Its
result is written under `tools/memory-benchmark/results/`.

## Measure one command

Anything after `--` is the application command:

```bash
pnpm --dir tools/memory-benchmark benchmark \
  --name node-deep-research \
  --iterations 5 \
  -- \
  npm run dev -- "Compare HTTP/2 and HTTP/3 in five concise points."
```

Run this command from the target application's directory, or use config mode to
set the working directory explicitly.

## Run the six shortlisted applications

Clone and install the applications in one parent directory, then set:

```bash
export AI_SDK_BENCH_ROOT=/absolute/path/to/parent
export AI_SDK_BENCH_FIXTURE=/absolute/path/to/immutable-fixture-repo
```

The example config expects these child directory names:

```text
scira/
zero-mail/
superdesign/
shortest/
node-deep-research/
neovate-code/
```

List or run configured benchmarks:

```bash
pnpm --dir tools/memory-benchmark benchmark \
  --config benchmarks.example.json \
  --list

pnpm --dir tools/memory-benchmark benchmark \
  --config benchmarks.example.json \
  --name node-deep-research
```

Scira and Zero are long-running servers. Supply a fixed request as a shell
command so the harness can establish an idle baseline, execute the workload,
consume the full stream, observe cooldown, and stop the server:

```bash
export SCIRA_MEMORY_WORKLOAD='curl --no-buffer ...'
export ZERO_MEMORY_WORKLOAD='curl --no-buffer ...'
```

Use authenticated request recordings or Playwright scripts when a plain curl
request cannot reproduce the application flow. The workload process itself is
not included in the application's measured process group.

## Baseline protocol

For useful "before optimization" data:

1. Pin every repository to a commit and keep its working tree clean.
2. Use the same OS, runtime, package-manager version, provider, and model.
3. Fix prompt, conversation history, tool results, token limits, retries, and
   concurrency.
4. Run at least five fresh-process iterations.
5. Avoid other heavy work on the machine.
6. For server applications, compare peak and retained _deltas_ from the idle
   baseline. Also retain absolute RSS because infrastructure is part of the
   deployed cost.
7. CLI applications have no meaningful idle or post-run state, so those fields
   are reported as `n/a`. Compare peak RSS and the full time series instead.

The browser in Shortest and the VS Code extension host in SuperDesign can
dominate absolute RSS. Keep them because they represent real application cost,
but report their process snapshots separately when interpreting AI SDK memory.

## Configuration fields

Each benchmark supports:

- `name`: stable result name
- `cwd`: working directory; `${ENVIRONMENT_VARIABLE}` expansion is supported
- `command`: string or argument array
- `env`: additional application environment variables
- `iterations`, `sampleIntervalMs`, `timeoutMs`: per-benchmark overrides
- `readyPattern`: regular expression matched against server output
- `startupTimeoutMs`: maximum wait for `readyPattern`
- `baselineDurationMs`: idle sampling before a workload
- `workloadCommand`: request or test command run after readiness
- `cooldownMs`: sampling period after the workload
- `durationMs`: fixed measurement window when there is no workload command
- `terminateGraceMs`: graceful shutdown window
- `tags` and `notes`: metadata copied into reports

## Scope

RSS is an operating-system measurement. It includes JavaScript heaps, native
buffers, loaded code, shared libraries as reported per process, and child
processes. It does not identify individual retained JavaScript objects.

That is intentional for the initial baseline: the harness provides comparable
application-level memory data without changing execution behavior. Heap
snapshots or allocation profiling can be added later for a smaller workload
only after the baseline identifies where deeper investigation is useful.
