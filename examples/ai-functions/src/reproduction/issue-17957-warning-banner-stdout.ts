import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { generateText } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

const banner =
  'AI SDK Warning System: To turn off warning logging, set the AI_SDK_LOG_WARNINGS global to false.';

const usage = {
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
};

async function runJsonCli() {
  const first = await generateText({
    model: new MockLanguageModelV4({
      doGenerate: {
        content: [{ type: 'text', text: 'first complete answer' }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage,
        warnings: [{ type: 'other', message: 'first provider warning' }],
      },
    }),
    prompt: 'Return the first answer.',
  });

  const second = await generateText({
    model: new MockLanguageModelV4({
      doGenerate: {
        content: [{ type: 'text', text: 'second complete answer' }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage,
        warnings: [{ type: 'other', message: 'second provider warning' }],
      },
    }),
    prompt: 'Return the second answer.',
  });

  console.log(JSON.stringify({ answers: [first.text, second.text] }));
}

async function main() {
  if (process.argv.includes('--json-cli')) {
    await runJsonCli();
    return;
  }

  const scriptPath = fileURLToPath(import.meta.url);
  const child = spawnSync(
    process.execPath,
    ['--import', 'tsx', scriptPath, '--json-cli'],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
    },
  );

  if (child.error != null) {
    throw child.error;
  }

  if (child.status !== 0) {
    throw new Error(
      `Reproduction child failed unexpectedly with exit code ${child.status}: ${child.stderr}`,
    );
  }

  const expectedPayload = {
    answers: ['first complete answer', 'second complete answer'],
  };

  try {
    const parsed = JSON.parse(child.stdout);

    if (JSON.stringify(parsed) !== JSON.stringify(expectedPayload)) {
      throw new Error(`Unexpected JSON payload: ${child.stdout}`);
    }

    console.log(
      'Issue #17957 was not reproduced: stdout contained only valid JSON.',
    );
    return;
  } catch (error) {
    if (!(error instanceof SyntaxError)) {
      throw error;
    }
  }

  const bannerCount = child.stdout.split(banner).length - 1;
  if (bannerCount !== 1) {
    throw new Error(
      `Expected exactly one AI SDK warning banner on stdout, received ${bannerCount}: ${child.stdout}`,
    );
  }

  const jsonWithoutBanner = child.stdout.replace(`${banner}\n`, '').trim();
  const parsedWithoutBanner = JSON.parse(jsonWithoutBanner);
  if (JSON.stringify(parsedWithoutBanner) !== JSON.stringify(expectedPayload)) {
    throw new Error(
      `Unexpected JSON payload after the banner: ${child.stdout}`,
    );
  }

  if (
    !child.stderr.includes('first provider warning') ||
    !child.stderr.includes('second provider warning')
  ) {
    throw new Error(
      `Expected individual warnings on stderr, received: ${child.stderr}`,
    );
  }

  throw new Error(
    'Issue #17957 reproduced: stdout is not valid JSON because the one-time AI SDK warning banner was written to stdout before the JSON payload.',
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
