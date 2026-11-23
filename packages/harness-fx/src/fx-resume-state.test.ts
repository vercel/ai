import { describe, expect, it } from 'vitest';
import { fxResumeStateSchema, parseFxResumeStateData } from './fx-resume-state';

const turn = {
  id: 'turn-1',
  prompt: 'go',
  signature: 'signature',
  models: [
    {
      fingerprint: 'fingerprint',
      body: 'data: {}\n\n',
      status: 200,
      complete: true,
      emittedOutput: { text: 0, reasoning: 0 },
      attempt: 0,
    },
  ],
  tools: [
    {
      id: 'call-1',
      name: 'bash',
      input: { command: 'pwd' },
      status: 'waiting',
      approvalId: 'fx:call-1',
    },
  ],
  emittedKeys: ['start'],
  steers: [],
};

describe('fxResumeStateSchema', () => {
  it('accepts the whole session', () => {
    const data = {
      session: { provider: 'gateway', checkpoint: 'Y2hlY2twb2ludA==', turn },
    };

    expect(parseFxResumeStateData(data)).toEqual(data);
  });

  it('accepts a session storage leaf', () => {
    expect(parseFxResumeStateData({ leafId: 'entry-1' })).toEqual({
      leafId: 'entry-1',
    });
  });

  it.each([
    {
      name: 'both a session and a leaf',
      data: { session: { provider: 'gateway' }, leafId: 'entry-1' },
    },
    { name: 'neither a session nor a leaf', data: {} },
    { name: 'an empty leaf', data: { leafId: '' } },
    { name: 'a session without a provider', data: { session: {} } },
  ])('rejects $name', ({ data }) => {
    expect(fxResumeStateSchema.safeParse(data).success).toBe(false);
  });
});
