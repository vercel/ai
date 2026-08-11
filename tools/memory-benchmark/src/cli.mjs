#!/usr/bin/env node

import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const toolDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const workspaceDirectory = path.resolve(toolDirectory, '..', '..');
const envPath = path.join(toolDirectory, '.env');
const image = 'ai-sdk-memory-benchmark';
const workspacePackages = [
  'ai',
  'anthropic',
  'google',
  'mcp',
  'openai',
  'openai-compatible',
  'provider',
];

const HELP = `
AI SDK application memory benchmark

Usage:
  pnpm benchmark:memory setup
  pnpm benchmark:memory run [--iterations N] [--sample-interval MS] [--output PATH] [--verbose]
  pnpm benchmark:memory smoke
`.trim();

function parseOptions(arguments_) {
  const options = { verbose: false };
  for (let index = 0; index < arguments_.length; index++) {
    const argument = arguments_[index];
    if (argument === '--help' || argument === '-h') options.help = true;
    else if (argument === '--verbose') options.verbose = true;
    else if (
      ['--iterations', '--sample-interval', '--output'].includes(argument)
    ) {
      const value = arguments_[++index];
      if (value == null) throw new Error(`Missing value for ${argument}`);
      if (argument === '--output') options.output = path.resolve(value);
      else {
        const parsed = Number.parseInt(value, 10);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          throw new Error(`${argument} must be a positive integer`);
        }
        options[
          argument === '--iterations' ? 'iterations' : 'sampleIntervalMs'
        ] = parsed;
      }
    } else throw new Error(`Unknown option: ${argument}`);
  }
  return options;
}

function runCommand(command, { cwd, env, stdio = 'inherit' } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), { cwd, env, stdio });
    child.once('error', reject);
    child.once('exit', (code, signal) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              `${command.join(' ')} exited with ${code ?? signal ?? 'unknown'}`,
            ),
          ),
    );
  });
}

function commandOutput(command) {
  return new Promise((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    let error = '';
    child.stdout.on('data', chunk => (output += chunk));
    child.stderr.on('data', chunk => (error += chunk));
    child.once('error', reject);
    child.once('exit', code =>
      code === 0
        ? resolve(output.trim())
        : reject(new Error(error.trim() || `Command exited with ${code}`)),
    );
  });
}

async function pathExists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

function parseEnv(contents) {
  return Object.fromEntries(
    contents
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#') && line.includes('='))
      .map(line => {
        const index = line.indexOf('=');
        return [
          line.slice(0, index).replace(/^export\s+/, '').trim(),
          line
            .slice(index + 1)
            .trim()
            .replace(/^(['"])(.*)\1$/, '$2'),
        ];
      }),
  );
}

async function environment() {
  const file = (await pathExists(envPath))
    ? parseEnv(await readFile(envPath, 'utf8'))
    : {};
  return { ...file, ...process.env };
}

async function nextRunDirectory() {
  const root = path.join(toolDirectory, 'results');
  await mkdir(root, { recursive: true });
  const entries = await readdir(root, { withFileTypes: true });
  const numbers = entries
    .filter(entry => entry.isDirectory())
    .map(entry => Number(entry.name.match(/^run-(\d+)$/)?.[1]))
    .filter(Number.isFinite);
  return path.join(root, `run-${numbers.length ? Math.max(...numbers) + 1 : 1}`);
}

async function buildImage() {
  await runCommand(['container', 'system', 'start']);
  const context = await mkdtemp(
    path.join(workspaceDirectory, '.memory-benchmark-context-'),
  );
  try {
    await runCommand(
      [
        'pnpm',
        'exec',
        'turbo',
        'prune',
        'ai',
        '@ai-sdk/anthropic',
        '@ai-sdk/google',
        '@ai-sdk/mcp',
        '@ai-sdk/openai',
        '@ai-sdk/openai-compatible',
        '--docker',
        `--out-dir=${context}`,
      ],
      { cwd: workspaceDirectory },
    );
    await cp(
      toolDirectory,
      path.join(context, 'full', 'tools', 'memory-benchmark'),
      {
        recursive: true,
        filter: source => {
          const name = path
            .relative(toolDirectory, source)
            .split(path.sep)[0];
          return (
            !['.env', '.repos', 'results'].includes(name)
          );
        },
      },
    );
    await cp(
      path.join(toolDirectory, 'Containerfile'),
      path.join(context, 'Dockerfile'),
    );
    await writeFile(
      path.join(context, '.dockerignore'),
      '**/.env\n**/.repos\n**/node_modules\n**/results\n',
    );
    await runCommand(
      [
        'container',
        'build',
        '--cpus',
        '4',
        '--memory',
        '8G',
        '--tag',
        image,
        context,
      ],
      { cwd: workspaceDirectory },
    );
  } finally {
    await rm(context, { recursive: true, force: true });
  }
}

function startProxy(apiKey) {
  const token = randomBytes(32).toString('hex');
  const server = http.createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, 'http://proxy').pathname;
      if (
        request.method !== 'POST' ||
        !['/v1/messages', '/v1/messages/count_tokens'].includes(pathname) ||
        request.headers['x-api-key'] !== token
      ) {
        response.writeHead(403).end();
        return;
      }

      const headers = { ...request.headers, 'x-api-key': apiKey };
      for (const name of [
        'authorization',
        'connection',
        'content-length',
        'host',
        'transfer-encoding',
      ]) {
        delete headers[name];
      }
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const upstream = await fetch(`https://api.anthropic.com${request.url}`, {
        method: 'POST',
        headers,
        body: Buffer.concat(chunks),
      });
      const responseHeaders = Object.fromEntries(upstream.headers);
      for (const name of [
        'connection',
        'content-length',
        'content-encoding',
        'transfer-encoding',
      ]) {
        delete responseHeaders[name];
      }
      response.writeHead(upstream.status, responseHeaders);
      if (upstream.body) {
        for await (const chunk of upstream.body) response.write(chunk);
      }
      response.end();
    } catch (error) {
      if (!response.headersSent) response.writeHead(502);
      response.end(error.message);
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '0.0.0.0', () => {
      server.off('error', reject);
      resolve({
        token,
        port: server.address().port,
        close: () =>
          new Promise((resolveClose, rejectClose) =>
            server.close(error =>
              error ? rejectClose(error) : resolveClose(),
            ),
          ),
      });
    });
  });
}

