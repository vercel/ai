import { ToolMessage } from '@langchain/core/messages';
import { describe, expect, it } from 'vitest';
import { createMcpToolErrorMiddleware } from './mcp-tool-errors';

describe('createMcpToolErrorMiddleware', () => {
  const exception = () =>
    Object.assign(new Error('native MCP failure'), { name: 'ToolException' });
  const middleware = (controller: AbortController) =>
    createMcpToolErrorMiddleware({
      mcpToolNames: () => new Set(['mcp__fixture__fail']),
      abortSignal: () => controller.signal,
    });
  const request = (name = 'mcp__fixture__fail', id = 'native-call') => ({
    toolCall: { name, id, args: {} },
  });

  it('returns an error ToolMessage with the native id so the agent can continue', async () => {
    const wrap = middleware(new AbortController()).wrapToolCall!;
    const result = await wrap(request() as never, async () => {
      throw exception();
    });

    expect(result).toBeInstanceOf(ToolMessage);
    expect(result).toMatchObject({
      status: 'error',
      tool_call_id: 'native-call',
      content: 'native MCP failure',
    });
  });

  it('preserves successful output and refuses non-MCP, ordinary-error and idless recovery', async () => {
    const wrap = middleware(new AbortController()).wrapToolCall!;
    const success = new ToolMessage({
      content: 'ok',
      tool_call_id: 'native-call',
    });

    expect(await wrap(request() as never, async () => success)).toBe(success);

    for (const input of [request('host'), request('mcp__fixture__fail', '')]) {
      const error = exception();
      await expect(
        wrap(input as never, async () => {
          throw error;
        }),
      ).rejects.toBe(error);
    }

    const error = new Error('ordinary failure');
    await expect(
      wrap(request() as never, async () => {
        throw error;
      }),
    ).rejects.toBe(error);
  });

  it('does not invoke an already-aborted handler or recover a cancellation during execution', async () => {
    const controller = new AbortController();
    const wrap = middleware(controller).wrapToolCall!;
    let called = false;
    controller.abort();

    await expect(
      wrap(request() as never, async () => {
        called = true;
        throw exception();
      }),
    ).rejects.toBe(controller.signal.reason);
    expect(called).toBe(false);

    const during = new AbortController();
    const error = exception();
    await expect(
      middleware(during).wrapToolCall!(request() as never, async () => {
        during.abort();
        throw error;
      }),
    ).rejects.toBe(error);
  });
});
