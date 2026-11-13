import { ToolLoopAgent } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';
import { WorkflowAgent } from './workflow-agent.js';

const prompt = 'What is the weather in London?';

/**
 * Aborts the signal the way a provider sees an external abort: the controller
 * aborts and the model call throws the abort reason. Without a reason the
 * signal carries a default `AbortError` instead.
 */
function abortingModel(controller: AbortController, reason?: Error) {
  const abortAndThrow = async (): Promise<never> => {
    controller.abort(reason);
    throw controller.signal.reason;
  };

  return new MockLanguageModelV4({
    doGenerate: abortAndThrow,
    doStream: abortAndThrow,
  });
}

describe('WorkflowAgent abort reasons', () => {
  it('reports a generate() abort with a custom reason as an abort', async () => {
    const controller = new AbortController();
    const reason = new Error('user cancelled');
    const constructorOnError = vi.fn();
    const constructorOnAbort = vi.fn();
    const onError = vi.fn();
    const onAbort = vi.fn();
    const agent = new WorkflowAgent({
      model: abortingModel(controller, reason),
      onError: constructorOnError,
      onAbort: constructorOnAbort,
    });

    await expect(
      agent.generate({
        prompt,
        abortSignal: controller.signal,
        onError,
        onAbort,
      }),
    ).rejects.toBe(reason);

    expect(onError).not.toHaveBeenCalled();
    expect(constructorOnError).not.toHaveBeenCalled();
    expect(onAbort).toHaveBeenCalledTimes(1);
    expect(onAbort).toHaveBeenCalledWith({ steps: [] });
    expect(constructorOnAbort).toHaveBeenCalledTimes(1);
    expect(constructorOnAbort).toHaveBeenCalledWith({ steps: [] });
  });

  it('agrees with ToolLoopAgent for a generate() abort with a custom reason', async () => {
    const toolLoopController = new AbortController();
    const workflowController = new AbortController();
    const toolLoopReason = new Error('user cancelled');
    const workflowReason = new Error('user cancelled');
    const toolLoopOnError = vi.fn();
    const workflowOnError = vi.fn();
    const toolLoopAgent = new ToolLoopAgent({
      model: abortingModel(toolLoopController, toolLoopReason),
      maxRetries: 0,
      onError: toolLoopOnError,
    });
    const workflowAgent = new WorkflowAgent({
      model: abortingModel(workflowController, workflowReason),
      maxRetries: 0,
      onError: workflowOnError,
    });

    await expect(
      toolLoopAgent.generate({
        prompt,
        abortSignal: toolLoopController.signal,
      }),
    ).rejects.toBe(toolLoopReason);
    await expect(
      workflowAgent.generate({
        prompt,
        abortSignal: workflowController.signal,
      }),
    ).rejects.toBe(workflowReason);

    expect(toolLoopOnError).not.toHaveBeenCalled();
    expect(workflowOnError).not.toHaveBeenCalled();
  });

  it('reports a generate() abort without a reason as an abort', async () => {
    const controller = new AbortController();
    const constructorOnError = vi.fn();
    const constructorOnAbort = vi.fn();
    const onError = vi.fn();
    const onAbort = vi.fn();
    const agent = new WorkflowAgent({
      model: abortingModel(controller),
      onError: constructorOnError,
      onAbort: constructorOnAbort,
    });

    await expect(
      agent.generate({
        prompt,
        abortSignal: controller.signal,
        onError,
        onAbort,
      }),
    ).rejects.toHaveProperty('name', 'AbortError');

    expect(controller.signal.reason).toHaveProperty('name', 'AbortError');
    expect(onError).not.toHaveBeenCalled();
    expect(constructorOnError).not.toHaveBeenCalled();
    expect(onAbort).toHaveBeenCalledTimes(1);
    expect(constructorOnAbort).toHaveBeenCalledTimes(1);
  });

  it('reports a model error without an abort as a failure', async () => {
    const providerError = new Error('provider unavailable');
    const controller = new AbortController();
    const onError = vi.fn();
    const onAbort = vi.fn();
    const agent = new WorkflowAgent({
      model: new MockLanguageModelV4({
        doGenerate: async () => {
          throw providerError;
        },
        doStream: async () => {
          throw providerError;
        },
      }),
      maxRetries: 0,
    });

    await expect(
      agent.generate({
        prompt,
        abortSignal: controller.signal,
        onError,
        onAbort,
      }),
    ).rejects.toBe(providerError);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith({ error: providerError });
    expect(onAbort).not.toHaveBeenCalled();
  });

  it('agrees with ToolLoopAgent for a stream() abort with a custom reason', async () => {
    const toolLoopController = new AbortController();
    const workflowController = new AbortController();
    const toolLoopOnError = vi.fn();
    const workflowOnError = vi.fn();
    const toolLoopOnAbort = vi.fn();
    const workflowOnAbort = vi.fn();
    const toolLoopAgent = new ToolLoopAgent({
      model: abortingModel(toolLoopController, new Error('user cancelled')),
      maxRetries: 0,
      onError: toolLoopOnError,
      onAbort: toolLoopOnAbort,
    });
    const workflowAgent = new WorkflowAgent({
      model: abortingModel(workflowController, new Error('user cancelled')),
      maxRetries: 0,
      onError: workflowOnError,
      onAbort: workflowOnAbort,
    });

    const toolLoopResult = await toolLoopAgent.stream({
      prompt,
      abortSignal: toolLoopController.signal,
    });
    await toolLoopResult.consumeStream();
    await workflowAgent.stream({
      prompt,
      abortSignal: workflowController.signal,
    });

    expect(toolLoopOnError).not.toHaveBeenCalled();
    expect(workflowOnError).not.toHaveBeenCalled();
    expect(toolLoopOnAbort).toHaveBeenCalledTimes(1);
    expect(workflowOnAbort).toHaveBeenCalledTimes(1);
  });

  it('resolves a stream() abort with a custom reason like an abort without a reason', async () => {
    const controller = new AbortController();
    const reason = new Error('user cancelled');
    const onError = vi.fn();
    const onAbort = vi.fn();
    const onEnd = vi.fn();
    const agent = new WorkflowAgent({
      model: abortingModel(controller, reason),
    });

    const result = await agent.stream({
      prompt,
      abortSignal: controller.signal,
      onError,
      onAbort,
      onEnd,
    });

    const defaultController = new AbortController();
    const defaultOnAbort = vi.fn();
    const defaultResult = await new WorkflowAgent({
      model: abortingModel(defaultController),
    }).stream({
      prompt,
      abortSignal: defaultController.signal,
      onAbort: defaultOnAbort,
    });

    expect(result.steps).toEqual(defaultResult.steps);
    expect(onError).not.toHaveBeenCalled();
    expect(onAbort).toHaveBeenCalledTimes(1);
    expect(onAbort.mock.calls).toEqual(defaultOnAbort.mock.calls);
    expect(onEnd).not.toHaveBeenCalled();
  });
});