async function runInContainer(options) {
  const hostEnvironment = await environment();
  const apiKey = hostEnvironment.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error(`Set ANTHROPIC_API_KEY in ${envPath}`);

  const output = options.output ?? (await nextRunDirectory());
  const name = `ai-sdk-memory-benchmark-${process.pid}`;
  let proxy;

  await buildImage();
  await mkdir(output, { recursive: true });
  const network = JSON.parse(
    await commandOutput(['container', 'network', 'inspect', 'default']),
  );
  proxy = await startProxy(apiKey);
  const innerOptions = [];
  if (options.iterations) {
    innerOptions.push('--iterations', String(options.iterations));
  }
  if (options.sampleIntervalMs) {
    innerOptions.push('--sample-interval', String(options.sampleIntervalMs));
  }
  if (options.verbose) innerOptions.push('--verbose');

  try {
    await runCommand([
      'container',
      'run',
      '--name',
      name,
      '--cpus',
      '4',
      '--memory',
      '8G',
      '--volume',
      `${output}:/results`,
      '--env',
      `ANTHROPIC_API_KEY=${proxy.token}`,
      '--env',
      `ANTHROPIC_API_BASE=http://${network[0].status.ipv4Gateway}:${proxy.port}/v1`,
      image,
      'node',
      'tools/memory-benchmark/src/cli.mjs',
      'run-inner',
      '--output',
      '/results',
      ...innerOptions,
    ]);
    console.log(`\nHost results: ${output}`);
  } finally {
    await runCommand(['container', 'rm', '--force', name]).catch(() => {});
    await proxy.close();
  }
}

async function runInner(options) {
  const repository = path.join(toolDirectory, '.repos', 'neovate-code');
  if (!(await pathExists(path.join(repository, 'node_modules')))) {
    throw new Error('Neovate Code is missing from the benchmark image');
  }

  await runCommand(
    [
      'pnpm',
      'turbo',
      'build',
      '--filter=ai...',
      '--filter=@ai-sdk/anthropic...',
      '--filter=@ai-sdk/google...',
      '--filter=@ai-sdk/mcp...',
      '--filter=@ai-sdk/openai...',
      '--filter=@ai-sdk/openai-compatible...',
    ],
    { cwd: workspaceDirectory },
  );
  for (const packageName of workspacePackages) {
    const target = path.join(
      repository,
      'node_modules',
      ...(packageName === 'ai' ? ['ai'] : ['@ai-sdk', packageName]),
    );
    await rm(target, { recursive: true, force: true });
    await symlink(
      path.join(workspaceDirectory, 'packages', packageName),
      target,
      'dir',
    );
  }

  const command = [
    process.execPath,
    path.join(toolDirectory, 'src', 'benchmark.mjs'),
    '--config',
    path.join(toolDirectory, 'benchmarks.example.json'),
    '--name',
    'neovate-code',
    '--output',
    options.output,
  ];
  if (options.iterations) {
    command.push('--iterations', String(options.iterations));
  }
  if (options.sampleIntervalMs) {
    command.push('--sample-interval', String(options.sampleIntervalMs));
  }
  if (options.verbose) command.push('--verbose');
  await runCommand(command, {
    cwd: toolDirectory,
    env: {
      ...process.env,
      AI_SDK_BENCH_ROOT: path.join(toolDirectory, '.repos'),
      AI_SDK_BENCH_FIXTURE: path.join(toolDirectory, 'fixtures', 'code-project'),
    },
  });
}

async function smoke() {
  const output = await nextRunDirectory();
  await runCommand([
    process.execPath,
    path.join(toolDirectory, 'src', 'benchmark.mjs'),
    '--name',
    'smoke',
    '--iterations',
    '2',
    '--sample-interval',
    '50',
    '--output',
    output,
    '--',
    process.execPath,
    '-e',
    "const a=[];let i=0;const t=setInterval(()=>{a.push(Buffer.alloc(4<<20,1));if(++i===4){clearInterval(t);setTimeout(()=>process.exit(),100)}},75)",
  ]);
}

async function main() {
  const [command = 'help', ...arguments_] = process.argv.slice(2);
  const options = parseOptions(arguments_);
  if (options.help || command === 'help' || command === '--help') {
    console.log(HELP);
  } else if (command === 'setup') {
    await buildImage();
  } else if (command === 'run') {
    await runInContainer(options);
  } else if (command === 'run-inner') {
    await runInner(options);
  } else if (command === 'smoke') {
    await smoke();
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
}

main().catch(error => {
  console.error(`\nMemory benchmark failed: ${error.message}`);
  process.exitCode = 1;
});
