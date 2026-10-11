import { AIMessageChunk } from '@langchain/core/messages';
import {
  toUIMessageStream,
  type ToUIMessageStreamOptions,
} from '@ai-sdk/langchain';

type Observation = {
  chunkTypes: string[];
  readError: string | undefined;
};

async function* completedSource(): AsyncGenerator<AIMessageChunk> {
  yield new AIMessageChunk('hello');
}

async function* failingSource(): AsyncGenerator<AIMessageChunk> {
  yield new AIMessageChunk('hello');
  throw new Error('synthetic source failure');
}

async function observe(
  source: AsyncIterable<AIMessageChunk>,
  options: ToUIMessageStreamOptions,
): Promise<Observation> {
  const chunkTypes: string[] = [];

  try {
    for await (const chunk of toUIMessageStream(source, options)) {
      chunkTypes.push(chunk.type);
    }

    return { chunkTypes, readError: undefined };
  } catch (error) {
    return {
      chunkTypes,
      readError: error instanceof Error ? error.message : String(error),
    };
  }
}

function requireBaseline(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`ISSUE_22784_REPRODUCTION_BASELINE_FAILED: ${message}`);
  }
}

async function main(): Promise<void> {
  let ordinaryFinals = 0;
  let ordinaryFinishes = 0;
  const ordinary = await observe(completedSource(), {
    onFinal: () => {
      ordinaryFinals++;
    },
    onFinish: () => {
      ordinaryFinishes++;
    },
  });

  requireBaseline(ordinaryFinals === 1, 'ordinary onFinal count changed');
  requireBaseline(ordinaryFinishes === 1, 'ordinary onFinish count changed');
  requireBaseline(
    ordinary.chunkTypes.at(-1) === 'finish',
    'ordinary completion did not emit finish',
  );

  let sourceErrorFinals = 0;
  let sourceErrors = 0;
  const sourceFailure = await observe(failingSource(), {
    onFinal: () => {
      sourceErrorFinals++;
    },
    onError: () => {
      sourceErrors++;
    },
  });

  requireBaseline(
    sourceErrorFinals === 1,
    'source-error onFinal count changed',
  );
  requireBaseline(sourceErrors === 1, 'source-error onError count changed');
  requireBaseline(
    sourceFailure.chunkTypes.at(-1) === 'error',
    'source error did not emit an error chunk',
  );

  let syncFinishFinals = 0;
  let syncFinishErrors = 0;
  const syncFinishFailure = await observe(completedSource(), {
    onFinal: () => {
      syncFinishFinals++;
    },
    onFinish: () => {
      throw new Error('synthetic synchronous finish failure');
    },
    onError: () => {
      syncFinishErrors++;
    },
  });

  let asyncFinishFinals = 0;
  let asyncFinishErrors = 0;
  const asyncFinishFailure = await observe(completedSource(), {
    onFinal: async () => {
      await Promise.resolve();
      asyncFinishFinals++;
    },
    onFinish: async () => {
      await Promise.resolve();
      throw new Error('synthetic asynchronous finish failure');
    },
    onError: async () => {
      await Promise.resolve();
      asyncFinishErrors++;
    },
  });

  requireBaseline(
    syncFinishErrors === 1 && asyncFinishErrors === 1,
    'onFinish failures were not reported to onError exactly once',
  );
  requireBaseline(
    syncFinishFailure.chunkTypes.slice(-2).join(',') === 'finish,error' &&
      asyncFinishFailure.chunkTypes.slice(-2).join(',') === 'finish,error',
    'onFinish failures did not preserve finish followed by error chunks',
  );

  let syncFinalCalls = 0;
  const syncFinalFailure = await observe(completedSource(), {
    onFinal: () => {
      syncFinalCalls++;
      throw new Error('synthetic synchronous final failure');
    },
  });

  let asyncFinalCalls = 0;
  const asyncFinalFailure = await observe(completedSource(), {
    onFinal: async () => {
      await Promise.resolve();
      asyncFinalCalls++;
      throw new Error('synthetic asynchronous final failure');
    },
  });

  console.log({
    ordinary: {
      finals: ordinaryFinals,
      finishes: ordinaryFinishes,
      chunks: ordinary.chunkTypes,
    },
    sourceFailure: {
      finals: sourceErrorFinals,
      errors: sourceErrors,
      chunks: sourceFailure.chunkTypes,
    },
    syncFinishFailure: {
      finals: syncFinishFinals,
      errors: syncFinishErrors,
      chunks: syncFinishFailure.chunkTypes,
    },
    asyncFinishFailure: {
      finals: asyncFinishFinals,
      errors: asyncFinishErrors,
      chunks: asyncFinishFailure.chunkTypes,
    },
    syncFinalFailure: {
      calls: syncFinalCalls,
      readError: syncFinalFailure.readError,
    },
    asyncFinalFailure: {
      calls: asyncFinalCalls,
      readError: asyncFinalFailure.readError,
    },
  });

  if (syncFinishFinals !== 1 || asyncFinishFinals !== 1) {
    throw new Error(
      `ISSUE_22784_REPRODUCED: onFinish failures caused onFinal counts sync=${syncFinishFinals} async=${asyncFinishFinals}; expected 1 each`,
    );
  }

  if (syncFinalCalls !== 1 || asyncFinalCalls !== 1) {
    throw new Error(
      `ISSUE_22784_REPRODUCED: throwing onFinal was retried; counts sync=${syncFinalCalls} async=${asyncFinalCalls}; expected 1 each`,
    );
  }
}

main();
