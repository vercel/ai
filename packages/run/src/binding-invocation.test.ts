import { describe, expect, it, vi } from 'vitest';
import { invokeHostBinding } from '../dist/binding-invocation.js';
import type { BindingContext } from '../dist/index.js';

describe('invokeHostBinding', () => {
  it('rejects oversized arguments before parsing them', async () => {
    const binding = vi.fn();
    const abortController = new AbortController();
    const context: BindingContext = {
      abortSignal: abortController.signal,
      invocationId: 'invocation-1',
      logicalRunId: 'logical-run-1',
      requestId: 'request-1',
      requestIndex: 1,
      bindingName: 'tools.test',
      interrupt: () => {
        throw new Error('not used');
      },
    };

    await expect(
      invokeHostBinding({
        bindingName: 'tools.test',
        inputJson: `[${' '.repeat(32)}`,
        bindings: { tools: { test: binding } },
        context,
        maxBindingInputBytes: 8,
        maxBindingOutputBytes: 1024,
      }),
    ).rejects.toMatchObject({ code: 'RUN_BINDING_ERROR' });
    expect(binding).not.toHaveBeenCalled();
  });

  it('rejects unknown and non-function own bindings', async () => {
    const context = createContext('tools.missing');
    await expect(
      invokeHostBinding({
        bindingName: 'tools.missing',
        inputJson: '[[]]',
        bindings: { tools: { present: () => true } },
        context,
        maxBindingInputBytes: 1024,
        maxBindingOutputBytes: 1024,
      }),
    ).rejects.toMatchObject({
      code: 'RUN_BINDING_ERROR',
      details: { availableBindings: ['tools.present'] },
    });

    await expect(
      invokeHostBinding({
        bindingName: 'tools.present',
        inputJson: '[[]]',
        bindings: {
          tools: { present: true as unknown as () => boolean },
        },
        context: createContext('tools.present'),
        maxBindingInputBytes: 1024,
        maxBindingOutputBytes: 1024,
      }),
    ).rejects.toMatchObject({ code: 'RUN_BINDING_ERROR' });
  });

  it('serializes arguments and output at the host boundary', async () => {
    const binding = vi.fn((input: unknown) => ({ input, omitted: undefined }));
    await expect(
      invokeHostBinding({
        bindingName: 'tools.test',
        inputJson: '[[1],{"value":2},1]',
        bindings: { tools: { test: binding } },
        context: createContext('tools.test'),
        maxBindingInputBytes: 1024,
        maxBindingOutputBytes: 1024,
      }),
    ).resolves.toEqual({
      status: 'fulfilled',
      valueJson: '[{"input":1,"omitted":-1},{"value":2},1]',
    });
    expect(binding).toHaveBeenCalledWith({ value: 1 });
  });

  it('rejects oversized binding output', async () => {
    await expect(
      invokeHostBinding({
        bindingName: 'tools.test',
        inputJson: '[[]]',
        bindings: { tools: { test: () => 'too large' } },
        context: createContext('tools.test'),
        maxBindingInputBytes: 1024,
        maxBindingOutputBytes: 4,
      }),
    ).rejects.toMatchObject({ code: 'RUN_SERIALIZATION_ERROR' });
  });
});

function createContext(bindingName: string): BindingContext {
  return {
    abortSignal: new AbortController().signal,
    invocationId: 'invocation-1',
    logicalRunId: 'logical-run-1',
    requestId: 'request-1',
    requestIndex: 1,
    bindingName,
    interrupt: () => {
      throw new Error('not used');
    },
  };
}
