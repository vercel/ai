import { streamText } from '../../core/generate-text/stream-text';
import { readFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { homedir } from 'os';
import { config } from 'dotenv';

config({ path: '.env.local' });
config({ path: '.env' });

import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { groq } from '@ai-sdk/groq';

interface FileAttachment {
  name: string;
  content: string;
  mimeType?: string;
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

interface ConfigFile {
  model?: string;
  system?: string;
  verbose?: boolean;
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

function getMimeType(filePath: string): string {
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

  const mimeType = getMimeType(filePath);
  const isImage = mimeType.startsWith('image/');

  let content: string;
  if (isImage) {
    const buffer = readFileSync(absolutePath);
    content = `data:${mimeType};base64,${buffer.toString('base64')}`;
  } else {
    content = readFileSync(absolutePath, 'utf8');
  }

  return {
    name: filePath,
    content,
    mimeType,
  };
}

function loadConfigFile(): ConfigFile {
  const configPaths = [
    join(process.cwd(), '.ai.json'),
    join(process.cwd(), '.ai.config.json'),
    join(homedir(), '.ai.json'),
    join(homedir(), '.config', 'ai.json'),
  ];

  for (const configPath of configPaths) {
    if (existsSync(configPath)) {
      try {
        const configContent = readFileSync(configPath, 'utf8');
        return JSON.parse(configContent);
      } catch (error) {
        console.error(`Warning: Failed to parse config file ${configPath}`);
      }
    }
  }

  return {};
}

function loadEnvironmentConfig(): ConfigFile {
  return {
    model: process.env.AI_MODEL,
    system: process.env.AI_SYSTEM,
    verbose: process.env.AI_VERBOSE === 'true',
  };
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);

  const configFile = loadConfigFile();
  const envConfig = loadEnvironmentConfig();

  const options: CLIOptions = {
    model: envConfig.model || configFile.model || 'openai/gpt-4',
    files: [],
    help: false,
    version: false,
    verbose: envConfig.verbose || configFile.verbose || false,
    system: envConfig.system || configFile.system,
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
  The CLI looks for configuration files in the following order:
  1. .ai.json or .ai.config.json in current directory
  2. .ai.json in home directory
  3. .config/ai.json in home directory

  Environment variables:
  - AI_MODEL: Default model to use
  - AI_SYSTEM: Default system message
  - AI_VERBOSE: Set to 'true' to enable verbose output
  - OPENAI_API_KEY: OpenAI API key (for OpenAI models)
  - ANTHROPIC_API_KEY: Anthropic API key (for Anthropic models)
  - GOOGLE_GENERATIVE_AI_API_KEY: Google API key (for Google models)
  - GROQ_API_KEY: Groq API key (for Groq models)

  Example config file (.ai.json):
  {
    "model": "anthropic/claude-3-5-sonnet-20241022",
    "system": "You are a helpful assistant.",
    "verbose": true
  }

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
  This CLI uses direct provider APIs. Set the appropriate API key:
  - OPENAI_API_KEY for OpenAI models (gpt-4, gpt-3.5-turbo, etc.)
  - ANTHROPIC_API_KEY for Anthropic models (claude-3-5-sonnet, claude-3-opus, etc.)
  - GOOGLE_GENERATIVE_AI_API_KEY for Google models (gemini-pro, gemini-1.5-pro, etc.)
  - GROQ_API_KEY for Groq models (llama-3.1-8b-instant, llama-3.2-90b-text-preview, etc.)
  
  You can set these in your .env or .env.local file.`);
}

function showVersion() {
  console.log('1.0.0');
}

function resolveModel(modelString: string): ReturnType<typeof openai> {
  const parts = modelString.split('/');

  if (parts.length === 1) {
    return openai(parts[0]);
  }

  const [provider, model] = parts;

  switch (provider.toLowerCase()) {
    case 'openai':
      return openai(model);
    case 'anthropic':
      return anthropic(model);
    case 'google':
      return google(model);
    case 'groq':
      return groq(model);
    default:
      throw new Error(
        `Unsupported provider: ${provider}. Supported providers: openai, anthropic, google, groq`,
      );
  }
}

function formatAttachedFiles(files: FileAttachment[]): string {
  if (files.length === 0) return '';

  const textFiles = files.filter(f => !f.mimeType?.startsWith('image/'));

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
      f.mimeType?.startsWith('image/'),
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
