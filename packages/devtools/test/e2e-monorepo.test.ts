/**
 * End-to-end test for devtools monorepo support.
 *
 * This test verifies that:
 * 1. The --data-dir CLI flag works correctly
 * 2. The AI_SDK_DEVTOOLS_DATA_DIR env var works correctly
 * 3. The middleware and viewer can share data across directories
 *
 * Run with: npx tsx test/e2e-monorepo.test.ts
 */

import { spawn, ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(__dirname, '..');

// Test configuration
const TEST_PORT = 14983; // Use non-standard port to avoid conflicts
const TEST_DATA_DIR = path.join(PACKAGE_ROOT, '.test-devtools');

// Colors for console output
const colors = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
};

function log(message: string) {
  console.log(colors.cyan(`[TEST] ${message}`));
}

function pass(message: string) {
  console.log(colors.green(`  ✓ ${message}`));
}

function fail(message: string) {
  console.log(colors.red(`  ✗ ${message}`));
}

// Cleanup test directory
function cleanup() {
  if (fs.existsSync(TEST_DATA_DIR)) {
    fs.rmSync(TEST_DATA_DIR, { recursive: true });
  }
}

// Create test data
function createTestData() {
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });

  const testData = {
    runs: [
      {
        id: 'test-run-001',
        started_at: new Date().toISOString(),
      },
    ],
    steps: [
      {
        id: 'test-step-001',
        run_id: 'test-run-001',
        step_number: 1,
        type: 'generate',
        model_id: 'gpt-4',
        provider: 'openai',
        started_at: new Date().toISOString(),
        duration_ms: 1234,
        input: JSON.stringify({
          prompt: [{ role: 'user', content: 'Hello, world!' }],
        }),
        output: JSON.stringify({ text: 'Hello! How can I help you today?' }),
        usage: JSON.stringify({ promptTokens: 10, completionTokens: 20 }),
        error: null,
        raw_request: null,
        raw_response: null,
        raw_chunks: null,
        provider_options: null,
      },
    ],
  };

  fs.writeFileSync(
    path.join(TEST_DATA_DIR, 'generations.json'),
    JSON.stringify(testData, null, 2),
  );

  return testData;
}

