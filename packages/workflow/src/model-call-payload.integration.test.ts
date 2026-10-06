import { waitForSleep } from '@workflow/vitest';
import { describe, expect, it } from 'vitest';
import { start } from 'workflow/api';
import { modelCallPayloadWorkflow } from './test/model-call-payload-workflow.js';

describe('durable model-call payload', () => {
  it('retains compact results and failure presence across suspension and a second step boundary', async () => {
    const run = await start(modelCallPayloadWorkflow, []);
    const sleepId = await waitForSleep(run);
    await run.wakeUp({ correlationIds: [sleepId] });
    const result = await run.returnValue;

    expect(result).toHaveLength(4);
    expect(result[0]).toEqual({
      text: 'answer',
      file: { base64: 'aGVsbG8=', mediaType: 'text/plain' },
      timestamp: new Date('2026-01-01T00:00:00Z'),
      sourceIds: ['source-1'],
      contentTypes: ['text', 'file', 'source', 'tool-call', 'tool-result'],
      providerResult: {
        toolCallId: 'lookup-1',
        toolName: 'lookup',
        result: { answer: 42 },
        providerMetadata: { fixture: { source: 'retained' } },
      },
      providerMetadata: { fixture: { retained: true } },
      warnings: [{ type: 'other', message: 'fixture warning' }],
      hasTerminalError: false,
      terminalError: undefined,
      rawKeys: ['content', 'reasoning', 'responseMetadata', 'warnings'],
    });
    expect(result[1]).toMatchObject({
      hasTerminalError: true,
      terminalError: undefined,
    });
    expect(result[2]).toMatchObject({
      hasTerminalError: true,
      terminalError: expect.objectContaining({ message: 'model failed' }),
    });
    expect(result[3]).toEqual({ aborted: true });

    const reader = run.readable.getReader();
    try {
      expect(await reader.read()).toEqual({ done: false, value: 'produced' });
      expect(await reader.read()).toEqual({ done: true, value: undefined });
    } finally {
      reader.releaseLock();
    }
  });
});
