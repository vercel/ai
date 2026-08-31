import { WorkflowAgent } from '@ai-sdk/workflow';
import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test';

const source = {
  type: 'source' as const,
  sourceType: 'url' as const,
  id: 'source-1',
  url: 'https://example.com/source',
  title: 'Example source',
};

const file = {
  type: 'file' as const,
  data: { type: 'data' as const, data: 'ZmlsZS1jb250ZW50' },
  mediaType: 'text/plain',
};

function hasPart(
  parts: unknown,
  predicate: (part: Record<string, unknown>) => boolean,
): boolean {
  return (
    Array.isArray(parts) &&
    parts.some(
      part =>
        typeof part === 'object' &&
        part !== null &&
        predicate(part as Record<string, unknown>),
    )
  );
}

async function main() {
  const streamedParts: unknown[] = [];
  let onStepEndStep: any;
  let onEndEvent: any;

  const model = new MockLanguageModelV4({
    doStream: async () => ({
      stream: convertArrayToReadableStream([
        { type: 'stream-start' as const, warnings: [] },
        source,
        file,
        { type: 'text-start' as const, id: 'text-1' },
        {
          type: 'text-delta' as const,
          id: 'text-1',
          delta: 'answer',
        },
        { type: 'text-end' as const, id: 'text-1' },
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
              total: 1,
              text: 1,
              reasoning: undefined,
            },
          },
        },
      ]),
    }),
  });

  const agent = new WorkflowAgent({ model });
  const result = await agent.stream({
    messages: [{ role: 'user', content: 'question' }],
    writable: new WritableStream({
      write(part) {
        streamedParts.push(part);
      },
    }),
    onStepEnd(step) {
      onStepEndStep = step;
    },
    onEnd(event) {
      onEndEvent = event;
    },
  });

  const streamHasSource = hasPart(
    streamedParts,
    part => part.type === 'source' && part.id === source.id,
  );
  const streamHasFile = hasPart(
    streamedParts,
    part =>
      part.type === 'file' &&
      typeof part.file === 'object' &&
      part.file !== null &&
      (part.file as { mediaType?: unknown }).mediaType === file.mediaType,
  );

  if (!streamHasSource || !streamHasFile) {
    console.error(
      JSON.stringify(
        streamedParts.map(part =>
          typeof part === 'object' && part !== null
            ? (part as { type?: unknown })
            : part,
        ),
        null,
        2,
      ),
    );
    throw new Error(
      'REPRODUCTION SETUP FAILED: model file/source parts did not reach the writable stream',
    );
  }

  const step = result.steps[0];
  const assistantMessage = result.messages.find(
    message => message.role === 'assistant',
  );
  const callbackAssistantMessage = onEndEvent?.messages?.find(
    (message: { role?: string }) => message.role === 'assistant',
  );

  const observations = {
    streamHasSource,
    streamHasFile,
    stepContentTypes: step?.content.map(part => part.type),
    stepFiles: step?.files.map(file => ({ mediaType: file.mediaType })),
    stepSources: step?.sources,
    resultAssistantContentTypes: Array.isArray(assistantMessage?.content)
      ? assistantMessage.content.map(part => part.type)
      : [],
    onStepEndContentTypes: onStepEndStep?.content?.map(
      (part: { type: string }) => part.type,
    ),
    onStepEndFileCount: onStepEndStep?.files?.length,
    onStepEndSourceCount: onStepEndStep?.sources?.length,
    onEndContentTypes: onEndEvent?.steps?.[0]?.content?.map(
      (part: { type: string }) => part.type,
    ),
    onEndFileCount: onEndEvent?.steps?.[0]?.files?.length,
    onEndSourceCount: onEndEvent?.steps?.[0]?.sources?.length,
    onEndAssistantContentTypes: Array.isArray(callbackAssistantMessage?.content)
      ? callbackAssistantMessage.content.map(
          (part: { type: string }) => part.type,
        )
      : [],
  };

  const missingDurableRetention = [
    [
      'StepResult.content source',
      hasPart(
        step?.content,
        part => part.type === 'source' && part.id === source.id,
      ),
    ],
    [
      'StepResult.content file',
      hasPart(step?.content, part => part.type === 'file' && part.file != null),
    ],
    [
      'StepResult.sources',
      hasPart(
        step?.sources,
        part => part.type === 'source' && part.id === source.id,
      ),
    ],
    [
      'StepResult.files',
      hasPart(step?.files, part => part.mediaType === file.mediaType),
    ],
    [
      'onStepEnd StepResult source',
      hasPart(onStepEndStep?.sources, part => part.id === source.id),
    ],
    [
      'onStepEnd StepResult file',
      hasPart(onStepEndStep?.files, part => part.mediaType === file.mediaType),
    ],
    [
      'onEnd StepResult source',
      hasPart(onEndEvent?.steps?.[0]?.sources, part => part.id === source.id),
    ],
    [
      'onEnd StepResult file',
      hasPart(
        onEndEvent?.steps?.[0]?.files,
        part => part.mediaType === file.mediaType,
      ),
    ],
    [
      'result assistant file history',
      hasPart(
        assistantMessage?.content,
        part => part.type === 'file' && part.mediaType === file.mediaType,
      ),
    ],
    [
      'onEnd assistant file history',
      hasPart(
        callbackAssistantMessage?.content,
        part => part.type === 'file' && part.mediaType === file.mediaType,
      ),
    ],
  ]
    .filter(([, retained]) => !retained)
    .map(([name]) => name);

  if (missingDurableRetention.length > 0) {
    console.error(JSON.stringify(observations, null, 2));
    throw new Error(
      `ISSUE #20072 REPRODUCED: writable file/source chunks are missing from durable WorkflowAgent results: ${missingDurableRetention.join(', ')}`,
    );
  }

  console.log('Issue #20072 is not reproduced.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
