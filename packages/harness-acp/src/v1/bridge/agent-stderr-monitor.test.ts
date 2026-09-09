import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { monitorACPAgentStderr } from './agent-stderr-monitor';

describe('monitorACPAgentStderr', () => {
  it('forwards stderr and rejects when the agent cannot deserialize a response stream', async () => {
    const stderr = new PassThrough();
    const onStderrLine = vi.fn();
    const failure = monitorACPAgentStderr({ stderr, onStderrLine });

    stderr.write('ordinary diagnostic\n');
    stderr.write(
      '\u001b[31mERROR\u001b[0m Failed to deserialize ResponseStreamEvent from stream error=invalid response\n',
    );

    await expect(failure).rejects.toThrow(
      'ACP agent failed to deserialize a streamed response.',
    );
    expect(onStderrLine).toHaveBeenNthCalledWith(1, 'ordinary diagnostic');
    expect(onStderrLine).toHaveBeenNthCalledWith(
      2,
      '\u001b[31mERROR\u001b[0m Failed to deserialize ResponseStreamEvent from stream error=invalid response',
    );
  });
});
