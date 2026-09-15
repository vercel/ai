import { getWritable, sleep } from 'workflow';
import { buildModelStepResult } from '../build-model-step-result.js';
import type { ModelCallResult } from '../model-call.js';

export async function modelCallPayloadWorkflow() {
  'use workflow';

  const payloads = await producePayloads();
  await sleep('1h');
  const restored = await roundTripPayloads(payloads);

  return restored.map(payload => {
    if (payload.aborted) return { aborted: true };

    // Reconstruct files and derived fields only in workflow context. Return
    // selected data, not the reconstructed result's generated-file instances.
    const step = buildModelStepResult(
      payload.raw,
      payload.toolCalls,
      payload.finish,
      payload.providerExecutedToolResults,
      { stepNumber: 0, runtimeContext: {}, toolsContext: {} },
    );
    return {
      text: step.text,
      file: {
        base64: step.files[0].base64,
        mediaType: step.files[0].mediaType,
      },
      timestamp: step.response.timestamp,
      sourceIds: step.sources.map(source => source.id),
      contentTypes: step.content.map(part => part.type),
      providerResult: payload.providerExecutedToolResults.get('lookup-1'),
      providerMetadata: step.providerMetadata,
      warnings: step.warnings,
      hasTerminalError: 'terminalError' in payload,
      terminalError: payload.terminalError,
      // Derived fields must not inflate the durable model result.
      rawKeys: Object.keys(payload.raw),
    };
  });
}

async function producePayloads(): Promise<ModelCallResult[]> {
  'use step';

  // The test observes this write after suspension/resumption to ensure this
  // completed step is replayed from its result rather than executed again.
  const writer = getWritable<string>().getWriter();
  try {
    await writer.write('produced');
    await writer.close();
  } finally {
    writer.releaseLock();
  }

  const completed: ModelCallResult = {
    toolCalls: [
      {
        type: 'tool-call',
        toolCallId: 'lookup-1',
        toolName: 'lookup',
        input: { query: 'example' },
        providerExecuted: true,
      },
    ],
    finish: {
      finishReason: 'stop',
      rawFinishReason: 'end_turn',
      usage: {
        inputTokens: 3,
        inputTokenDetails: {
          noCacheTokens: 2,
          cacheReadTokens: 1,
          cacheWriteTokens: undefined,
        },
        outputTokens: 1,
        outputTokenDetails: { textTokens: 1, reasoningTokens: undefined },
        totalTokens: 4,
      },
      providerMetadata: { fixture: { retained: true } },
    },
    raw: {
      content: [
        { type: 'text', text: 'answer' },
        { type: 'file', data: 'aGVsbG8=', mediaType: 'text/plain' },
        {
          type: 'source',
          sourceType: 'url',
          id: 'source-1',
          url: 'https://example.com',
        },
        { type: 'tool-call', toolCallIndex: 0 },
        { type: 'provider-tool-result', toolCallId: 'lookup-1' },
      ],
      reasoning: [],
      responseMetadata: {
        id: 'response-1',
        timestamp: new Date('2026-01-01T00:00:00Z'),
        modelId: 'fixture:model',
      },
      warnings: [{ type: 'other', message: 'fixture warning' }],
    },
    providerExecutedToolResults: new Map([
      [
        'lookup-1',
        {
          toolCallId: 'lookup-1',
          toolName: 'lookup',
          result: { answer: 42 },
          providerMetadata: { fixture: { source: 'retained' } },
        },
      ],
    ]),
  };

  return [
    completed,
    { ...completed, terminalError: undefined },
    { ...completed, terminalError: new Error('model failed') },
    { aborted: true },
  ];
}

async function roundTripPayloads(
  payloads: ModelCallResult[],
): Promise<ModelCallResult[]> {
  'use step';
  return payloads;
}
