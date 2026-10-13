import { ToolLoopAgent, type ModelMessage } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

const firstCallStarted = deferred();
const releaseFirstCall = deferred();
const pendingMessages: ModelMessage[] = [];
let modelCallCount = 0;

const model = new MockLanguageModelV4({
  doGenerate: async () => {
    modelCallCount++;

    if (modelCallCount === 1) {
      firstCallStarted.resolve();
      await releaseFirstCall.promise;
    }

    return {
      content: [
        {
          type: 'text',
          text:
            modelCallCount === 1
              ? 'I finished reviewing the test failures.'
              : 'I will focus on the API tests first.',
        },
      ],
      finishReason: { unified: 'stop', raw: 'stop' },
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
      warnings: [],
    };
  },
});

const agent = new ToolLoopAgent({
  model,
  continueWhen: () => pendingMessages.length > 0,
  prepareStep: ({ messages }) => {
    if (pendingMessages.length === 0) {
      return;
    }

    return {
      messages: [...messages, ...pendingMessages.splice(0)],
    };
  },
});

const resultPromise = agent.generate({
  prompt: 'Fix the failing tests.',
});

await firstCallStarted.promise;
pendingMessages.push({
  role: 'user',
  content: 'Focus on the API tests first.',
});
releaseFirstCall.resolve();

const result = await resultPromise;

console.log(result.text);
console.log(`Model calls: ${modelCallCount}`);
