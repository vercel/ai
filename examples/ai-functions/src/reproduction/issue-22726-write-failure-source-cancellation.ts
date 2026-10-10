import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { ServerResponse } from 'node:http';
import { pipeTextStreamToResponse } from 'ai';

type FailurePoint = 'write' | 'flush';

async function nextImmediate(): Promise<void> {
  await new Promise<void>(resolve => setImmediate(resolve));
}

async function observeDestinationFailure(failurePoint: FailurePoint) {
  const failure = new Error(`synthetic ${failurePoint} failure`);
  let cancelled = false;

  const stream = new ReadableStream<string>({
    start(controller) {
      controller.enqueue('hello');
    },
    cancel() {
      cancelled = true;
    },
  });

  class ResponseMock extends EventEmitter {
    destroyed = false;
    writableFinished = false;

    setHeaders() {}

    writeHead() {}

    write() {
      if (failurePoint === 'write') {
        throw failure;
      }
      return true;
    }

    flush() {
      if (failurePoint === 'flush') {
        throw failure;
      }
    }

    end() {
      this.writableFinished = true;
    }
  }

  let rejection: unknown;
  try {
    await pipeTextStreamToResponse({
      response: new ResponseMock() as unknown as ServerResponse,
      stream,
    });
  } catch (error) {
    rejection = error;
  }

  assert.equal(
    rejection,
    failure,
    `${failurePoint} failure must reject with the original destination error`,
  );

  await nextImmediate();

  return {
    cancelled,
    sourceLocked: stream.locked,
  };
}

async function verifyNormalCompletion(): Promise<void> {
  let cancelled = false;

  const stream = new ReadableStream<string>({
    start(controller) {
      controller.enqueue('hello');
      controller.close();
    },
    cancel() {
      cancelled = true;
    },
  });

  class ResponseMock extends EventEmitter {
    destroyed = false;
    writableFinished = false;

    setHeaders() {}

    writeHead() {}

    write() {
      return true;
    }

    end() {
      this.writableFinished = true;
    }
  }

  const response = new ResponseMock();
  await pipeTextStreamToResponse({
    response: response as unknown as ServerResponse,
    stream,
  });
  await nextImmediate();

  assert.equal(
    cancelled,
    false,
    'normal completion must not cancel the source',
  );
  assert.equal(
    stream.locked,
    false,
    'normal completion must unlock the source',
  );
  assert.equal(response.writableFinished, true, 'normal completion must end');
}

async function verifyClientDisconnect(): Promise<void> {
  let cancelled = false;
  let firstWrite: (() => void) | undefined;

  const stream = new ReadableStream<string>({
    start(controller) {
      controller.enqueue('hello');
    },
    cancel() {
      cancelled = true;
    },
  });

  class ResponseMock extends EventEmitter {
    destroyed = false;
    writableFinished = false;

    setHeaders() {}

    writeHead() {}

    write() {
      firstWrite?.();
      return true;
    }

    end() {
      this.writableFinished = true;
    }
  }

  const response = new ResponseMock();
  const wrote = new Promise<void>(resolve => {
    firstWrite = resolve;
  });

  const piping = pipeTextStreamToResponse({
    response: response as unknown as ServerResponse,
    stream,
  });

  await wrote;
  response.emit('close');
  await piping;
  await nextImmediate();

  assert.equal(cancelled, true, 'client disconnect must cancel the source');
  assert.equal(
    stream.locked,
    false,
    'client disconnect must unlock the source',
  );
  assert.equal(
    response.writableFinished,
    false,
    'client disconnect must not end a failed response',
  );
}

async function main(): Promise<void> {
  await verifyNormalCompletion();
  await verifyClientDisconnect();

  const writeFailure = await observeDestinationFailure('write');
  const flushFailure = await observeDestinationFailure('flush');

  console.log({ writeFailure, flushFailure });

  const failedCleanup = [
    ['write', writeFailure],
    ['flush', flushFailure],
  ].filter(([, result]) => {
    const observation = result as typeof writeFailure;
    return !observation.cancelled || observation.sourceLocked;
  });

  if (failedCleanup.length > 0) {
    throw new Error(
      `AI SDK destination failure cleanup bug: ${failedCleanup
        .map(([failurePoint, result]) => {
          const observation = result as typeof writeFailure;
          return `${failurePoint}(cancelled=${observation.cancelled}, sourceLocked=${observation.sourceLocked})`;
        })
        .join(', ')}`,
    );
  }
}

main();
