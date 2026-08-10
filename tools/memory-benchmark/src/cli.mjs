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
    name: 'neovate-code',
    directory: 'neovate-code',
    url: 'https://github.com/neovateai/neovate-code.git',
    install: ['pnpm', 'install', '--frozen-lockfile'],
    requiredEnv: ['ANTHROPIC_API_KEY'],
  },
];

const HELP = `
AI SDK application memory benchmark

Usage:
  pnpm benchmark:memory setup [options]
  pnpm benchmark:memory run [options]
  pnpm benchmark:memory smoke

Commands:
  setup     Clone Neovate Code and install its dependencies
  run       Run the Neovate Code memory benchmark
  smoke     Run the synthetic memory sampler smoke test

Options:
  --repos-dir <path>     Repository cache (default: tools/memory-benchmark/.repos)
  --dotenv <path>        Scoped env file (default: tools/memory-benchmark/.env)
  --skip-install         Clone Neovate Code without installing dependencies
  --iterations <count>   Override benchmark iterations
  --sample-interval <ms> Override sampling interval
  --output <path>        Results directory
  --verbose              Mirror application output during benchmark runs
  --help                 Show this help
`.trim();

function parseOptions(arguments_) {
  const options = {
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
        '--repos-dir',
        '--dotenv',
        '--iterations',
        '--sample-interval',
        '--output',
      ].includes(argument)
    ) {
      const value = arguments_[++index];
      if (value == null) throw new Error(`Missing value for ${argument}`);
      if (argument === '--repos-dir') {
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
  return repository.requiredEnv.filter(
    name => !isConfigured(environment, name),
  );
}

async function setup(options) {
  await mkdir(options.repositoriesDirectory, { recursive: true });
  const failures = [];

  console.log(`Repository cache: ${options.repositoriesDirectory}\n`);

  for (const repository of repositories) {
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
  const scoped = await loadScopedEnvironment(options.envPath);
  const environment = { ...scoped, ...process.env };
  const results = [];

  if (print) {
    console.log(`Repository cache: ${options.repositoriesDirectory}`);
    console.log(`Environment file: ${options.envPath}\n`);
  }

  for (const repository of repositories) {
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
    const missingEnvironmentVariables = missingEnvironment(
      repository,
      environment,
    );
    const ready =
      repositoryReady &&
      dependenciesReady &&
      missingEnvironmentVariables.length === 0;

    results.push({
      repository,
      repositoryPath,
      repositoryReady,
      dependenciesReady,
      missingEnvironmentVariables,
      ready,
    });

    if (print) {
      console.log(`${ready ? 'READY' : 'SKIP '} ${repository.name}`);
      if (!repositoryReady) {
        console.log('  - repository missing; run setup');
      } else if (!dependenciesReady) {
        console.log('  - dependencies missing; rerun setup');
      }
      if (missingEnvironmentVariables.length > 0) {
        console.log(`  - missing: ${missingEnvironmentVariables.join(', ')}`);
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
  };
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputDirectory =
    options.output ?? path.join(toolDirectory, 'results', timestamp);
  await mkdir(outputDirectory, { recursive: true });

  const command = [
    process.execPath,
    benchmarkRunnerPath,
    '--config',
    benchmarkConfigPath,
    '--name',
    ready[0].repository.name,
    '--output',
    outputDirectory,
  ];
  if (options.iterations) {
    command.push('--iterations', String(options.iterations));
  }
  if (options.sampleIntervalMs) {
    command.push('--sample-interval', String(options.sampleIntervalMs));
  }
  if (options.verbose) command.push('--verbose');

  console.log('\nRunning Neovate Code benchmark');
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
