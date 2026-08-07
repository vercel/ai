#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { access, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const toolDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const defaultRepositoriesDirectory = path.join(toolDirectory, '.repos');
const defaultEnvPath = path.join(toolDirectory, '.env');
const benchmarkConfigPath = path.join(
  toolDirectory,
  'benchmarks.example.json',
);
const benchmarkRunnerPath = path.join(toolDirectory, 'src', 'benchmark.mjs');
const fixtureDirectory = path.join(toolDirectory, 'fixtures', 'code-project');

const repositories = [
  {
    name: 'scira',
    directory: 'scira',
    url: 'https://github.com/zaidmukaddam/scira.git',
    install: ['bun', 'install', '--frozen-lockfile'],
    requiredEnv: [
      'XAI_API_KEY',
      'SCIRA_DATABASE_URL',
      'SCIRA_BETTER_AUTH_SECRET',
    ],
    requiredEnvAny: [],
    workloadEnv: [],
  },
  {
    name: 'superdesign',
    directory: 'superdesign',
    url: 'https://github.com/superdesigndev/superdesign.git',
    install: ['npm', 'ci'],
    requiredEnv: ['ANTHROPIC_API_KEY'],
    requiredEnvAny: [],
    workloadEnv: [],
  },
  {
    name: 'shortest',
    directory: 'shortest',
    url: 'https://github.com/antiwork/shortest.git',
    install: ['pnpm', 'install', '--frozen-lockfile'],
    prepare: ['pnpm', 'cli:build'],
    requiredEnv: [],
    requiredEnvAny: [
      ['SHORTEST_ANTHROPIC_API_KEY', 'ANTHROPIC_API_KEY'],
    ],
    workloadEnv: [],
  },
  {
    name: 'neovate-code',
    directory: 'neovate-code',
    url: 'https://github.com/neovateai/neovate-code.git',
    install: ['pnpm', 'install', '--frozen-lockfile'],
    requiredEnv: ['ANTHROPIC_API_KEY'],
    requiredEnvAny: [],
    workloadEnv: [],
  },
];

const HELP = `
AI SDK application memory benchmark

Usage:
  pnpm benchmark:memory setup [options]
  pnpm benchmark:memory run [options]
  pnpm benchmark:memory smoke

Commands:
  setup     Clone the four repositories and install their dependencies
  run       Run every ready benchmark; incomplete benchmarks are skipped
  smoke     Run the synthetic memory sampler smoke test

Options:
  --name <name>          Limit setup or run to a benchmark (repeatable)
  --repos-dir <path>     Repository cache (default: tools/memory-benchmark/.repos)
  --dotenv <path>        Scoped env file (default: tools/memory-benchmark/.env)
  --skip-install         Clone repositories without installing dependencies
  --iterations <count>   Override benchmark iterations
  --sample-interval <ms> Override sampling interval
  --output <path>        Results directory
  --verbose              Mirror application output during benchmark runs
  --help                 Show this help
`.trim();

function parseOptions(arguments_) {
  const options = {
    names: [],
    repositoriesDirectory: defaultRepositoriesDirectory,
    envPath: defaultEnvPath,
    skipInstall: false,
    verbose: false,
  };

  for (let index = 0; index < arguments_.length; index++) {
    const argument = arguments_[index];
    if (argument === '--help' || argument === '-h') {
      options.help = true;
    } else if (argument === '--skip-install') {
      options.skipInstall = true;
    } else if (argument === '--verbose') {
      options.verbose = true;
    } else if (
      [
        '--name',
        '--repos-dir',
        '--dotenv',
        '--iterations',
        '--sample-interval',
        '--output',
      ].includes(argument)
    ) {
      const value = arguments_[++index];
      if (value == null) throw new Error(`Missing value for ${argument}`);
      if (argument === '--name') options.names.push(value);
      else if (argument === '--repos-dir') {
        options.repositoriesDirectory = path.resolve(value);
      } else if (argument === '--dotenv') {
        options.envPath = path.resolve(value);
      } else if (argument === '--iterations') {
        options.iterations = parsePositiveInteger(value, argument);
      } else if (argument === '--sample-interval') {
        options.sampleIntervalMs = parsePositiveInteger(value, argument);
      } else if (argument === '--output') {
        options.output = path.resolve(value);
      }
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }

  return options;
}

function parsePositiveInteger(value, option) {
  const result = Number.parseInt(value, 10);
  if (!Number.isFinite(result) || result <= 0) {
    throw new Error(`${option} must be a positive integer`);
  }
  return result;
}

function selectRepositories(names) {
  if (names.length === 0) return repositories;
  const selected = repositories.filter(repository =>
    names.includes(repository.name),
  );
  const unknown = names.filter(
    name => !repositories.some(repository => repository.name === name),
  );
  if (unknown.length > 0) {
    throw new Error(`Unknown benchmark: ${unknown.join(', ')}`);
  }
  return selected;
}

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function runCommand(command, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: options.stdio ?? 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else {
        reject(
          new Error(
            `${command.join(' ')} exited with ${code ?? signal ?? 'unknown'}`,
          ),
        );
      }
    });
  });
}

