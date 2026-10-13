import { createRequire } from 'node:module';
import { rm, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const failureSignal =
  'ISSUE_23146_REPRODUCED: migrated provider-only module failed to evaluate because generated AI SDK helpers are unbound';

async function main() {
  const codemodRequire = createRequire(
    new URL('../../../../packages/codemod/package.json', import.meta.url),
  );
  const { default: replaceSimulateStreaming } = codemodRequire(
    './src/codemods/v5/replace-simulate-streaming.ts',
  ) as {
    default: (
      fileInfo: { path: string; source: string },
      api: {
        j: unknown;
        jscodeshift: unknown;
        report: (message: string) => void;
        stats: (name: string, quantity?: number) => void;
      },
      options: Record<string, never>,
    ) => string | null;
  };
  const j = codemodRequire('jscodeshift').withParser('tsx');
  const input =
    "import { openai } from '@ai-sdk/openai'; export const model = openai('model', { simulateStreaming: true });";
  const output =
    replaceSimulateStreaming(
      { path: 'fixture.ts', source: input },
      {
        j,
        jscodeshift: j,
        report() {},
        stats() {},
      },
      {},
    ) ?? input;
  const generatedHelpersAreUnbound =
    /\bwrapLanguageModel\s*\(/.test(output) &&
    /\bsimulateStreamingMiddleware\s*\(/.test(output) &&
    !/\bfrom\s+['"]ai['"]/.test(output);

  const generatedModuleUrl = new URL(
    `.issue-23146-generated-${process.pid}.ts`,
    import.meta.url,
  );

  await writeFile(generatedModuleUrl, output);

  try {
    await import(
      `${pathToFileURL(fileURLToPath(generatedModuleUrl)).href}?run=${Date.now()}`
    );
  } catch (error) {
    if (
      error instanceof ReferenceError &&
      generatedHelpersAreUnbound &&
      /(?:wrapLanguageModel|simulateStreamingMiddleware) is not defined/.test(
        error.message,
      )
    ) {
      console.error(failureSignal);
      process.exitCode = 1;
      return;
    }

    throw error;
  } finally {
    await rm(generatedModuleUrl, { force: true });
  }
}

await main();
