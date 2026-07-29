import { tool } from 'ai';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  type CodeModeFetchRequestEvent,
  type CodeModeFetchResultEvent,
  type CodeModeNestedToolCallEvent,
  type CodeModeNestedToolResultEvent,
  type CodeModeTrace,
  experimental_createCodeModeTool as createCodeModeTool,
  experimental_isCodeModeApprovalInterrupt as isCodeModeApprovalInterrupt,
  experimental_runCodeMode as runCodeMode,
  experimental_setMaxWorkers as setMaxWorkers,
} from '../dist/index.js';
import { deferred, delay, emptyMessages } from './helpers.js';

setMaxWorkers(32);

class MockSpan {
  readonly name: string;
  readonly attributes: Record<string, unknown>;
  readonly events: Array<{
    name: string;
    attributes: Record<string, unknown>;
  }> = [];
  readonly exceptions: unknown[] = [];
  status: unknown;
  ended = false;

  constructor(name: string, attributes: Record<string, unknown> = {}) {
    this.name = name;
    this.attributes = { ...attributes };
  }

  setAttribute(key: string, value: unknown): void {
    this.attributes[key] = value;
  }

  setAttributes(attributes: Record<string, unknown>): void {
    Object.assign(this.attributes, attributes);
  }

  addEvent(name: string, attributes: Record<string, unknown> = {}): void {
    this.events.push({ name, attributes });
  }

  recordException(exception: unknown): void {
    this.exceptions.push(exception);
  }

  setStatus(status: unknown): void {
    this.status = status;
  }

  end(): void {
    this.ended = true;
  }
}

class MockTracer {
  readonly spans: MockSpan[] = [];

  startSpan(
    name: string,
    options: { attributes?: Record<string, unknown> } = {},
  ): MockSpan {
    const span = new MockSpan(name, options.attributes);
    this.spans.push(span);
    return span;
  }
}