async function readCommandOutput(command, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => {
      stdout += chunk;
    });
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('exit', code => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || `Command exited with ${code}`));
    });
  });
}

function parseEnvFile(contents) {
  const values = {};
  for (const sourceLine of contents.split(/\r?\n/)) {
    let line = sourceLine.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('export ')) line = line.slice(7).trim();
    const equals = line.indexOf('=');
    if (equals < 1) continue;
    const key = line.slice(0, equals).trim();
    let value = line.slice(equals + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, '');
    }
    values[key] = value;
  }
  return values;
}

async function loadScopedEnvironment(envPath) {
  if (!(await pathExists(envPath))) return {};
  return parseEnvFile(await readFile(envPath, 'utf8'));
}

function isConfigured(environment, name) {
  const value = environment[name];
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    !/^(your_|replace_|changeme|api_key$)/i.test(value.trim())
  );
}

function missingEnvironment(repository, environment) {
  const missing = repository.requiredEnv.filter(
    name => !isConfigured(environment, name),
  );
  const missingAny = repository.requiredEnvAny.filter(
    group => !group.some(name => isConfigured(environment, name)),
  );
  const missingWorkload = repository.workloadEnv.filter(
    name => !isConfigured(environment, name),
  );
  return { missing, missingAny, missingWorkload };
}

async function setup(options) {
  const selected = selectRepositories(options.names);
  await mkdir(options.repositoriesDirectory, { recursive: true });
  const failures = [];

  console.log(`Repository cache: ${options.repositoriesDirectory}\n`);

  for (const repository of selected) {
    const target = path.join(
      options.repositoriesDirectory,
      repository.directory,
    );
    console.log(`${repository.name}`);

    try {
      if (await pathExists(path.join(target, '.git'))) {
        const commit = await readCommandOutput(
          ['git', 'rev-parse', '--short', 'HEAD'],
          target,
        );
        console.log(`  repository already present (${commit})`);
      } else {
        console.log(`  cloning ${repository.url}`);
        await runCommand([
          'git',
          'clone',
          '--depth',
          '1',
          '--filter=blob:none',
          repository.url,
          target,
        ]);
      }

      if (!options.skipInstall) {
        console.log(`  installing: ${repository.install.join(' ')}`);
        await runCommand(repository.install, { cwd: target });
        if (repository.prepare) {
          console.log(`  preparing: ${repository.prepare.join(' ')}`);
          await runCommand(repository.prepare, { cwd: target });
        }
      }
      console.log('  ready\n');
    } catch (error) {
      failures.push({ name: repository.name, error: error.message });
      console.warn(`  setup failed: ${error.message}\n`);
    }
  }

  if (!(await pathExists(options.envPath))) {
    console.log(`Create the scoped environment file before running benchmarks:`);
    console.log(
      `  cp ${path.join(toolDirectory, '.env.example')} ${options.envPath}`,
    );
  }

  if (failures.length > 0) {
    console.warn(
      `\nSetup completed with ${failures.length} failure(s). Fix them and rerun setup.`,
    );
  } else {
    console.log('Setup complete. Next: configure .env, then run pnpm benchmark:memory run');
  }
}

