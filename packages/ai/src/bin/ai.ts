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

export function isStdinAvailable(): boolean {
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

export function getMediaType(filePath: string): string {
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

export function readFileContent(filePath: string): FileAttachment {
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

export function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);

  const options: CLIOptions = {
    model: process.env.AI_DEFAULT_MODEL || 'openai/gpt-4',
    files: [],
    help: false,
    version: false,
    verbose: process.env.AI_VERBOSE === 'true',
    system: process.env.AI_SYSTEM,
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

export function showHelp(): void {
  console.log(`Usage: ai [options] [prompt]

AI CLI - Stream text generation from various AI models

Options:
  -m, --model <model>      Model to use (default: "openai/gpt-4")
                           Format: provider/model (e.g., anthropic/claude-3-5-sonnet)
  -f, --file <file>        Attach file(s) to prompt
  -s, --system <message>   System message
  -v, --verbose            Show detailed output
  -h, --help               Show help
  -V, --version            Show version

Authentication (required):
  export AI_GATEWAY_API_KEY="your-key"     # Get from Vercel Dashboard (AI tab)

Environment Variables:
  AI_DEFAULT_MODEL: Default model to use
  AI_SYSTEM: Default system message
  AI_VERBOSE: Set to 'true' for detailed output

Examples:
  npx ai "Hello, world!"
  npx ai "Write a poem" -m anthropic/claude-3-5-sonnet
  npx ai "Explain this code" -f script.js -f README.md
  echo "What is life?" | npx ai
  cat file.txt | npx ai "Summarize this content"
  npx ai -f package.json "What dependencies does this project have?"

Unix-style piping:
  echo "Hello world" | npx ai "Translate to French"
  cat README.md | npx ai "Summarize this"
  curl -s https://api.github.com/repos/vercel/ai | npx ai "What is this repository about?"
  
  The gateway supports OpenAI, Anthropic, Google, Groq, and more providers.`);
}

export function showVersion() {
  console.log('1.0.0');
}

export function resolveModel(modelString: string) {
  return gateway.languageModel(modelString);
}

export function formatAttachedFiles(files: FileAttachment[]): string {
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

export async function main(): Promise<void> {
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

    const hasApiKey = process.env.AI_GATEWAY_API_KEY;
    if (!hasApiKey) {
      console.error(`Error: Authentication required.

Set up authentication with one of these options:

  # Option 1: Export in current session
  export AI_GATEWAY_API_KEY="your-key-here"
  export AI_DEFAULT_MODEL="anthropic/claude-3-5-sonnet"

  # Option 2: Add to shell profile (~/.bashrc, ~/.zshrc)
  echo 'export AI_GATEWAY_API_KEY="your-key"' >> ~/.bashrc
  
Get your API key from the Vercel Dashboard (AI tab > API keys).
Use --help for more details and examples.`);
      process.exit(1);
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
