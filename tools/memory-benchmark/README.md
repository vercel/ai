# Neovate Code memory benchmark

This tool runs Neovate Code in an ephemeral Linux VM using Apple's
[`container`](https://github.com/apple/container) CLI. The host injects the
Anthropic credential through a local proxy, so the key never enters the VM.
Neovate receives only read-only tools and runs with its default approval mode.

## Setup

Requirements: Apple silicon, macOS 26, Apple `container`, and Node.js.

Create the scoped environment file:

```bash
cp tools/memory-benchmark/.env.example tools/memory-benchmark/.env
```

Set `ANTHROPIC_API_KEY`, then optionally prebuild the sandbox image:

```bash
pnpm benchmark:memory setup
```

The image contains a pinned Neovate checkout and a Turbo-pruned copy of the
required AI SDK packages. Dependencies are cached separately from source
changes; credentials, repositories, existing results, and `node_modules` are
excluded.

## Run

```bash
pnpm benchmark:memory run
pnpm benchmark:memory run --iterations 1
pnpm benchmark:memory run --iterations 5 --sample-interval 50 --verbose
```

`run` builds the cached image, starts the host credential proxy, and runs five
fresh-process iterations inside an 8 GiB, four-CPU VM. The benchmark runner and
its `ps` sampler both run inside the VM, so RSS covers Bun, Neovate, and its
child processes. Only the dedicated results directory is mounted from the host;
the CLI deletes the container when the run ends.

Use the native synthetic smoke test to check sampling without an API key:

```bash
pnpm benchmark:memory smoke
```

## Results

Each invocation writes the next
`tools/memory-benchmark/results/run-N/` directory:

- `report.md` is the human-readable summary.
- `report.json` contains aggregates and guest host details.
- `neovate-code/run-XX/summary.json` contains one iteration.
- `neovate-code/run-XX/samples.csv` contains its raw time series.
- `neovate-code/run-XX/application.log` contains application output.

RSS is total resident memory reported for the complete guest process group, not
JavaScript heap or total VM memory. Compare runs made with the same image,
runtime, model, prompt, host load, and VM resources; the primary value is median
peak RSS across at least five iterations.