async function checkReadiness(options, { print = true } = {}) {
  const selected = selectRepositories(options.names);
  const scoped = await loadScopedEnvironment(options.envPath);
  const environment = { ...scoped, ...process.env };
  const results = [];

  if (print) {
    console.log(`Repository cache: ${options.repositoriesDirectory}`);
    console.log(`Environment file: ${options.envPath}\n`);
  }

  for (const repository of selected) {
    const repositoryPath = path.join(
      options.repositoriesDirectory,
      repository.directory,
    );
    const repositoryReady = await pathExists(
      path.join(repositoryPath, '.git'),
    );
    const dependenciesReady = await pathExists(
      path.join(repositoryPath, 'node_modules'),
    );
    const missing = missingEnvironment(repository, environment);
    const ready =
      repositoryReady &&
      dependenciesReady &&
      missing.missing.length === 0 &&
      missing.missingAny.length === 0 &&
      missing.missingWorkload.length === 0;

    results.push({
      repository,
      repositoryPath,
      repositoryReady,
      dependenciesReady,
      ...missing,
      ready,
    });

    if (print) {
      console.log(`${ready ? 'READY' : 'SKIP '} ${repository.name}`);
      if (!repositoryReady) {
        console.log('  - repository missing; run setup');
      } else if (!dependenciesReady) {
        console.log('  - dependencies missing; rerun setup');
      }
      if (missing.missing.length > 0) {
        console.log(`  - missing: ${missing.missing.join(', ')}`);
      }
      for (const group of missing.missingAny) {
        console.log(`  - set one of: ${group.join(', ')}`);
      }
      if (missing.missingWorkload.length > 0) {
        console.log(
          `  - workload command missing: ${missing.missingWorkload.join(', ')}`,
        );
      }
      console.log();
    }
  }

  if (print && results.some(result => !result.ready)) {
    console.warn(
      'Incomplete benchmarks are soft-skipped. Define values in tools/memory-benchmark/.env and rerun.',
    );
  }

  return { environment, results };
}

async function runBenchmarks(options) {
  const diagnosis = await checkReadiness(options);
  const ready = diagnosis.results.filter(result => result.ready);
  if (ready.length === 0) {
    console.warn('\nNo benchmarks are ready; nothing was run.');
    return;
  }

  const environment = {
    ...diagnosis.environment,
    AI_SDK_BENCH_ROOT: options.repositoriesDirectory,
    AI_SDK_BENCH_FIXTURE:
      diagnosis.environment.AI_SDK_BENCH_FIXTURE || fixtureDirectory,
    AI_SDK_MEMORY_TOOL_DIR: toolDirectory,
  };
  const command = [
    process.execPath,
    benchmarkRunnerPath,
    '--config',
    benchmarkConfigPath,
  ];
  for (const result of ready) {
    command.push('--name', result.repository.name);
  }
  if (options.iterations) {
    command.push('--iterations', String(options.iterations));
  }
  if (options.sampleIntervalMs) {
    command.push('--sample-interval', String(options.sampleIntervalMs));
  }
  if (options.output) command.push('--output', options.output);
  if (options.verbose) command.push('--verbose');

  console.log(
    `\nRunning ${ready.length} benchmark(s): ${ready.map(result => result.repository.name).join(', ')}`,
  );
  await runCommand(command, { cwd: toolDirectory, env: environment });
}

async function smoke() {
  await runCommand(
    [
      process.execPath,
      benchmarkRunnerPath,
      '--name',
      'smoke',
      '--iterations',
      '2',
      '--sample-interval',
      '50',
      '--',
      process.execPath,
      '-e',
      "const values=[];let i=0;const timer=setInterval(()=>{values.push(Buffer.alloc(4*1024*1024,1));if(++i===4){clearInterval(timer);setTimeout(()=>process.exit(0),100)}},75)",
    ],
    { cwd: toolDirectory },
  );
}

async function main() {
  const [command = 'help', ...arguments_] = process.argv.slice(2);
  if (command === '--help' || command === '-h') {
    console.log(HELP);
    return;
  }
  const options = parseOptions(arguments_);

  if (options.help || command === 'help') {
    console.log(HELP);
    return;
  }

  if (command === 'setup') await setup(options);
  else if (command === 'run') await runBenchmarks(options);
  else if (command === 'smoke') await smoke();
  else throw new Error(`Unknown command: ${command}`);
}

main().catch(error => {
  console.error(`\nMemory benchmark CLI failed: ${error.message}`);
  process.exitCode = 1;
});
