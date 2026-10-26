import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const DEFAULTS = {
  iterations: 5,
  sampleIntervalMs: 100,
  startupTimeoutMs: 120_000,
  timeoutMs: 10 * 60_000,
  baselineDurationMs: 2_000,
  cooldownMs: 2_000,
  terminateGraceMs: 5_000,
};

export const HELP = `
Measure the resident memory of an application and its complete process tree.

Config mode:
  node src/benchmark.mjs --config benchmarks.example.json
  node src/benchmark.mjs --config benchmarks.example.json --name neovate-code

Direct command mode:
  node src/benchmark.mjs --name my-app --iterations 5 -- node app.js

Options:
  --config <path>          JSON benchmark configuration
  --name <name>            Run one named benchmark, or name a direct command
  --iterations <count>     Override iteration count
  --sample-interval <ms>   Override sampling interval
  --output <directory>     Results directory
  --list                   List configured benchmarks
  --verbose                Mirror application output to this terminal
  --help                   Show this help
`.trim();

export function parseArguments(argv) {
  const options = {
    command: [],
    names: [],
    verbose: false,
    list: false,
  };

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];

    if (argument === '--') {
      options.command = argv.slice(index + 1);
      break;
    }

    if (argument === '--help' || argument === '-h') {
      options.help = true;
    } else if (argument === '--verbose') {
      options.verbose = true;
    } else if (argument === '--list') {
      options.list = true;
    } else if (
      [
        '--config',
        '--name',
        '--iterations',
        '--sample-interval',
        '--output',
      ].includes(argument)
    ) {
      const value = argv[++index];
      if (value == null) {
        throw new Error(`Missing value for ${argument}`);
      }
      const key = {
        '--config': 'config',
        '--name': 'name',
        '--iterations': 'iterations',
        '--sample-interval': 'sampleIntervalMs',
        '--output': 'output',
      }[argument];
      const parsedValue =
        argument === '--iterations' || argument === '--sample-interval'
          ? parsePositiveInteger(value, argument)
          : value;
      options[key] = parsedValue;
      if (argument === '--name') options.names.push(parsedValue);
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return options;
}

function parsePositiveInteger(value, option) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${option} must be a positive integer`);
  }
  return parsed;
}

function expandEnvironmentVariables(value) {
  if (typeof value === 'string') {
    return value.replace(/\$\{([^}]+)\}/g, (_, name) => {
      const replacement = process.env[name];
      if (replacement == null) {
        throw new Error(`Environment variable ${name} is not set`);
      }
      return replacement;
    });
  }

  if (Array.isArray(value)) {
    return value.map(expandEnvironmentVariables);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        expandEnvironmentVariables(nestedValue),
      ]),
    );
  }

  return value;
}

export async function loadBenchmarks(options) {
  if (options.command.length > 0) {
    return {
      defaults: DEFAULTS,
      benchmarks: [
        {
          name: options.name ?? path.basename(options.command[0]),
          cwd: process.cwd(),
          command: options.command,
        },
      ],
    };
  }

  if (!options.config) {
    throw new Error('Provide --config <path> or a command after --');
  }

  const configPath = path.resolve(options.config);
  const configDirectory = path.dirname(configPath);
  const parsed = JSON.parse(await readFile(configPath, 'utf8'));

  if (!Array.isArray(parsed.benchmarks) || parsed.benchmarks.length === 0) {
    throw new Error('Configuration must contain a non-empty benchmarks array');
  }

  const selectedBenchmarks =
    options.names.length === 0
      ? parsed.benchmarks
      : parsed.benchmarks.filter(benchmark =>
          options.names.includes(benchmark.name),
        );

  return {
    defaults: {
      ...DEFAULTS,
      ...expandEnvironmentVariables(parsed.defaults),
    },
    benchmarks: selectedBenchmarks.map(unexpandedBenchmark => {
      const benchmark = expandEnvironmentVariables(unexpandedBenchmark);
      return {
        ...benchmark,
        cwd: path.resolve(configDirectory, benchmark.cwd ?? '.'),
      };
    }),
  };
}

export function validateBenchmark(benchmark) {
  if (!benchmark.name || typeof benchmark.name !== 'string') {
    throw new Error('Every benchmark needs a string name');
  }
  if (
    !(
      typeof benchmark.command === 'string' ||
      (Array.isArray(benchmark.command) && benchmark.command.length > 0)
    )
  ) {
    throw new Error(`${benchmark.name}: command must be a string or array`);
  }
  if (
    benchmark.workloadCommand != null &&
    !(
      typeof benchmark.workloadCommand === 'string' ||
      (Array.isArray(benchmark.workloadCommand) &&
        benchmark.workloadCommand.length > 0)
    )
  ) {
    throw new Error(
      `${benchmark.name}: workloadCommand must be a string or array`,
    );
  }
}
