# Neovate Code memory benchmark

This tool records a reproducible memory baseline for Neovate Code without
modifying or instrumenting the application.

It runs a fixed prompt against a small immutable fixture project and samples the
complete application process group every 100 ms. This includes the Bun process
and any subprocesses created by the coding agent.

## Setup

Run all commands from the AI SDK repository root. Prerequisites are Node.js,
Git, pnpm, and Bun.

Clone Neovate Code and install its dependencies:

```bash
pnpm benchmark:memory setup
```

Create the benchmark environment file:

```bash
cp tools/memory-benchmark/.env.example tools/memory-benchmark/.env
```

Set `ANTHROPIC_API_KEY` in that file. The CLI passes it to Neovate Code without
copying it into the cloned repository. Both `.env` and the `.repos/` cache are
ignored by Git.

## Run

```bash
pnpm benchmark:memory run
```

Before measuring, the CLI builds the current AI SDK workspace and links
Neovate Code's `ai` and `@ai-sdk/*` dependencies to the local packages. This
ensures each run measures the current checkout instead of Neovate Code's pinned
registry versions.

The benchmark runs five fresh-process iterations by default. Override the
iteration count or sampling interval when needed:

```bash
pnpm benchmark:memory run --iterations 1
pnpm benchmark:memory run --iterations 5 --sample-interval 50 --verbose
```

Use the synthetic smoke test to verify process-tree sampling and report
generation without an API key:

```bash
pnpm benchmark:memory smoke
```

## Results

Each benchmark invocation is written to the next numbered directory, beginning
with `tools/memory-benchmark/results/run-1/`.

- `report.md` is the human-readable summary.
- `report.json` contains aggregate statistics and host details.
- `neovate-code/run-XX/summary.json` contains metrics for one iteration.
- `neovate-code/run-XX/samples.csv` contains the raw time series.
- `neovate-code/run-XX/application.log` contains application output.

The primary comparison is peak RSS. The report also records mean, p50, and p95
RSS, virtual memory size, process count, the process snapshot at peak RSS,
duration, command, Git commit, dirty state, host, CPU, OS, and Node version.

RSS is the physical memory currently resident in RAM. It is not the same as the
JavaScript heap: it also includes native buffers, loaded code, runtime data, and
shared libraries reported for each process.

For comparable before-and-after measurements:

1. Pin Neovate Code to a commit and keep its working tree clean.
2. Keep the host, runtime, provider, model, prompt, and fixture unchanged.
3. Run at least five fresh-process iterations.
4. Avoid other heavy work during measurement.
5. Compare the median peak RSS and inspect min, max, and p95 for variance.
