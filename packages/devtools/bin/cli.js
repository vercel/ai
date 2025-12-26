#!/usr/bin/env node

import { startViewer } from '../dist/viewer/server.js';

// Parse command line arguments
const args = process.argv.slice(2);
let dataDir = null;
let showHelp = false;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--data-dir' || arg === '-d') {
    dataDir = args[i + 1];
    i++;
  } else if (arg === '--help' || arg === '-h') {
    showHelp = true;
  } else if (arg.startsWith('--data-dir=')) {
    dataDir = arg.split('=')[1];
  }
}

if (showHelp) {
  console.log(`
AI SDK DevTools - Local development viewer for AI SDK applications

Usage:
  npx @ai-sdk/devtools [options]
  npx ai-sdk-devtools [options]

Options:
  -d, --data-dir <path>  Path to .devtools data directory
                         (default: .devtools in current directory)
  -h, --help             Show this help message

Environment Variables:
  AI_SDK_DEVTOOLS_PORT      Port to run the viewer on (default: 4983)
  AI_SDK_DEVTOOLS_DATA_DIR  Path to .devtools data directory

Monorepo Usage:
  When running in a monorepo, specify the data directory where your
  app writes devtools data:

    npx @ai-sdk/devtools --data-dir ./apps/my-app/.devtools

  Or set the environment variable in both your app and when running
  the CLI:

    AI_SDK_DEVTOOLS_DATA_DIR=/path/to/.devtools npx @ai-sdk/devtools

Examples:
  npx @ai-sdk/devtools
  npx @ai-sdk/devtools --data-dir ./apps/web/.devtools
  AI_SDK_DEVTOOLS_PORT=3000 npx @ai-sdk/devtools
`);
  process.exit(0);
}

// Set custom data directory if provided
if (dataDir) {
  console.log(`📁 Using data directory: ${dataDir}`);
}

const port = process.env.AI_SDK_DEVTOOLS_PORT
  ? parseInt(process.env.AI_SDK_DEVTOOLS_PORT)
  : 4983;

startViewer(port, dataDir);
