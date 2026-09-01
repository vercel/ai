import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { callCompletionApi, DefaultChatTransport, jsonSchema } from 'ai';

const emptyErrorResponse = async () => new Response(null, { status: 502 });

const blankMessages: string[] = [];

function checkErrorMessage(label: string, error: unknown) {
  if (!(error instanceof Error)) {
    throw new Error(`${label} did not surface an Error instance.`);
  }

  if (error.message.trim().length === 0) {
    blankMessages.push(label);
  }
}

async function captureThrownError(operation: () => Promise<unknown>) {
  try {
    await operation();
  } catch (error) {
    return error;
  }

  throw new Error('Expected an HTTP 502 response to surface an error.');
}

function runFrameworkReproduction({
  label,
  packageDirectory,
  testPath,
  failureMarker,
}: {
  label: string;
  packageDirectory: string;
  testPath: string;
  failureMarker: string;
}) {
  const result = spawnSync(
    'pnpm',
    ['-C', packageDirectory, 'exec', 'vitest', 'run', testPath],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: process.env,
    },
  );
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;

  if (result.status === 0) {
    return;
  }

  if (output.includes(failureMarker)) {
    blankMessages.push(label);
    return;
  }

  process.stderr.write(output);
  throw new Error(`${label} reproduction failed for an unrelated reason.`);
}

async function main() {
  const responseText = await emptyErrorResponse().then(response =>
    response.text(),
  );
  if (responseText !== '') {
    throw new Error(
      `Expected Response.text() for an empty body to be "", received ${JSON.stringify(responseText)}.`,
    );
  }

  const transport = new DefaultChatTransport({
    fetch: emptyErrorResponse,
  });

  checkErrorMessage(
    'DefaultChatTransport.sendMessages',
    await captureThrownError(() =>
      transport.sendMessages({
        chatId: 'chat-id',
        messageId: 'message-id',
        trigger: 'submit-message',
        messages: [],
        abortSignal: new AbortController().signal,
      }),
    ),
  );

  checkErrorMessage(
    'DefaultChatTransport.reconnectToStream',
    await captureThrownError(() =>
      transport.reconnectToStream({
        chatId: 'chat-id',
        abortSignal: new AbortController().signal,
      }),
    ),
  );

  let completionError: Error | undefined;
  await callCompletionApi({
    api: '/api/completion',
    prompt: 'hello',
    credentials: undefined,
    headers: undefined,
    body: {},
    streamProtocol: 'text',
    setCompletion: () => {},
    setLoading: () => {},
    setError: error => {
      completionError = error;
    },
    setAbortController: () => {},
    onFinish: undefined,
    onError: undefined,
    fetch: emptyErrorResponse,
  });
  checkErrorMessage('callCompletionApi', completionError);

  const { StructuredObject: AngularStructuredObject } = await import(
    pathToFileURL(resolve(repoRoot, 'packages/angular/src/index.ts')).href
  );
  const angularObject = new AngularStructuredObject({
    api: '/api/object',
    schema: jsonSchema<{ value: string }>({
      type: 'object',
      properties: { value: { type: 'string' } },
      required: ['value'],
      additionalProperties: false,
    }),
    fetch: emptyErrorResponse,
  });
  await angularObject.submit({});
  checkErrorMessage('Angular StructuredObject', angularObject.error);

  runFrameworkReproduction({
    label: 'React useObject',
    packageDirectory: resolve(repoRoot, 'packages/react'),
    testPath: 'src/reproduction/issue-20107-empty-error-body.test.tsx',
    failureMarker: 'ISSUE20107_REACT_EXPECTED_NON_EMPTY_ERROR_MESSAGE',
  });
  runFrameworkReproduction({
    label: 'Svelte StructuredObject',
    packageDirectory: resolve(repoRoot, 'packages/svelte'),
    testPath: 'src/reproduction/issue-20107-empty-error-body.svelte.test.ts',
    failureMarker: 'ISSUE20107_SVELTE_EXPECTED_NON_EMPTY_ERROR_MESSAGE',
  });

  if (blankMessages.length > 0) {
    console.error(
      'ISSUE #20107 reproduced: empty HTTP error bodies produced blank user-visible error messages',
    );
    console.error(`Affected paths: ${blankMessages.join(', ')}`);
    process.exitCode = 1;
  }
}

const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);

main().catch(error => {
  console.error(error);
  process.exitCode = 2;
});
