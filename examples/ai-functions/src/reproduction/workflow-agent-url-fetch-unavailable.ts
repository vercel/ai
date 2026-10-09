import { WorkflowAgent } from '@ai-sdk/workflow';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';

const WORKFLOW_FETCH_ERROR =
  'Global "fetch" is unavailable in workflow functions. Use the "fetch" step function from "workflow" to make HTTP requests.';
const REPRODUCTION_SIGNAL =
  'ISSUE_22381_REPRODUCED: image,file URL parts failed before the model call with workflow fetch unavailable';

type UrlPartCase = {
  name: 'image' | 'file';
  url: URL;
  part:
    | { type: 'image'; image: URL; mediaType: 'image/png' }
    | { type: 'file'; data: URL; mediaType: 'image/png' };
};

async function runCase(
  testCase: UrlPartCase,
  useNoOpDownload = false,
): Promise<'passed' | 'bug'> {
  const model = new MockLanguageModelV4({
    supportedUrls: { '*/*': [/.*/] },
    doStream: async () => ({
      stream: convertArrayToReadableStream([
        { type: 'stream-start' as const, warnings: [] },
        {
          type: 'finish' as const,
          finishReason: { unified: 'stop' as const, raw: 'stop' },
          usage: {
            inputTokens: {
              total: 1,
              noCache: 1,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: {
              total: 0,
              text: 0,
              reasoning: undefined,
            },
          },
        },
      ]),
    }),
  });

  try {
    const result = await new WorkflowAgent({ model }).stream({
      messages: [
        {
          role: 'user',
          content: [testCase.part],
        },
      ],
      ...(useNoOpDownload
        ? {
            experimental_download: async requests => requests.map(() => null),
          }
        : {}),
    });

    if (result.steps.length !== 1 || model.doStreamCalls.length !== 1) {
      throw new Error(
        `${testCase.name} URL part did not complete exactly one model step`,
      );
    }

    const userMessage = model.doStreamCalls[0]?.prompt.find(
      message => message.role === 'user',
    );
    const filePart = userMessage?.content.find(part => part.type === 'file');
    if (
      filePart?.type !== 'file' ||
      filePart.data.type !== 'url' ||
      String(filePart.data.url) !== testCase.url.href
    ) {
      throw new Error(
        `${testCase.name} URL part did not reach the model unchanged`,
      );
    }

    return 'passed';
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === 'AI_DownloadError' &&
      error.message.includes(WORKFLOW_FETCH_ERROR) &&
      model.doStreamCalls.length === 0
    ) {
      return 'bug';
    }

    throw error;
  }
}

async function main() {
  const originalFetch = globalThis.fetch;
  const runtimeGlobal = globalThis as typeof globalThis & {
    EdgeRuntime?: unknown;
  };
  const originalEdgeRuntime = runtimeGlobal.EdgeRuntime;
  globalThis.fetch = (() => {
    throw new Error(WORKFLOW_FETCH_ERROR);
  }) as typeof fetch;
  runtimeGlobal.EdgeRuntime = 'workflow';

  try {
    const cases: UrlPartCase[] = [
      {
        name: 'image',
        url: new URL('https://example.com/input-image.png'),
        part: {
          type: 'image',
          image: new URL('https://example.com/input-image.png'),
          mediaType: 'image/png',
        },
      },
      {
        name: 'file',
        url: new URL('https://example.com/input-file.png'),
        part: {
          type: 'file',
          data: new URL('https://example.com/input-file.png'),
          mediaType: 'image/png',
        },
      },
    ];

    const workaroundOutcomes = await Promise.all(
      cases.map(testCase => runCase(testCase, true)),
    );
    if (!workaroundOutcomes.every(outcome => outcome === 'passed')) {
      throw new Error(
        `The reported no-op experimental_download workaround did not pass: ${workaroundOutcomes.join(',')}`,
      );
    }

    const outcomes = await Promise.all(
      cases.map(testCase => runCase(testCase)),
    );
    if (outcomes.every(outcome => outcome === 'bug')) {
      throw new Error(REPRODUCTION_SIGNAL);
    }

    if (outcomes.some(outcome => outcome === 'bug')) {
      throw new Error(
        `Only some URL part variants reproduced issue #22381: ${outcomes.join(',')}`,
      );
    }

    console.log(
      'WorkflowAgent passed image and file URLs to their supporting models.',
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalEdgeRuntime === undefined) {
      delete runtimeGlobal.EdgeRuntime;
    } else {
      runtimeGlobal.EdgeRuntime = originalEdgeRuntime;
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
