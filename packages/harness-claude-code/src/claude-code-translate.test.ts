import { describe, expect, it } from 'vitest';
import { translate } from './claude-code-translate';

describe('translate', () => {
  it('passes through text-delta unchanged', () => {
    const out = translate({ type: 'text-delta', id: 'a', delta: 'hi' });
    expect(out).toEqual({ type: 'text-delta', id: 'a', delta: 'hi' });
  });

  it('coerces tool-result `result` to a non-nullable JSON value', () => {
    const out = translate({
      type: 'tool-result',
      toolCallId: 't1',
      toolName: 'bash',
      result: undefined as unknown as null,
    });
    expect(out).toMatchObject({
      type: 'tool-result',
      toolCallId: 't1',
      toolName: 'bash',
      result: null,
    });
  });

  it('preserves providerExecuted and nativeName on tool-call', () => {
    const out = translate({
      type: 'tool-call',
      toolCallId: 'c1',
      toolName: 'bash',
      input: '{}',
      nativeName: 'Bash',
      providerExecuted: true,
    });
    expect(out).toMatchObject({
      type: 'tool-call',
      nativeName: 'Bash',
      providerExecuted: true,
    });
  });

  it('passes finish-step and finish through', () => {
    const usage = { inputTokens: { total: 1 }, outputTokens: { total: 2 } };
    const step = translate({
      type: 'finish-step',
      finishReason: { unified: 'stop', raw: 'stop' },
      usage,
    });
    expect(step).toMatchObject({ type: 'finish-step', usage });

    const fin = translate({
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'stop' },
      totalUsage: usage,
    });
    expect(fin).toMatchObject({ type: 'finish', totalUsage: usage });
  });
});
