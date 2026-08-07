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

## CLI workflow

Run all commands from the AI SDK repository root. The CLI manages its own
repository cache under `tools/memory-benchmark/.repos`; colleagues do not need
to create or populate `/tmp`.

Prerequisites are Node.js, Git, pnpm, npm, and Bun.

### 1. Clone and install the applications

```bash
pnpm benchmark:memory setup
```

Setup shallow-clones the four upstream repositories and installs their
dependencies with each repository's package manager. The exact commit is
recorded in every report, and existing clones are left at their current commit
so a later run does not silently change the baseline.

Setup can be limited or separated from dependency installation:

```bash
pnpm benchmark:memory setup --name scira
pnpm benchmark:memory setup --skip-install
```

### 2. Configure the scoped environment

```bash
cp tools/memory-benchmark/.env.example tools/memory-benchmark/.env
```

Fill values in that file. The CLI loads it into benchmark subprocesses without
copying secrets into the cloned repositories. `.env` and `.repos/` are ignored
by Git.

Minimum values by benchmark:

- **Scira:** `XAI_API_KEY`, `SCIRA_DATABASE_URL`,
  `SCIRA_BETTER_AUTH_SECRET`
- **SuperDesign:** `ANTHROPIC_API_KEY`
- **Shortest:** either `SHORTEST_ANTHROPIC_API_KEY` or `ANTHROPIC_API_KEY`
- **Neovate Code:** `ANTHROPIC_API_KEY`

### 3. Run

```bash
pnpm benchmark:memory run
```

The run command checks repositories, dependencies, environment variables, and
workload commands first. Incomplete applications are shown as `SKIP`; their
missing variable names are printed without exposing secret values. Ready
applications continue running.

Limit the run or override sampling:

```bash
pnpm benchmark:memory run --name neovate-code --iterations 5
pnpm benchmark:memory run --name scira --sample-interval 50 --verbose
```

The terminal prints peak RSS after each fresh-process iteration and prints the
result directory when complete.

### Sampler smoke test

```bash
pnpm benchmark:memory smoke
```

The smoke workload allocates memory in a child Node process and runs twice. It
tests process-tree discovery and report generation without provider keys.

## Observe and interpret results

Every run is written below a timestamped
`tools/memory-benchmark/results/<timestamp>/` directory:

- `report.md` is the quick human-readable summary.
- `report.json` contains aggregate statistics, host details, and Git commits.
- `<benchmark>/run-XX/samples.csv` is the raw time series.
- `<benchmark>/run-XX/summary.json` includes the process snapshot at peak RSS.
- `application.log` and `workload.log` explain failed or unusual runs.

**RSS (resident set size)** is the physical memory currently resident in RAM
for a process. This tool sums RSS across the application's complete process
group, including launchers, workers, browsers, and agent subprocesses. RSS is
not the same as JavaScript heap usage: it also includes native buffers, loaded
code, runtime data, and shared libraries as reported for each process.

Interpret the main columns as follows:

- **Peak RSS:** highest observed process-group memory. Use this as the primary
  CLI-application comparison.
- **Baseline RSS:** median idle memory after a server reports ready and before
  its request starts.
- **Peak delta:** peak RSS minus baseline RSS. This is the clearest estimate of
  incremental server workload memory.
- **Post-run RSS:** last live memory sample after the cooldown period.
- **Retained delta:** post-run RSS minus baseline RSS. A positive value can be a
  cache or retained state; one run does not prove a leak.
- **p95 RSS:** 95% of samples in the run were at or below this value.

The Markdown report shows medians across successful iterations. Use min, max,
and p95 values in `report.json` to assess variance. CLI applications report
baseline and retained fields as `n/a` because they have no stable idle state.

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