// Start the devtools server
async function startServer(
  args: string[] = [],
  env: Record<string, string> = {},
): Promise<{ process: ChildProcess; output: string[] }> {
  return new Promise((resolve, reject) => {
    const output: string[] = [];
    const cliPath = path.join(PACKAGE_ROOT, 'bin', 'cli.js');

    const proc = spawn('node', [cliPath, ...args], {
      cwd: PACKAGE_ROOT,
      env: {
        ...process.env,
        AI_SDK_DEVTOOLS_PORT: String(TEST_PORT),
        ...env,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    proc.stdout?.on('data', data => {
      output.push(data.toString());
    });

    proc.stderr?.on('data', data => {
      output.push(data.toString());
    });

    // Wait for server to start
    setTimeout(() => {
      resolve({ process: proc, output });
    }, 2000);

    proc.on('error', reject);
  });
}

// Make API request to the server
async function apiRequest(endpoint: string): Promise<any> {
  const response = await fetch(
    `http://localhost:${TEST_PORT}/api${endpoint}`,
  );
  return response.json();
}

// Test 1: CLI --help flag
async function testHelpFlag(): Promise<boolean> {
  log('Test 1: CLI --help flag');

  return new Promise(resolve => {
    const cliPath = path.join(PACKAGE_ROOT, 'bin', 'cli.js');
    const proc = spawn('node', [cliPath, '--help'], {
      cwd: PACKAGE_ROOT,
    });

    let output = '';
    proc.stdout?.on('data', data => {
      output += data.toString();
    });

    proc.on('close', code => {
      if (code === 0 && output.includes('--data-dir')) {
        pass('--help displays usage with --data-dir option');
        resolve(true);
      } else {
        fail(`--help failed (code: ${code})`);
        resolve(false);
      }
    });
  });
}

// Test 2: --data-dir flag works
async function testDataDirFlag(): Promise<boolean> {
  log('Test 2: --data-dir CLI flag');

  cleanup();
  const testData = createTestData();

  const { process: server, output } = await startServer([
    '--data-dir',
    TEST_DATA_DIR,
  ]);

  try {
    // Check startup message mentions the data directory
    const startupOutput = output.join('');
    if (startupOutput.includes(TEST_DATA_DIR)) {
      pass('Server startup shows custom data directory');
    } else {
      fail('Server startup does not show custom data directory');
      return false;
    }

    // Check API returns the test run
    const runs = await apiRequest('/runs');
    if (runs.length === 1 && runs[0].id === 'test-run-001') {
      pass('API returns test data from custom directory');
    } else {
      fail(`API returned unexpected data: ${JSON.stringify(runs)}`);
      return false;
    }

    return true;
  } finally {
    server.kill();
    cleanup();
  }
}

// Test 3: AI_SDK_DEVTOOLS_DATA_DIR env var works
async function testDataDirEnvVar(): Promise<boolean> {
  log('Test 3: AI_SDK_DEVTOOLS_DATA_DIR environment variable');

  cleanup();
  const testData = createTestData();

  const { process: server, output } = await startServer([], {
    AI_SDK_DEVTOOLS_DATA_DIR: TEST_DATA_DIR,
  });

  try {
    // Check API returns the test run
    const runs = await apiRequest('/runs');
    if (runs.length === 1 && runs[0].id === 'test-run-001') {
      pass('API returns test data using env var');
    } else {
      fail(`API returned unexpected data: ${JSON.stringify(runs)}`);
      return false;
    }

    return true;
  } finally {
    server.kill();
    cleanup();
  }
}

// Test 4: Verify setDataDir function works programmatically
async function testSetDataDirFunction(): Promise<boolean> {
  log('Test 4: setDataDir() programmatic API');

  cleanup();
  createTestData();

  try {
    // Import the functions from the built package
    const { setDataDir, getDataDirPath } = await import(
      path.join(PACKAGE_ROOT, 'dist', 'index.js')
    );

    // Set custom directory
    setDataDir(TEST_DATA_DIR);

    // Verify it was set
    const currentPath = getDataDirPath();
    if (currentPath === TEST_DATA_DIR) {
      pass('setDataDir() correctly sets the data directory');
    } else {
      fail(`setDataDir() failed: got ${currentPath}, expected ${TEST_DATA_DIR}`);
      return false;
    }

    return true;
  } catch (error) {
    fail(`setDataDir() test failed with error: ${error}`);
    return false;
  } finally {
    cleanup();
  }
}

// Test 5: Monorepo simulation - different cwd vs data dir
async function testMonorepoScenario(): Promise<boolean> {
  log('Test 5: Monorepo scenario - CLI and data in different directories');

  cleanup();

  // Simulate: data is in "apps/web/.devtools" but CLI runs from root
  const simulatedAppDir = path.join(TEST_DATA_DIR, 'apps', 'web', '.devtools');
  fs.mkdirSync(simulatedAppDir, { recursive: true });

  const testData = {
    runs: [{ id: 'monorepo-test-run', started_at: new Date().toISOString() }],
    steps: [],
  };

  fs.writeFileSync(
    path.join(simulatedAppDir, 'generations.json'),
    JSON.stringify(testData, null, 2),
  );

  // Start server from package root but point to "app" data directory
  const { process: server } = await startServer([
    '--data-dir',
    simulatedAppDir,
  ]);

  try {
    const runs = await apiRequest('/runs');
    if (runs.length === 1 && runs[0].id === 'monorepo-test-run') {
      pass('Monorepo scenario: CLI reads data from nested app directory');
    } else {
      fail(`Monorepo test failed: ${JSON.stringify(runs)}`);
      return false;
    }

    return true;
  } finally {
    server.kill();
    cleanup();
  }
}

// Run all tests
async function runTests() {
  console.log('\n' + colors.yellow('='.repeat(60)));
  console.log(colors.yellow('  AI SDK DevTools - Monorepo Support E2E Tests'));
  console.log(colors.yellow('='.repeat(60)) + '\n');

  const results: boolean[] = [];

  try {
    results.push(await testHelpFlag());
    results.push(await testDataDirFlag());
    results.push(await testDataDirEnvVar());
    results.push(await testSetDataDirFunction());
    results.push(await testMonorepoScenario());
  } catch (error) {
    console.error(colors.red(`\nTest suite error: ${error}`));
    process.exit(1);
  }

  const passed = results.filter(Boolean).length;
  const total = results.length;

  console.log('\n' + colors.yellow('='.repeat(60)));
  if (passed === total) {
    console.log(colors.green(`  All ${total} tests passed! ✓`));
  } else {
    console.log(colors.red(`  ${passed}/${total} tests passed`));
  }
  console.log(colors.yellow('='.repeat(60)) + '\n');

  process.exit(passed === total ? 0 : 1);
}

runTests();