describe('observability', () => {
  it('emits lifecycle events and a completed trace for nested tools and fetch', async () => {
    const toolCalls: CodeModeNestedToolCallEvent[] = [];
    const toolResults: CodeModeNestedToolResultEvent[] = [];
    const fetchRequests: CodeModeFetchRequestEvent[] = [];
    const fetchResults: CodeModeFetchResultEvent[] = [];
    const traces: CodeModeTrace[] = [];
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ label: 'fetched' }), {
        headers: { 'content-type': 'application/json' },
      });
    });

    await expect(
      runCodeMode({
        js: `
          const nested = await tools.lookup({ id: "item-1" });
          const response = await fetch("https://api.example.test/items/item-1");
          const fetched = await response.json();
          return { nested, fetched };
        `,
        tools: {
          lookup: tool({
            inputSchema: z.object({ id: z.string() }),
            execute: async ({ id }) => ({ id, label: 'tool result' }),
          }),
        },
        toolExecutionOptions: {
          toolCallId: 'outer',
          messages: emptyMessages,
        },
        options: {
          fetchPolicy: {
            fetch: fetchMock,
            allowedOrigins: ['https://api.example.test'],
          },
          lifecycle: {
            onNestedToolCall: event => {
              toolCalls.push(event);
            },
            onNestedToolResult: event => {
              toolResults.push(event);
            },
            onFetchRequest: event => {
              fetchRequests.push(event);
            },
            onFetchResult: event => {
              fetchResults.push(event);
            },
            onTrace: trace => {
              traces.push(trace);
            },
          },
        },
      }),
    ).resolves.toEqual({
      nested: { id: 'item-1', label: 'tool result' },
      fetched: { label: 'fetched' },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(toolCalls).toEqual([
      {
        invocationId: expect.any(String),
        outerToolCallId: 'outer',
        bridgeIndex: 1,
        toolName: 'lookup',
        input: { id: 'item-1' },
        inputBytes: 15,
        toolCallId: 'outer:tool-1',
        replayed: false,
        startedAtMs: expect.any(Number),
      },
    ]);
    expect(toolResults).toEqual([
      {
        ...toolCalls[0],
        status: 'fulfilled',
        completedAtMs: expect.any(Number),
        durationMs: expect.any(Number),
        outputBytes: expect.any(Number),
        output: { id: 'item-1', label: 'tool result' },
      },
    ]);
    expect(fetchRequests).toEqual([
      {
        invocationId: expect.any(String),
        outerToolCallId: 'outer',
        bridgeIndex: 2,
        url: 'https://api.example.test/items/item-1',
        method: 'GET',
        inputBytes: expect.any(Number),
        replayed: false,
        startedAtMs: expect.any(Number),
      },
    ]);
    expect(fetchResults).toEqual([
      {
        ...fetchRequests[0],
        status: 'fulfilled',
        completedAtMs: expect.any(Number),
        durationMs: expect.any(Number),
        outputBytes: expect.any(Number),
      },
    ]);
    expect(traces).toEqual([
      {
        invocationId: expect.any(String),
        outerToolCallId: 'outer',
        status: 'completed',
        startedAtMs: expect.any(Number),
        completedAtMs: expect.any(Number),
        durationMs: expect.any(Number),
        bridgeRequests: [
          {
            kind: 'tool',
            bridgeIndex: 1,
            toolName: 'lookup',
            toolCallId: 'outer:tool-1',
            status: 'fulfilled',
            replayed: false,
            startedAtMs: expect.any(Number),
            completedAtMs: expect.any(Number),
            durationMs: expect.any(Number),
            inputBytes: 15,
            outputBytes: expect.any(Number),
          },
          {
            kind: 'fetch',
            bridgeIndex: 2,
            url: 'https://api.example.test/items/item-1',
            method: 'GET',
            status: 'fulfilled',
            replayed: false,
            startedAtMs: expect.any(Number),
            completedAtMs: expect.any(Number),
            durationMs: expect.any(Number),
            inputBytes: expect.any(Number),
            outputBytes: expect.any(Number),
          },
        ],
      },
    ]);
  });

  it('emits OpenTelemetry-compatible spans when telemetry is enabled', async () => {
    const tracer = new MockTracer();

    await expect(
      runCodeMode({
        js: "return await tools.echo({ value: 'hello' });",
        tools: {
          echo: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async ({ value }) => ({ value }),
          }),
        },
        toolExecutionOptions: {
          toolCallId: 'outer',
          messages: emptyMessages,
        },
        options: {
          telemetry: {
            isEnabled: true,
            tracer: tracer as never,
            functionId: 'code-mode-test',
            metadata: { suite: 'observability' },
          },
        },
      }),
    ).resolves.toEqual({ value: 'hello' });

    expect(tracer.spans.map(span => span.name)).toEqual([
      'ai.code_mode.execute',
      'ai.code_mode.nested_tool',
    ]);
    expect(tracer.spans[0]).toEqual(
      expect.objectContaining({
        ended: true,
        attributes: expect.objectContaining({
          'ai.telemetry.functionId': 'code-mode-test',
          'ai.telemetry.metadata.suite': 'observability',
          'code_mode.outer_tool_call.id': 'outer',
          'code_mode.status': 'completed',
          'code_mode.bridge_requests.count': 1,
        }),
        events: [
          {
            name: 'code_mode.nested_tool.result',
            attributes: {
              'code_mode.bridge.index': 1,
              'code_mode.tool.name': 'echo',
              'code_mode.tool_call.id': 'outer:tool-1',
              'code_mode.status': 'fulfilled',
              'code_mode.replayed': false,
              'code_mode.tool.output.bytes': expect.any(Number),
            },
          },
        ],
      }),
    );
    expect(tracer.spans[1]).toEqual(
      expect.objectContaining({
        ended: true,
        attributes: expect.objectContaining({
          'code_mode.bridge.index': 1,
          'code_mode.tool.name': 'echo',
          'code_mode.tool_call.id': 'outer:tool-1',
          'code_mode.replayed': false,
          'code_mode.tool.input.bytes': 17,
        }),
        events: [],
      }),
    );
  });

  it('sanitizes tool errors for the sandbox while preserving diagnostics in traces', async () => {
    const traces: CodeModeTrace[] = [];

    await expect(
      runCodeMode({
        js: `
          try {
            await tools.fail({ id: "item-1" });
          } catch (error) {
            return {
              name: error.name,
              message: error.message,
              code: error.code,
              hasDetails: "details" in error,
              detailsType: typeof error.details,
              stackContainsSecret: String(error.stack).includes("secret-token"),
            };
          }
        `,
        tools: {
          fail: tool({
            inputSchema: z.object({ id: z.string() }),
            execute: async (): Promise<unknown> => {
              const error = new Error(
                'tool failed with useful details secret-token',
              ) as Error & {
                code: string;
                details: unknown;
              };
              error.code = 'TOOL_FAILED';
              error.details = { token: 'secret-token' };
              throw error;
            },
          }),
        },
        options: {
          lifecycle: {
            onTrace: trace => {
              traces.push(trace);
            },
          },
        },
      }),
    ).resolves.toEqual({
      name: 'Error',
      message: 'Host tool failed.',
      code: 'CODE_MODE_HOST_TOOL_ERROR',
      hasDetails: false,
      detailsType: 'undefined',
      stackContainsSecret: false,
    });

    expect(traces).toHaveLength(1);
    expect(traces[0]?.bridgeRequests[0]).toEqual(
      expect.objectContaining({
        kind: 'tool',
        status: 'rejected',
        error: expect.objectContaining({
          name: 'Error',
          message: 'tool failed with useful details secret-token',
          code: 'TOOL_FAILED',
          details: { token: 'secret-token' },
        }),
      }),
    );
  });

  it('preserves serialized fetch errors in traces', async () => {
    const traces: CodeModeTrace[] = [];
    const fetchMock = vi.fn(async () => new Response('should not run'));

    await expect(
      runCodeMode({
        js: `
          try {
            await fetch("https://blocked.example.test/data");
          } catch (error) {
            return { name: error.name, message: error.message, code: error.code };
          }
        `,
        tools: {},
        options: {
          fetchPolicy: {
            fetch: fetchMock,
            allowedOrigins: ['https://api.example.test'],
          },
          lifecycle: {
            onTrace: trace => {
              traces.push(trace);
            },
          },
        },
      }),
    ).resolves.toEqual({
      name: 'CodeModeFetchError',
      message: 'fetch URL is not allowed: https://blocked.example.test/data',
      code: 'CODE_MODE_FETCH_ERROR',
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(traces).toHaveLength(1);
    expect(traces[0]?.bridgeRequests[0]).toEqual(
      expect.objectContaining({
        kind: 'fetch',
        status: 'rejected',
        error: expect.objectContaining({
          name: 'CodeModeFetchError',
          message:
            'fetch URL is not allowed: https://blocked.example.test/data',
          code: 'CODE_MODE_FETCH_ERROR',
        }),
      }),
    );
  });

  it('sanitizes fetch implementation errors for the sandbox', async () => {
    const traces: CodeModeTrace[] = [];
    const fetchError = new Error('fetch leaked secret-token') as Error & {
      details: unknown;
    };
    fetchError.details = { token: 'secret-token' };

    await expect(
      runCodeMode({
        js: `
          try {
            await fetch("https://api.example.test/private");
          } catch (error) {
            return {
              name: error.name,
              message: error.message,
              code: error.code,
              hasDetails: "details" in error,
            };
          }
        `,
        tools: {},
        options: {
          fetchPolicy: {
            fetch: async () => {
              throw fetchError;
            },
            allowedOrigins: ['https://api.example.test'],
          },
          lifecycle: {
            onTrace: trace => {
              traces.push(trace);
            },
          },
        },
      }),
    ).resolves.toEqual({
      name: 'Error',
      message: 'Host fetch failed.',
      code: 'CODE_MODE_HOST_FETCH_ERROR',
      hasDetails: false,
    });

    expect(traces[0]?.bridgeRequests[0]).toEqual(
      expect.objectContaining({
        kind: 'fetch',
        status: 'rejected',
        error: expect.objectContaining({
          message: 'fetch leaked secret-token',
          details: { token: 'secret-token' },
        }),
      }),
    );
  });

  it('awaits async trace hooks before settling the invocation', async () => {
    const traceStarted = deferred<void>();
    const releaseTrace = deferred<void>();
    let traceFinished = false;
    let settled = false;

    const run = runCodeMode({
      js: "return 'done';",
      tools: {},
      options: {
        lifecycle: {
          onTrace: async () => {
            traceStarted.resolve();
            await releaseTrace.promise;
            traceFinished = true;
          },
        },
      },
    });
    void run.finally(() => {
      settled = true;
    });

    await traceStarted.promise;
    await delay(20);
    expect(settled).toBe(false);

    releaseTrace.resolve();
    await expect(run).resolves.toBe('done');
    expect(traceFinished).toBe(true);
    expect(settled).toBe(true);
  });

  it('can expose a compact nested bridge summary through toModelOutput', async () => {
    const codeMode = createCodeModeTool(
      {
        getUser: tool({
          inputSchema: z.object({ id: z.string() }),
          execute: async ({ id }) => ({ id, name: 'Ada', email: 'ada@test' }),
        }),
      },
      {
        fetchPolicy: {
          fetch: async () => new Response('active'),
          allowedOrigins: ['https://api.example.test'],
        },
        modelOutput: {
          includeNestedToolSummary: true,
          includeFetchSummary: true,
        },
      },
    );

    const input = {
      js: `
          const user = await tools.getUser({ id: "user-1" });
          const response = await fetch("https://api.example.test/status");
          return { user: { id: user.id, name: user.name }, status: await response.text() };
        `,
    };
    const output = await codeMode.execute?.(input, {
      toolCallId: 'outer',
      messages: emptyMessages,
      context: {},
    });

    expect(output).toEqual({
      user: { id: 'user-1', name: 'Ada' },
      status: 'active',
    });
    expect(
      await (codeMode as any).toModelOutput({
        toolCallId: 'outer',
        input,
        output,
      }),
    ).toEqual({
      type: 'json',
      value: {
        result: {
          user: { id: 'user-1', name: 'Ada' },
          status: 'active',
        },
        nestedTools: [
          {
            kind: 'tool',
            toolName: 'getUser',
            toolCallId: 'outer:tool-1',
            status: 'fulfilled',
            replayed: false,
          },
          {
            kind: 'fetch',
            url: 'https://api.example.test/status',
            method: 'GET',
            status: 'fulfilled',
            replayed: false,
          },
        ],
      },
    });
  });

  it('can include nested tool model outputs using tool toModelOutput', async () => {
    const codeMode = createCodeModeTool(
      {
        getUser: tool({
          inputSchema: z.object({ id: z.string() }),
          execute: async ({ id }) => ({
            id,
            name: 'Ada',
            email: 'ada@test',
          }),
          toModelOutput: async ({ output }) => ({
            type: 'json',
            value: {
              name: output.name,
              omitted: undefined,
            },
          }),
        }),
      },
      {
        modelOutput: {
          includeNestedToolOutputs: true,
        },
      },
    );

    const input = {
      js: `
        const user = await tools.getUser({ id: "user-1" });
        return { user };
      `,
    };
    const output = await codeMode.execute?.(input, {
      toolCallId: 'outer',
      messages: emptyMessages,
      context: {},
    });

    expect(output).toEqual({
      user: { id: 'user-1', name: 'Ada', email: 'ada@test' },
    });
    expect(
      await (codeMode as any).toModelOutput({
        toolCallId: 'outer',
        input,
        output,
      }),
    ).toEqual({
      type: 'json',
      value: {
        result: {
          user: { id: 'user-1', name: 'Ada', email: 'ada@test' },
        },
        nestedTools: [
          {
            kind: 'tool',
            toolName: 'getUser',
            toolCallId: 'outer:tool-1',
            status: 'fulfilled',
            replayed: false,
            output: {
              type: 'json',
              value: { name: 'Ada' },
            },
          },
        ],
      },
    });
  });

  it('discards captured model output data when execution throws', async () => {
    const codeMode = createCodeModeTool(
      {
        getUser: tool({
          inputSchema: z.object({}),
          execute: async () => ({ name: 'Ada' }),
        }),
      },
      {
        modelOutput: {
          includeNestedToolOutputs: true,
        },
      },
    );
    const input = {
      js: `
        await tools.getUser({});
        throw new Error("execution failed");
      `,
    };

    await expect(
      codeMode.execute?.(input, {
        toolCallId: 'outer',
        messages: emptyMessages,
        context: {},
      }),
    ).rejects.toThrow('execution failed');

    await expect(
      (codeMode as any).toModelOutput({
        toolCallId: 'outer',
        input,
        output: null,
      }),
    ).resolves.toEqual({
      type: 'json',
      value: {
        result: null,
        nestedTools: [],
      },
    });
  });

  it('uses AI SDK default model output mapping for nested tools without toModelOutput', async () => {
    const codeMode = createCodeModeTool(
      {
        label: tool({
          inputSchema: z.object({}),
          execute: async () => 'ready',
        }),
      },
      {
        modelOutput: {
          includeNestedToolOutputs: true,
        },
      },
    );

    const input = { js: 'return await tools.label({});' };
    const output = await codeMode.execute?.(input, {
      toolCallId: 'outer',
      messages: emptyMessages,
      context: {},
    });

    expect(
      await (codeMode as any).toModelOutput({
        toolCallId: 'outer',
        input,
        output,
      }),
    ).toEqual({
      type: 'json',
      value: {
        result: 'ready',
        nestedTools: [
          {
            kind: 'tool',
            toolName: 'label',
            toolCallId: 'outer:tool-1',
            status: 'fulfilled',
            replayed: false,
            output: { type: 'text', value: 'ready' },
          },
        ],
      },
    });
  });

  it('rejects nested tool model outputs that cannot be JSON stringified', async () => {
    const codeMode = createCodeModeTool(
      {
        bad: tool({
          inputSchema: z.object({}),
          execute: async () => ({ ok: true }),
          toModelOutput: () => ({
            type: 'json',
            // Intentionally bypass the JSON value type to exercise runtime
            // validation of a non-serializable BigInt.
            value: 1n as unknown as string,
          }),
        }),
      },
      {
        modelOutput: {
          includeNestedToolOutputs: true,
        },
      },
    );

    const input = { js: 'return await tools.bad({});' };
    const output = await codeMode.execute?.(input, {
      toolCallId: 'outer',
      messages: emptyMessages,
      context: {},
    });

    await expect(
      (codeMode as any).toModelOutput({
        toolCallId: 'outer',
        input,
        output,
      }),
    ).rejects.toThrow(/JSON-serializable|BigInt/i);
  });

  it('does not mix model-visible summaries across reused tool call ids', async () => {
    const codeMode = createCodeModeTool(
      {
        alpha: tool({
          inputSchema: z.object({}),
          execute: async () => ({ source: 'alpha' }),
        }),
        beta: tool({
          inputSchema: z.object({}),
          execute: async () => ({ source: 'beta' }),
        }),
      },
      {
        modelOutput: {
          includeNestedToolSummary: true,
        },
      },
    );
    const alphaInput = { js: 'return await tools.alpha({});' };
    const betaInput = { js: 'return await tools.beta({});' };

    const [alphaOutput, betaOutput] = await Promise.all([
      codeMode.execute?.(alphaInput, {
        toolCallId: 'reused',
        messages: emptyMessages,
        context: {},
      }),
      codeMode.execute?.(betaInput, {
        toolCallId: 'reused',
        messages: emptyMessages,
        context: {},
      }),
    ]);

    expect(
      await (codeMode as any).toModelOutput({
        toolCallId: 'reused',
        input: alphaInput,
        output: alphaOutput,
      }),
    ).toEqual({
      type: 'json',
      value: {
        result: { source: 'alpha' },
        nestedTools: [
          {
            kind: 'tool',
            toolName: 'alpha',
            toolCallId: 'reused:tool-1',
            status: 'fulfilled',
            replayed: false,
          },
        ],
      },
    });
    expect(
      await (codeMode as any).toModelOutput({
        toolCallId: 'reused',
        input: betaInput,
        output: betaOutput,
      }),
    ).toEqual({
      type: 'json',
      value: {
        result: { source: 'beta' },
        nestedTools: [
          {
            kind: 'tool',
            toolName: 'beta',
            toolCallId: 'reused:tool-1',
            status: 'fulfilled',
            replayed: false,
          },
        ],
      },
    });
  });

  it('does not wrap approval interrupts in the model-visible bridge summary', async () => {
    const codeMode = createCodeModeTool(
      {
        sensitive: tool({
          inputSchema: z.object({ id: z.string() }),
          needsApproval: true,
          execute: async ({ id }) => ({ id }),
        }),
      },
      {
        approval: { mode: 'interrupt' },
        modelOutput: { includeNestedToolSummary: true },
      },
    );

    const input = { js: 'return await tools.sensitive({ id: "secret" });' };
    const output = await codeMode.execute?.(input, {
      toolCallId: 'outer',
      messages: emptyMessages,
      context: {},
    });

    expect(isCodeModeApprovalInterrupt(output)).toBe(true);
    expect(
      await (codeMode as any).toModelOutput({
        toolCallId: 'outer',
        input,
        output,
      }),
    ).toEqual({
      type: 'json',
      value: output,
    });
    expect(
      await (codeMode as any).toModelOutput({
        toolCallId: 'outer',
        input,
        output: { done: true },
      }),
    ).toEqual({
      type: 'json',
      value: {
        result: { done: true },
        nestedTools: [],
      },
    });
  });
});
