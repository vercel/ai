import { EventEmitter } from 'node:events';
import type { ServerResponse } from 'node:http';
import { InvalidResponseDataError, pipeTextStreamToResponse } from 'ai';

class MockServerResponse extends EventEmitter {
  writeHead(): this {
    return this;
  }

  write(): boolean {
    return true;
  }

  end(): this {
    return this;
  }
}

async function main() {
  let resolveUnhandledRejection: (reason: unknown) => void;
  const unhandledRejection = new Promise<unknown>(resolve => {
    resolveUnhandledRejection = resolve;
  });
  const onUnhandledRejection = (reason: unknown) => {
    resolveUnhandledRejection(reason);
  };
  process.once('unhandledRejection', onUnhandledRejection);

  const stream = new ReadableStream<string>({
    pull() {
      throw new InvalidResponseDataError({
        data: { function: { arguments: '{}' } },
        message: `Expected 'function.name' to be a string.`,
      });
    },
  });

  let caughtByCaller: unknown;
  try {
    await pipeTextStreamToResponse({
      response: new MockServerResponse() as unknown as ServerResponse,
      stream,
    });
  } catch (error) {
    caughtByCaller = error;
  }

  const observedUnhandledRejection = await Promise.race([
    unhandledRejection,
    new Promise<undefined>(resolve =>
      setTimeout(() => resolve(undefined), 250),
    ),
  ]);
  process.removeListener('unhandledRejection', onUnhandledRejection);

  if (caughtByCaller != null) {
    console.log('The stream read error was caught by the caller.');
    return;
  }

  if (
    !InvalidResponseDataError.isInstance(observedUnhandledRejection) ||
    observedUnhandledRejection.message !==
      `Expected 'function.name' to be a string.`
  ) {
    throw new Error(
      'The piping call returned without rejecting, but the expected unhandled AI_InvalidResponseDataError was not observed.',
    );
  }

  throw new Error(
    "Reproduced issue #11023: the caller's catch was bypassed and AI_InvalidResponseDataError became an unhandled rejection.",
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
