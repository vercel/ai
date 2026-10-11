import { createOpenAI } from '@ai-sdk/openai';
import { uploadFile } from 'ai';
import assert from 'node:assert/strict';

async function main() {
  const headerFailure = new Error('synthetic header preparation failure');
  let fetches = 0;

  const provider = createOpenAI({
    apiKey: 'synthetic',
    headers: {
      get 'x-test'(): string {
        throw headerFailure;
      },
    },
    fetch: async () => {
      fetches++;
      throw new Error('fetch must not run');
    },
  });

  const runUpload = async (useCore: boolean) => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
    });
    const args = {
      data: { type: 'stream' as const, stream },
      mediaType: 'text/plain',
      filename: 'test.txt',
    };

    await assert.rejects(
      async () => {
        await (useCore
          ? uploadFile({ api: provider, ...args })
          : provider.files().uploadFile(args));
      },
      (error: unknown) => error === headerFailure,
    );

    const cancelledAfterRejection = cancelled;
    if (!cancelled) {
      await stream.cancel();
    }
    return cancelledAfterRejection;
  };

  const coreCancelled = await runUpload(true);
  const directCancelled = await runUpload(false);

  console.log({ coreCancelled, directCancelled, fetches });

  assert.equal(
    coreCancelled,
    true,
    'core upload must release the source stream',
  );
  assert.equal(fetches, 0, 'header preparation must fail before fetch');
  assert.equal(
    directCancelled,
    true,
    'ISSUE_22799: direct OpenAI upload left the source stream open after header preparation failed',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
