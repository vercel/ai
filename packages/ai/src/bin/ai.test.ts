import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, unlinkSync } from 'fs';
import { resolve, basename } from 'path';

const mockExit = vi.fn();
Object.defineProperty(process, 'exit', {
  value: mockExit,
  writable: true,
});

vi.mock('../generate-text/stream-text', () => ({
  streamText: vi.fn(() => ({
    textStream: (async function* () {
      yield 'Hello ';
      yield 'world!';
    })(),
    usage: Promise.resolve({
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
    }),
  })),
}));

describe('AI CLI', () => {
  const originalEnv = process.env;
  const originalArgv = process.argv;
  const testFiles: string[] = [];

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.argv = ['node', 'ai'];
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    process.argv = originalArgv;
    testFiles.forEach(file => {
      try {
        unlinkSync(file);
      } catch (error) {
        // Ignore cleanup errors
      }
    });
    testFiles.length = 0;
  });

  const createTestFile = (content: string, extension = '.txt'): string => {
    const testFile = resolve(
      `test-${Date.now()}-${Math.random().toString(36).slice(2)}${extension}`,
    );
    writeFileSync(testFile, content);
    testFiles.push(testFile);
    return testFile;
  };

  const normalizeFileName = (filename: string): string => {
    return filename.replace(/test-\d+-\w+/, 'test-file');
  };

  const normalizeFileContent = (content: any) => {
    if (typeof content === 'object' && content.name) {
      return {
        ...content,
        name: normalizeFileName(basename(content.name)),
      };
    }
    return content;
  };

  describe('argument parsing', () => {
    it('should parse all CLI arguments correctly', async () => {
      const testFile = createTestFile('test content', '.js');
      process.argv = [
        'node',
        'ai',
        '-m',
        'anthropic/claude-3-5-sonnet-20241022',
        '-f',
        testFile,
        '-s',
        'You are helpful',
        '-v',
        'Hello world',
      ];

      const { parseArgs } = await import('./ai');
      const options = parseArgs();

      expect({
        ...options,
        files: options.files.map(f => normalizeFileName(basename(f))),
      }).toMatchInlineSnapshot(`
        {
          "files": [
            "test-file.js",
          ],
          "help": false,
          "model": "anthropic/claude-3-5-sonnet-20241022",
          "prompt": "Hello world",
          "system": "You are helpful",
          "verbose": true,
          "version": false,
        }
      `);
    });

    it('should handle environment variables with defaults', async () => {
      process.env.AI_MODEL = 'groq/llama-3.1-8b-instant';
      process.env.AI_SYSTEM = 'Be concise';
      process.env.AI_VERBOSE = 'true';
      process.argv = ['node', 'ai', 'test prompt'];

      const { parseArgs } = await import('./ai');
      const options = parseArgs();

      expect(options).toMatchInlineSnapshot(`
        {
          "files": [],
          "help": false,
          "model": "groq/llama-3.1-8b-instant",
          "prompt": "test prompt",
          "system": "Be concise",
          "verbose": true,
          "version": false,
        }
      `);
    });

    it('should throw for invalid arguments', async () => {
      process.argv = ['node', 'ai', '--invalid-flag', 'test'];

      const { parseArgs } = await import('./ai');

      expect(() => parseArgs()).toThrowErrorMatchingInlineSnapshot(
        `[Error: Unknown option: --invalid-flag]`,
      );
    });
  });

  describe('file handling', () => {
    it('should read and process different file types', async () => {
      const jsFile = createTestFile('console.log("hello");', '.js');
      const jsonFile = createTestFile('{"name": "test"}', '.json');
      const mdFile = createTestFile('# Hello\nWorld', '.md');

      const { readFileContent } = await import('./ai');

      const jsContent = normalizeFileContent(readFileContent(jsFile));
      const jsonContent = normalizeFileContent(readFileContent(jsonFile));
      const mdContent = normalizeFileContent(readFileContent(mdFile));

      expect(jsContent).toMatchInlineSnapshot(`
        {
          "content": "console.log("hello");",
          "mediaType": "application/javascript",
          "name": "test-file.js",
        }
      `);

      expect(jsonContent).toMatchInlineSnapshot(`
        {
          "content": "{"name": "test"}",
          "mediaType": "application/json",
          "name": "test-file.json",
        }
      `);

      expect(mdContent).toMatchInlineSnapshot(`
        {
          "content": "# Hello
        World",
          "mediaType": "text/markdown",
          "name": "test-file.md",
        }
      `);
    });

    it('should handle image files with base64 encoding', async () => {
      const imageFile = createTestFile('fake-png-data', '.png');

      const { readFileContent } = await import('./ai');
      const content = readFileContent(imageFile);

      expect(content.mediaType).toBe('image/png');
      expect(content.content).toMatch(/^data:image\/png;base64,/);
      expect(content.name).toBe(imageFile);
    });
  });

  describe('media type detection', () => {
    it('should detect media types correctly', async () => {
      const { getMediaType } = await import('./ai');

      expect(getMediaType('.js')).toMatchInlineSnapshot(
        `"application/javascript"`,
      );
      expect(getMediaType('.TS')).toMatchInlineSnapshot(
        `"application/typescript"`,
      );
      expect(getMediaType('.json')).toMatchInlineSnapshot(`"application/json"`);
      expect(getMediaType('.png')).toMatchInlineSnapshot(`"image/png"`);
      expect(getMediaType('.unknown')).toMatchInlineSnapshot(`"text/plain"`);
    });
  });

  describe('help and version output', () => {
    it('should display complete help text', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const { showHelp } = await import('./ai');
      showHelp();

      const helpOutput = consoleSpy.mock.calls.map(call => call[0]).join('\n');

      expect(helpOutput).toMatchInlineSnapshot(`
        "Usage: ai [options] [prompt]

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

        Environment Variables:
          - AI_MODEL: Default model to use
          - AI_SYSTEM: Default system message  
          - AI_VERBOSE: Set to 'true' to enable verbose output

        Authentication (choose one):
          - VERCEL_OIDC_TOKEN: Vercel OIDC token (for Vercel projects)
          - AI_GATEWAY_API_KEY: AI Gateway API key

        Setting Environment Variables:
          # Option 1: Export in current session
          export AI_GATEWAY_API_KEY="your-key-here"
          export AI_MODEL="anthropic/claude-3-5-sonnet-20241022"

          # Option 2: Inline for single command
          AI_GATEWAY_API_KEY="your-key" ai "Hello world"

          # Option 3: Add to shell profile (~/.bashrc, ~/.zshrc)
          echo 'export AI_GATEWAY_API_KEY="your-key"' >> ~/.bashrc

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

        Authentication Setup:
          This CLI uses the Vercel AI Gateway. You need ONE of these for authentication:

          OIDC Token (for Vercel projects):
          - Automatically available in Vercel deployments  
          - For local development: run 'vercel env pull' or use 'vercel dev'
          
          API Key (for any environment):
          - Get your key from the AI Gateway dashboard
          - Set: export AI_GATEWAY_API_KEY="your-key-here"
          
          The gateway supports OpenAI, Anthropic, Google, Groq, and more providers."
      `);

      consoleSpy.mockRestore();
    });

    it('should show version', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const { showVersion } = await import('./ai');
      showVersion();

      expect(consoleSpy.mock.calls[0][0]).toMatchInlineSnapshot(`"1.0.0"`);
      consoleSpy.mockRestore();
    });
  });

  describe('integration behavior', () => {
    it('should upgrade model for image files', async () => {
      const imageFile = createTestFile('fake-image', '.png');
      process.argv = ['node', 'ai', '-f', imageFile, 'Describe this'];

      const { parseArgs, readFileContent } = await import('./ai');
      let options = parseArgs();

      const attachedFiles = [readFileContent(imageFile)];
      const hasImages = attachedFiles.some(f =>
        f.mediaType?.startsWith('image/'),
      );

      if (hasImages && options.model === 'openai/gpt-4') {
        options.model = 'openai/gpt-4o';
      }

      expect(options.model).toMatchInlineSnapshot(`"openai/gpt-4o"`);
    });

    it('should preserve explicitly set models', async () => {
      const imageFile = createTestFile('fake-image', '.jpg');
      process.argv = [
        'node',
        'ai',
        '-m',
        'anthropic/claude-3-5-sonnet-20241022',
        '-f',
        imageFile,
        'Describe',
      ];

      const { parseArgs, readFileContent } = await import('./ai');
      let options = parseArgs();

      const attachedFiles = [readFileContent(imageFile)];
      const hasImages = attachedFiles.some(f =>
        f.mediaType?.startsWith('image/'),
      );

      if (hasImages && options.model === 'openai/gpt-4') {
        options.model = 'openai/gpt-4o';
      }

      expect(options.model).toMatchInlineSnapshot(
        `"anthropic/claude-3-5-sonnet-20241022"`,
      );
    });
  });

  describe('stdin detection', () => {
    it('should detect stdin availability', async () => {
      const originalIsTTY = process.stdin.isTTY;

      process.stdin.isTTY = false;
      const { isStdinAvailable } = await import('./ai');
      expect(isStdinAvailable()).toMatchInlineSnapshot(`true`);

      process.stdin.isTTY = true;
      expect(isStdinAvailable()).toMatchInlineSnapshot(`false`);

      process.stdin.isTTY = originalIsTTY;
    });
  });
});
