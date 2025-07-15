import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync, writeFileSync, unlinkSync } from 'fs';
import { resolve } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Mock the gateway module to avoid actual API calls
vi.mock('@ai-sdk/gateway', () => ({
  gateway: {
    languageModel: vi.fn(() => ({
      doStream: vi.fn(),
    })),
  },
}));

// Mock streamText to avoid actual API calls
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
    // Clean up test files
    testFiles.forEach(file => {
      try {
        unlinkSync(file);
      } catch (error) {
        // Ignore errors when cleaning up
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

  describe('parseArgs', () => {
    it('should parse basic prompt argument', async () => {
      process.argv = ['node', 'ai', 'Hello world'];

      // Import the module to trigger parseArgs
      const { parseArgs } = await import('./ai');
      const options = parseArgs();

      expect(options.prompt).toBe('Hello world');
      expect(options.model).toBe('openai/gpt-4');
      expect(options.files).toEqual([]);
      expect(options.help).toBe(false);
      expect(options.version).toBe(false);
      expect(options.verbose).toBe(false);
    });

    it('should parse model flag', async () => {
      process.argv = [
        'node',
        'ai',
        '-m',
        'anthropic/claude-3-5-sonnet-20241022',
        'Hello',
      ];

      const { parseArgs } = await import('./ai');
      const options = parseArgs();

      expect(options.model).toBe('anthropic/claude-3-5-sonnet-20241022');
      expect(options.prompt).toBe('Hello');
    });

    it('should parse long model flag', async () => {
      process.argv = [
        'node',
        'ai',
        '--model',
        'groq/llama-3.1-8b-instant',
        'Hello',
      ];

      const { parseArgs } = await import('./ai');
      const options = parseArgs();

      expect(options.model).toBe('groq/llama-3.1-8b-instant');
    });

    it('should parse file flags', async () => {
      const testFile1 = createTestFile('Test content 1');
      const testFile2 = createTestFile('Test content 2');

      process.argv = [
        'node',
        'ai',
        '-f',
        testFile1,
        '--file',
        testFile2,
        'Analyze these files',
      ];

      const { parseArgs } = await import('./ai');
      const options = parseArgs();

      expect(options.files).toEqual([testFile1, testFile2]);
      expect(options.prompt).toBe('Analyze these files');
    });

    it('should parse system message flag', async () => {
      process.argv = [
        'node',
        'ai',
        '-s',
        'You are a helpful assistant',
        'Hello',
      ];

      const { parseArgs } = await import('./ai');
      const options = parseArgs();

      expect(options.system).toBe('You are a helpful assistant');
    });

    it('should parse verbose flag', async () => {
      process.argv = ['node', 'ai', '--verbose', 'Hello'];

      const { parseArgs } = await import('./ai');
      const options = parseArgs();

      expect(options.verbose).toBe(true);
    });

    it('should parse help flag', async () => {
      process.argv = ['node', 'ai', '--help'];

      const { parseArgs } = await import('./ai');
      const options = parseArgs();

      expect(options.help).toBe(true);
    });

    it('should parse version flag', async () => {
      process.argv = ['node', 'ai', '-V'];

      const { parseArgs } = await import('./ai');
      const options = parseArgs();

      expect(options.version).toBe(true);
    });

    it('should handle multiple prompt words', async () => {
      process.argv = ['node', 'ai', 'Hello', 'beautiful', 'world'];

      const { parseArgs } = await import('./ai');
      const options = parseArgs();

      expect(options.prompt).toBe('Hello beautiful world');
    });

    it('should throw error for unknown flags', async () => {
      process.argv = ['node', 'ai', '--unknown-flag'];

      const { parseArgs } = await import('./ai');

      expect(() => parseArgs()).toThrow('Unknown option: --unknown-flag');
    });

    it('should throw error for flag without value', async () => {
      process.argv = ['node', 'ai', '-m'];

      const { parseArgs } = await import('./ai');

      expect(() => parseArgs()).toThrow('Model option requires a value');
    });
  });

  describe('environment variables', () => {
    it('should use AI_MODEL environment variable as default', async () => {
      process.env.AI_MODEL = 'anthropic/claude-3-5-sonnet-20241022';
      process.argv = ['node', 'ai', 'Hello'];

      const { parseArgs } = await import('./ai');
      const options = parseArgs();

      expect(options.model).toBe('anthropic/claude-3-5-sonnet-20241022');
    });

    it('should use AI_SYSTEM environment variable as default', async () => {
      process.env.AI_SYSTEM = 'You are a helpful coding assistant';
      process.argv = ['node', 'ai', 'Hello'];

      const { parseArgs } = await import('./ai');
      const options = parseArgs();

      expect(options.system).toBe('You are a helpful coding assistant');
    });

    it('should use AI_VERBOSE environment variable', async () => {
      process.env.AI_VERBOSE = 'true';
      process.argv = ['node', 'ai', 'Hello'];

      const { parseArgs } = await import('./ai');
      const options = parseArgs();

      expect(options.verbose).toBe(true);
    });

    it('should prioritize command line flags over environment variables', async () => {
      process.env.AI_MODEL = 'openai/gpt-3.5-turbo';
      process.argv = [
        'node',
        'ai',
        '-m',
        'anthropic/claude-3-5-sonnet-20241022',
        'Hello',
      ];

      const { parseArgs } = await import('./ai');
      const options = parseArgs();

      expect(options.model).toBe('anthropic/claude-3-5-sonnet-20241022');
    });
  });

  describe('file handling', () => {
    it('should read text file content', async () => {
      const content = 'This is test file content\nwith multiple lines';
      const testFile = createTestFile(content);

      const { readFileContent } = await import('./ai');
      const fileAttachment = readFileContent(testFile);

      expect(fileAttachment.name).toBe(testFile);
      expect(fileAttachment.content).toBe(content);
      expect(fileAttachment.mediaType).toBe('text/plain');
    });

    it('should read JavaScript file with correct media type', async () => {
      const content = 'console.log("Hello world");';
      const testFile = createTestFile(content, '.js');

      const { readFileContent } = await import('./ai');
      const fileAttachment = readFileContent(testFile);

      expect(fileAttachment.mediaType).toBe('application/javascript');
    });

    it('should read TypeScript file with correct media type', async () => {
      const content = 'const greeting: string = "Hello";';
      const testFile = createTestFile(content, '.ts');

      const { readFileContent } = await import('./ai');
      const fileAttachment = readFileContent(testFile);

      expect(fileAttachment.mediaType).toBe('application/typescript');
    });

    it('should read JSON file with correct media type', async () => {
      const content = '{"name": "test", "version": "1.0.0"}';
      const testFile = createTestFile(content, '.json');

      const { readFileContent } = await import('./ai');
      const fileAttachment = readFileContent(testFile);

      expect(fileAttachment.mediaType).toBe('application/json');
    });

    it('should read markdown file with correct media type', async () => {
      const content = '# Test\n\nThis is a test markdown file.';
      const testFile = createTestFile(content, '.md');

      const { readFileContent } = await import('./ai');
      const fileAttachment = readFileContent(testFile);

      expect(fileAttachment.mediaType).toBe('text/markdown');
    });

    it('should handle image files with base64 encoding', async () => {
      // Create a simple PNG-like file (just for testing media type detection)
      const testFile = createTestFile('fake-image-content', '.png');

      const { readFileContent } = await import('./ai');
      const fileAttachment = readFileContent(testFile);

      expect(fileAttachment.mediaType).toBe('image/png');
      expect(fileAttachment.content).toMatch(/^data:image\/png;base64,/);
    });

    it('should throw error for non-existent file', async () => {
      const { readFileContent } = await import('./ai');

      expect(() => readFileContent('/path/to/nonexistent/file.txt')).toThrow(
        'File not found: /path/to/nonexistent/file.txt',
      );
    });
  });

  describe('getMediaType', () => {
    it('should return correct media types for common extensions', async () => {
      const { getMediaType } = await import('./ai');

      expect(getMediaType('file.js')).toBe('application/javascript');
      expect(getMediaType('file.ts')).toBe('application/typescript');
      expect(getMediaType('file.json')).toBe('application/json');
      expect(getMediaType('file.md')).toBe('text/markdown');
      expect(getMediaType('file.txt')).toBe('text/plain');
      expect(getMediaType('file.html')).toBe('text/html');
      expect(getMediaType('file.css')).toBe('text/css');
      expect(getMediaType('file.py')).toBe('text/x-python');
      expect(getMediaType('file.xml')).toBe('application/xml');
      expect(getMediaType('file.yaml')).toBe('application/yaml');
      expect(getMediaType('file.yml')).toBe('application/yaml');
    });

    it('should return correct media types for image extensions', async () => {
      const { getMediaType } = await import('./ai');

      expect(getMediaType('image.jpg')).toBe('image/jpeg');
      expect(getMediaType('image.jpeg')).toBe('image/jpeg');
      expect(getMediaType('image.png')).toBe('image/png');
      expect(getMediaType('image.gif')).toBe('image/gif');
      expect(getMediaType('image.webp')).toBe('image/webp');
      expect(getMediaType('image.svg')).toBe('image/svg+xml');
      expect(getMediaType('image.bmp')).toBe('image/bmp');
      expect(getMediaType('image.tiff')).toBe('image/tiff');
      expect(getMediaType('image.tif')).toBe('image/tiff');
    });

    it('should handle case insensitivity', async () => {
      const { getMediaType } = await import('./ai');

      expect(getMediaType('file.JS')).toBe('application/javascript');
      expect(getMediaType('file.PNG')).toBe('image/png');
      expect(getMediaType('file.JSON')).toBe('application/json');
    });

    it('should return text/plain for unknown extensions', async () => {
      const { getMediaType } = await import('./ai');

      expect(getMediaType('file.unknown')).toBe('text/plain');
      expect(getMediaType('file')).toBe('text/plain');
      expect(getMediaType('')).toBe('text/plain');
    });
  });

  describe('formatAttachedFiles', () => {
    it('should format text files correctly', async () => {
      const files = [
        { name: 'file1.txt', content: 'Content 1', mediaType: 'text/plain' },
        {
          name: 'file2.js',
          content: 'console.log("test");',
          mediaType: 'application/javascript',
        },
      ];

      const { formatAttachedFiles } = await import('./ai');
      const result = formatAttachedFiles(files);

      expect(result).toContain('Attached files:');
      expect(result).toContain('--- file1.txt ---');
      expect(result).toContain('Content 1');
      expect(result).toContain('--- file2.js ---');
      expect(result).toContain('console.log("test");');
    });

    it('should exclude image files from formatting', async () => {
      const files = [
        { name: 'file1.txt', content: 'Text content', mediaType: 'text/plain' },
        {
          name: 'image.png',
          content: 'data:image/png;base64,abc123',
          mediaType: 'image/png',
        },
      ];

      const { formatAttachedFiles } = await import('./ai');
      const result = formatAttachedFiles(files);

      expect(result).toContain('file1.txt');
      expect(result).toContain('Text content');
      expect(result).not.toContain('image.png');
      expect(result).not.toContain('data:image/png');
    });

    it('should return empty string for no files', async () => {
      const { formatAttachedFiles } = await import('./ai');
      const result = formatAttachedFiles([]);

      expect(result).toBe('');
    });

    it('should return empty string when only image files', async () => {
      const files = [
        {
          name: 'image.png',
          content: 'data:image/png;base64,abc123',
          mediaType: 'image/png',
        },
      ];

      const { formatAttachedFiles } = await import('./ai');
      const result = formatAttachedFiles(files);

      expect(result).toBe('');
    });
  });

  describe('help and version', () => {
    it('should show help text', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const { showHelp } = await import('./ai');
      showHelp();

      expect(consoleSpy).toHaveBeenCalled();
      const helpText = consoleSpy.mock.calls[0][0];
      expect(helpText).toContain('Usage: ai [options] [prompt]');
      expect(helpText).toContain('AI CLI - Stream text generation');
      expect(helpText).toContain('Environment Variables:');
      expect(helpText).toContain('Authentication (choose one):');
      expect(helpText).toContain('VERCEL_OIDC_TOKEN');
      expect(helpText).toContain('AI_GATEWAY_API_KEY');
      expect(helpText).toContain('Setting Environment Variables:');
      expect(helpText).toContain('export AI_GATEWAY_API_KEY');

      consoleSpy.mockRestore();
    });

    it('should show version', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const { showVersion } = await import('./ai');
      showVersion();

      expect(consoleSpy).toHaveBeenCalledWith('1.0.0');

      consoleSpy.mockRestore();
    });
  });

  describe('stdin detection', () => {
    it('should detect when stdin is available', async () => {
      // Mock process.stdin.isTTY
      const originalIsTTY = process.stdin.isTTY;
      process.stdin.isTTY = false;

      const { isStdinAvailable } = await import('./ai');
      const result = isStdinAvailable();

      expect(result).toBe(true);

      // Restore
      process.stdin.isTTY = originalIsTTY;
    });

    it('should detect when stdin is not available', async () => {
      const originalIsTTY = process.stdin.isTTY;
      process.stdin.isTTY = true;

      const { isStdinAvailable } = await import('./ai');
      const result = isStdinAvailable();

      expect(result).toBe(false);

      process.stdin.isTTY = originalIsTTY;
    });
  });

  describe('model resolution', () => {
    it('should resolve model string to gateway language model', async () => {
      const { gateway } = await import('@ai-sdk/gateway');
      const { resolveModel } = await import('./ai');

      resolveModel('openai/gpt-4o');

      expect(gateway.languageModel).toHaveBeenCalledWith('openai/gpt-4o');
    });
  });

  describe('integration scenarios', () => {
    it('should handle model switching for images', async () => {
      const imageFile = createTestFile('fake-image', '.png');

      process.argv = ['node', 'ai', '-f', imageFile, 'Describe this image'];

      const { parseArgs } = await import('./ai');
      let options = parseArgs();

      // Simulate the model switching logic from main()
      const { readFileContent } = await import('./ai');
      const attachedFiles = [readFileContent(imageFile)];
      const imageFiles = attachedFiles.filter(f =>
        f.mediaType?.startsWith('image/'),
      );

      if (imageFiles.length > 0 && options.model === 'openai/gpt-4') {
        options.model = 'openai/gpt-4o';
      }

      expect(options.model).toBe('openai/gpt-4o');
    });

    it('should not switch model if already specified', async () => {
      const imageFile = createTestFile('fake-image', '.png');

      process.argv = [
        'node',
        'ai',
        '-m',
        'anthropic/claude-3-5-sonnet-20241022',
        '-f',
        imageFile,
        'Describe',
      ];

      const { parseArgs } = await import('./ai');
      let options = parseArgs();

      // Model switching logic shouldn't affect explicitly set models
      const { readFileContent } = await import('./ai');
      const attachedFiles = [readFileContent(imageFile)];
      const imageFiles = attachedFiles.filter(f =>
        f.mediaType?.startsWith('image/'),
      );

      if (imageFiles.length > 0 && options.model === 'openai/gpt-4') {
        options.model = 'openai/gpt-4o';
      }

      expect(options.model).toBe('anthropic/claude-3-5-sonnet-20241022');
    });
  });
});
