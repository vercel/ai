import { APICallError, type SpeechModelV4 } from '@ai-sdk/provider';
import { generateSpeech } from 'ai';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';

type APICallErrorConstructor = new (
  options: ConstructorParameters<typeof APICallError>[0],
) => APICallError;

type RunResult = {
  calls: number;
  nativeError: boolean;
  recognized: boolean;
  rejected: boolean;
  retryable: boolean;
};

async function loadForeignAPICallError(): Promise<APICallErrorConstructor> {
  const providerEntry = createRequire(import.meta.url).resolve(
    '@ai-sdk/provider',
  );
  const providerDirectory = path.dirname(providerEntry);
  const [aiSdkErrorSource, apiCallErrorSource] = await Promise.all([
    readFile(path.join(providerDirectory, 'errors/ai-sdk-error.js'), 'utf8'),
    readFile(path.join(providerDirectory, 'errors/api-call-error.js'), 'utf8'),
  ]);
  const aiSdkErrorSourceForVm = aiSdkErrorSource.replace(
    'export class AISDKError',
    'globalThis.AISDKError = class AISDKError',
  );
  const apiCallErrorSourceForVm = apiCallErrorSource
    .replace("import { AISDKError } from './ai-sdk-error';", '')
    .replace(
      'export class APICallError',
      'globalThis.ForeignAPICallError = class APICallError',
    );

  if (
    aiSdkErrorSourceForVm === aiSdkErrorSource ||
    apiCallErrorSourceForVm === apiCallErrorSource
  ) {
    throw new Error('Could not expose classes from the provider package');
  }

  const sandbox: {
    AISDKError?: typeof Error;
    ForeignAPICallError?: APICallErrorConstructor;
  } = {};
  vm.runInNewContext(`(() => { ${aiSdkErrorSourceForVm} })()`, sandbox, {
    filename: path.join(providerDirectory, 'errors/ai-sdk-error.js'),
  });
  vm.runInNewContext(`(() => { ${apiCallErrorSourceForVm} })()`, sandbox, {
    filename: path.join(providerDirectory, 'errors/api-call-error.js'),
  });

  if (sandbox.ForeignAPICallError == null) {
    throw new Error('The provider package did not expose APICallError');
  }

  return sandbox.ForeignAPICallError;
}

async function run(ErrorClass: APICallErrorConstructor): Promise<RunResult> {
  let calls = 0;
  const error = new ErrorClass({
    message: 'temporary unavailable',
    url: 'https://synthetic.invalid',
    requestBodyValues: {},
    statusCode: 503,
    responseHeaders: { 'retry-after-ms': '1' },
  });
  let rejected = false;

  const model: SpeechModelV4 = {
    specificationVersion: 'v4',
    provider: 'synthetic',
    modelId: 'mock',
    async doGenerate() {
      calls++;
      if (calls === 1) {
        throw error;
      }

      return {
        audio: new Uint8Array([1]),
        warnings: [],
        response: {
          timestamp: new Date(0),
          modelId: 'mock',
        },
      };
    },
  };

  try {
    await generateSpeech({
      text: 'Hello',
      maxRetries: 1,
      model,
    });
  } catch {
    rejected = true;
  }

  return {
    calls,
    nativeError: error instanceof Error,
    recognized: APICallError.isInstance(error),
    rejected,
    retryable: error.isRetryable,
  };
}

async function main() {
  const hostResult = await run(APICallError);
  if (
    !hostResult.nativeError ||
    !hostResult.recognized ||
    !hostResult.retryable ||
    hostResult.calls !== 2 ||
    hostResult.rejected
  ) {
    throw new Error(
      `Host-realm control failed unexpectedly: ${JSON.stringify(hostResult)}`,
    );
  }

  const ForeignAPICallError = await loadForeignAPICallError();
  const foreignResult = await run(ForeignAPICallError);

  console.log(JSON.stringify({ hostResult, foreignResult }));

  if (
    foreignResult.nativeError ||
    !foreignResult.recognized ||
    !foreignResult.retryable
  ) {
    throw new Error(
      `Cross-realm preconditions failed: ${JSON.stringify(foreignResult)}`,
    );
  }

  if (foreignResult.rejected || foreignResult.calls !== 2) {
    throw new Error(
      'ISSUE_22964: recognized retryable cross-realm APICallError was not retried',
    );
  }
}

main();
