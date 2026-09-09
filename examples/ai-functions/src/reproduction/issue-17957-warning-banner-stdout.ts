import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { generateText } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';

const banner =
  'AI SDK Warning System: To turn off warning logging, set the AI_SDK_LOG_WARNINGS global to false.';
const reproducedSignal =
  'REPRODUCED issue #17957: warning banner on stdout corrupts JSON output';

async function runChild() {
  const model = new MockLanguageModelV3({
    doGenerate: async () => ({
      content: [{ type: 'text', text: 'complete' }],
      finishReason: { raw: undefined, unified: 'stop' },
      usage: {
        inputTokens: {
          total: 1,
          noCache: 1,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: {
          total: 1,
          text: 1,
          reasoning: undefined,
        },
      },
      warnings: [{ type: 'other', message: 'provider warning' }],
    }),
  });

  await generateText({ model, prompt: 'first call' });
  const result = await generateText({ model, prompt: 'second call' });

  console.log(JSON.stringify({ answer: result.text }));
}

async function runParent() {
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', fileURLToPath(import.meta.url), '--child'],
    {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  let stdout = '';
  let stderr = '';

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    stdout += chunk;
  });

  child.stderr.setEncoding('utf8');
  child.stderr.on('data', chunk => {
    stderr += chunk;
  });

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });

  if (exitCode !== 0) {
    throw new Error(
      `Child process failed with exit code ${exitCode}:\n${stderr}`,
    );
  }

  const bannerCount = stdout.split(banner).length - 1;
  const warningCount = stderr.split('AI SDK Warning (').length - 1;
  const jsonWithoutBanner = stdout.replace(`${banner}\n`, '');
  const parsedWithoutBanner = JSON.parse(jsonWithoutBanner);

  let rawStdoutParseError: unknown;
  try {
    JSON.parse(stdout);
  } catch (error) {
    rawStdoutParseError = error;
  }

  console.error(
    JSON.stringify(
      {
        stdout,
        stderr,
        bannerCount,
        warningCount,
        parsedWithoutBanner,
        rawStdoutParseError:
          rawStdoutParseError instanceof Error
            ? rawStdoutParseError.message
            : undefined,
      },
      null,
      2,
    ),
  );

  if (
    bannerCount === 1 &&
    warningCount === 2 &&
    parsedWithoutBanner.answer === 'complete' &&
    rawStdoutParseError instanceof SyntaxError
  ) {
    throw new Error(reproducedSignal);
  }
}

async function main() {
  if (process.argv.includes('--child')) {
    await runChild();
    return;
  }

  await runParent();
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
