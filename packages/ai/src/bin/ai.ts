import 'dotenv/config';
import { streamText } from '../generate-text/stream-text';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { gateway } from '@ai-sdk/gateway';

interface FileAttachment {
  name: string;
  content: string;
  mediaType?: string;
}

interface CLIOptions {
  model: string;
  files: string[];
  system?: string;
  help: boolean;
  version: boolean;
  verbose: boolean;
  prompt?: string;
}

function isStdinAvailable(): boolean {
  return !process.stdin.isTTY;
}

async function readStdin(): Promise<string> {
  return new Promise(resolve => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      resolve(data.trim());
    });
  });
}

function getMediaType(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    js: 'application/javascript',
    ts: 'application/typescript',
    jsx: 'text/jsx',
    tsx: 'text/tsx',
    json: 'application/json',
    md: 'text/markdown',
    txt: 'text/plain',
    py: 'text/x-python',
    html: 'text/html',
    css: 'text/css',
    xml: 'application/xml',
    yaml: 'application/yaml',
    yml: 'application/yaml',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    bmp: 'image/bmp',
    tiff: 'image/tiff',
    tif: 'image/tiff',
  };

  return mimeTypes[ext || ''] || 'text/plain';
}

function readFileContent(filePath: string): FileAttachment {
  const absolutePath = resolve(filePath);

  if (!existsSync(absolutePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const mediaType = getMediaType(filePath);
  const isImage = mediaType.startsWith('image/');

  let content: string;
  if (isImage) {
    const buffer = readFileSync(absolutePath);
    content = `data:${mediaType};base64,${buffer.toString('base64')}`;
  } else {
    content = readFileSync(absolutePath, 'utf8');
  }

  return {
    name: filePath,
    content,
    mediaType,
  };
}

function loadEnvironmentConfig() {
  return {
    model: process.env.AI_MODEL,
    system: process.env.AI_SYSTEM,
    verbose: process.env.AI_VERBOSE === 'true',
  };
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);

  const envConfig = loadEnvironmentConfig();

  const options: CLIOptions = {
    model: envConfig.model || 'openai/gpt-4',
    files: [],
    help: false,
    version: false,
    verbose: envConfig.verbose || false,
    system: envConfig.system,
  };

  const promptArgs: string[] = [];
  let i = 0;

  while (i < args.length) {
    const arg = args[i];

    switch (arg) {
      case '-h':
      case '--help':
        options.help = true;
        break;
      case '-V':
      case '--version':
        options.version = true;
        break;
      case '-v':
      case '--verbose':
        options.verbose = true;
        break;
      case '-m':
      case '--model':
        if (i + 1 < args.length) {
          options.model = args[i + 1];
          i++;
        } else {
          throw new Error('Model option requires a value');
        }
        break;
      case '-f':
      case '--file':
        if (i + 1 < args.length) {
          options.files.push(args[i + 1]);
          i++;
        } else {
          throw new Error('File option requires a value');
        }
        break;
      case '-s':
      case '--system':
        if (i + 1 < args.length) {
          options.system = args[i + 1];
          i++;
        } else {
          throw new Error('System option requires a value');
        }
        break;
      default:
        if (arg.startsWith('-')) {
          throw new Error(`Unknown option: ${arg}`);
        } else {
          promptArgs.push(arg);
        }
    }
    i++;
  }

  if (promptArgs.length > 0) {
    options.prompt = promptArgs.join(' ');
  }

  return options;
}

function showHelp(): void {
  console.log(`Usage: ai [options] [prompt]

AI CLI - Stream text generation from various AI models

Arguments:
  prompt                   The prompt to send to the AI model (optional if using stdin)

Options:
  -m, --model <model>      Model to use. Format: provider/model or just model name.
                           Examples: openai/gpt-4o, anthropic/claude-3-5-sonnet-20241022
                           (default: "openai/gpt-4")
  -f, --file <file>        Attach a file to the prompt (can be used multiple times)
  -s, --system <message>   System message to set context
  -v, --verbose            Show detailed information (model, usage, etc.)
  -h, --help               Display help for command
  -V, --version            Output the version number

Configuration:
  Environment variables:
  - AI_MODEL: Default model to use
  - AI_SYSTEM: Default system message
  - AI_VERBOSE: Set to 'true' to enable verbose output
  - VERCEL_OIDC_TOKEN: Vercel OIDC token for authentication
  - AI_GATEWAY_API_KEY: AI Gateway API key for authentication

Examples:
  npx ai "Hello, world!"
  npx ai "Write a poem" -m anthropic/claude-3-5-sonnet-20241022
  npx ai "Explain quantum physics" -m groq/llama-3.1-8b-instant
  npx ai "Explain this code" -f script.js -f README.md
  echo "What is life?" | npx ai
  cat file.txt | npx ai "Summarize this content"
  npx ai -f package.json "What dependencies does this project have?"

Unix-style piping:
  echo "Hello world" | npx ai "Translate to French"
  cat README.md | npx ai "Summarize this"
  curl -s https://api.github.com/repos/vercel/ai | npx ai "What is this repository about?"

Authentication:
  This CLI uses the Vercel AI Gateway. Set one of the following for authentication:
  - VERCEL_OIDC_TOKEN: For OIDC-based authentication
  - AI_GATEWAY_API_KEY: For API key-based authentication
  
  The gateway supports various model providers including OpenAI, Anthropic, Google, and Groq.`);
}

function showVersion() {
  console.log('1.0.0');
}

function resolveModel(modelString: string) {
  return gateway.languageModel(modelString);
}

function formatAttachedFiles(files: FileAttachment[]): string {
  if (files.length === 0) return '';

  const textFiles = files.filter(f => !f.mediaType?.startsWith('image/'));

  if (textFiles.length === 0) return '';

  let result = '\n\nAttached files:\n';

  for (const file of textFiles) {
    result += `\n--- ${file.name} ---\n`;
    result += file.content;
    result += '\n';
  }

  return result;
}

async function main(): Promise<void> {
  try {
    const options = parseArgs();

    if (options.help) {
      showHelp();
      return;
    }

    if (options.version) {
      showVersion();
      return;
    }

    let prompt = options.prompt || '';

    if (isStdinAvailable()) {
      const stdinContent = await readStdin();
      if (stdinContent) {
        prompt = prompt ? `${stdinContent}\n\n${prompt}` : stdinContent;
      }
    }

    if (!prompt.trim()) {
      console.error(
        'Error: No prompt provided. Use --help for usage information.',
      );
      process.exit(1);
    }

    const attachedFiles: FileAttachment[] = [];
    for (const filePath of options.files) {
      try {
        const file = readFileContent(filePath);
        attachedFiles.push(file);
      } catch (error) {
        console.error(
          `Error reading file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
        process.exit(1);
      }
    }

    const textPrompt = prompt + formatAttachedFiles(attachedFiles);
    const imageFiles = attachedFiles.filter(f =>
      f.mediaType?.startsWith('image/'),
    );

    if (imageFiles.length > 0 && options.model === 'openai/gpt-4') {
      options.model = 'openai/gpt-4o';
    }

    if (options.verbose) {
      console.error(`Using model: ${options.model}`);
      if (attachedFiles.length > 0) {
        console.error(
          `Attached files: ${attachedFiles.map(f => f.name).join(', ')}`,
        );
      }
      console.error('');
    }

    const model = resolveModel(options.model);

    let messages;
    if (imageFiles.length > 0) {
      const content: Array<
        { type: 'text'; text: string } | { type: 'image'; image: string }
      > = [{ type: 'text' as const, text: textPrompt }];

      for (const img of imageFiles) {
        content.push({
          type: 'image' as const,
          image: img.content,
        });
      }

      messages = [{ role: 'user' as const, content }];
    }

    const result = await streamText(
      messages
        ? {
            model,
            messages,
            system: options.system,
          }
        : {
            model,
            prompt: textPrompt,
            system: options.system,
          },
    );

    for await (const chunk of result.textStream) {
      process.stdout.write(chunk);
    }

    process.stdout.write('\n');

    if (options.verbose) {
      const usage = await result.usage;
      if (usage) {
        console.error(
          `\nUsage: ${usage.inputTokens} prompt + ${usage.outputTokens} completion = ${usage.totalTokens} total tokens`,
        );
      }
    }
  } catch (error) {
    console.error(
      `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  process.exit(0);
});

process.on('SIGTERM', () => {
  process.exit(0);
});

main().catch(error => {
  console.error(
    `Fatal error: ${error instanceof Error ? error.message : 'Unknown error'}`,
  );
  process.exit(1);
});
