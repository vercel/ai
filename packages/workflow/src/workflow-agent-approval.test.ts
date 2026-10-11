import type {
  LanguageModelV4GenerateResult,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider';
import { tool, type ModelMessage, type ToolSet } from 'ai';
import { verifyToolApprovalSignature } from 'ai/internal';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import { WorkflowAgent } from './workflow-agent.js';

type Mode = 'generate' | 'stream';
const secret = 'approval-test-secret';
const secretReference = {
  environmentVariable: 'WORKFLOW_TOOL_APPROVAL_SECRET',
};
const prompt: ModelMessage[] = [
  { role: 'user', content: 'Perform the action.' },
];
const approvalCall = {
  type: 'tool-call' as const,
  toolCallId: 'call-1',
  toolName: 'action',
  input: '{"value":"requested"}',
};
const usage = {
  inputTokens: {
    total: 2,
    noCache: 2,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

function model(
  first: LanguageModelV4GenerateResult['content'],
  lastContent: LanguageModelV4GenerateResult['content'] = [
    { type: 'text', text: 'Done' },
  ],
) {
  const responses: LanguageModelV4GenerateResult[] = [
    {
      content: first,
      finishReason: { unified: 'tool-calls', raw: undefined },
      usage,
      warnings: [],
    },
    {
      content: lastContent,
      finishReason: { unified: 'stop', raw: undefined },
      usage,
      warnings: [],
    },
  ];
  return new MockLanguageModelV4({
    doGenerate: responses,
    doStream: responses.map(response => {
      const parts: LanguageModelV4StreamPart[] = [
        { type: 'stream-start', warnings: [] },
      ];
      for (const part of response.content) {
        if (part.type === 'text')
          parts.push(
            { type: 'text-start', id: 'text' },
            { type: 'text-delta', id: 'text', delta: part.text },
            { type: 'text-end', id: 'text' },
          );
        else if (
          part.type === 'tool-call' ||
          part.type === 'tool-result' ||
          part.type === 'tool-approval-request'
        )
          parts.push(part);
      }
      parts.push({
        type: 'finish',
        finishReason: response.finishReason,
        usage,
      });
      return { stream: convertArrayToReadableStream(parts) };
    }),
  });
}

async function run(
  mode: Mode,
  agent: WorkflowAgent<ToolSet>,
  messages: ModelMessage[],
  chunks?: unknown[],
) {
  if (mode === 'generate') {
    const result = await agent.generate({ messages });
    return {
      messages: result.responseMessages,
      content: result.content,
      text: result.text,
      toolResults: result.toolResults,
    };
  }
  const result = await agent.stream({
    messages,
    ...(chunks == null
      ? {}
      : {
          writable: new WritableStream({
            write(chunk) {
              chunks.push(chunk);
            },
          }),
        }),
  });
  return {
    messages: result.steps.flatMap(step => step.response.messages),
    content: result.steps.flatMap(step => step.content),
    text: result.steps.at(-1)?.text,
    toolResults: result.steps.flatMap(step => step.toolResults),
  };
}
function approve(messages: ModelMessage[], approved: boolean): ModelMessage[] {
  return [
    ...prompt,
    ...messages,
    {
      role: 'tool',
      content: [
        {
          type: 'tool-approval-response',
          approvalId: 'approval-call-1',
          approved,
        },
      ],
    },
  ];
}

afterEach(() => vi.unstubAllEnvs());

describe.each<Mode>(['generate', 'stream'])(
  '%s transport-independent approvals',
  mode => {
    it.each([true, false])(
      'issues signed data and resumes without a writable (approved: %s)',
      async approved => {
        vi.stubEnv('WORKFLOW_TOOL_APPROVAL_SECRET', secret);
        const execute = vi.fn(async () => 'executed');
        const agent = new WorkflowAgent<ToolSet>({
          model: model([approvalCall]),
          tools: {
            action: tool({
              inputSchema: z.object({ value: z.string() }),
              needsApproval: true,
              execute,
            }),
          },
          experimental_toolApprovalSecret: secretReference,
        });
        const issued = await run(mode, agent, prompt);
        const request = issued.content.find(
          part => part.type === 'tool-approval-request',
        );
        expect(request).toMatchObject({
          approvalId: 'approval-call-1',
          signature: expect.any(String),
          toolCall: { toolCallId: 'call-1' },
        });
        expect(execute).not.toHaveBeenCalled();
        expect(JSON.stringify(issued)).not.toContain(secret);
        if (request?.type !== 'tool-approval-request')
          throw new Error('Missing approval');
        expect(
          await verifyToolApprovalSignature({
            secret,
            signature: request.signature!,
            approvalId: request.approvalId,
            toolCallId: 'call-1',
            toolName: 'action',
            input: { value: 'requested' },
          }),
        ).toBe(true);
        const resumed = await run(
          mode,
          agent,
          approve(issued.messages, approved),
        );
        expect(resumed.text).toBe('Done');
        expect(execute).toHaveBeenCalledTimes(approved ? 1 : 0);
        if (mode === 'generate')
          expect(resumed.messages[0]).toMatchObject({
            role: 'tool',
            content: [
              {
                output: approved
                  ? { type: 'text', value: 'executed' }
                  : { type: 'execution-denied' },
              },
            ],
          });
      },
    );

    it('rejects tampered approval input before executing the tool', async () => {
      vi.stubEnv('WORKFLOW_TOOL_APPROVAL_SECRET', secret);
      const execute = vi.fn(async () => 'executed');
      const agent = new WorkflowAgent<ToolSet>({
        model: model([approvalCall]),
        tools: {
          action: tool({
            inputSchema: z.object({ value: z.string() }),
            needsApproval: true,
            execute,
          }),
        },
        experimental_toolApprovalSecret: secretReference,
      });
      const issued = await run(mode, agent, prompt);
      const messages = approve(issued.messages, true);
      for (const message of messages) {
        if (message.role === 'assistant' && Array.isArray(message.content))
          for (const part of message.content)
            if (part.type === 'tool-call') part.input = { value: 'tampered' };
      }
      await run(mode, agent, messages);
      expect(execute).not.toHaveBeenCalled();
    });

    it.each(['schema', 'policy', 'removed'] as const)(
      'does not execute an approved tool after its %s changes',
      async change => {
        const execute = vi.fn(async () => 'executed');
        const m = model([approvalCall]);
        const original = tool({
          inputSchema: z.object({ value: z.string() }),
          needsApproval: true,
          execute,
        });
        const issued = await run(
          mode,
          new WorkflowAgent<ToolSet>({ model: m, tools: { action: original } }),
          prompt,
        );
        const changedTools: ToolSet =
          change === 'removed'
            ? {}
            : {
                action:
                  change === 'schema'
                    ? tool({
                        inputSchema: z.object({ value: z.number() }),
                        needsApproval: true,
                        execute,
                      })
                    : { ...original, needsApproval: false },
              };
        const resumed = run(
          mode,
          new WorkflowAgent<ToolSet>({ model: m, tools: changedTools }),
          approve(issued.messages, true),
        );
        if (change === 'removed')
          await expect(resumed).rejects.toThrow('Tool result is missing');
        else await resumed;
        expect(execute).not.toHaveBeenCalled();
      },
    );

    it('retains deferred provider results and local tool errors', async () => {
      const m = model(
        [
          {
            ...approvalCall,
            toolCallId: 'remote-call',
            toolName: 'remote',
            providerExecuted: true,
          },
          approvalCall,
        ],
        [
          {
            type: 'tool-result',
            toolCallId: 'remote-call',
            toolName: 'remote',
            result: { answer: 42 },
          },
          { type: 'text', text: 'Done' },
        ],
      );
      const agent = new WorkflowAgent<ToolSet>({
        model: m,
        tools: {
          remote: {
            type: 'provider',
            id: 'test.remote',
            args: {},
            inputSchema: z.object({ value: z.string() }),
            supportsDeferredResults: true,
            isProviderExecuted: true,
          },
          action: tool({
            inputSchema: z.object({ value: z.string() }),
            execute: async (): Promise<string> => {
              throw new Error('local failure');
            },
          }),
        },
      });
      const result = await run(mode, agent, prompt);
      expect(result.text).toBe('Done');
      expect(result.content).toContainEqual(
        expect.objectContaining({ type: 'tool-error', toolCallId: 'call-1' }),
      );
      expect(result.toolResults).toContainEqual(
        expect.objectContaining({
          toolCallId: 'remote-call',
          providerExecuted: true,
          output: { answer: 42 },
        }),
      );
    });

    it('retains executable siblings and unresolved client tools with approval data', async () => {
      const execute = vi.fn(async () => 'completed');
      const approvalExecute = vi.fn();
      const agent = new WorkflowAgent<ToolSet>({
        model: model([
          approvalCall,
          { ...approvalCall, toolName: 'sibling', toolCallId: 'sibling' },
          { ...approvalCall, toolName: 'client', toolCallId: 'client' },
        ]),
        tools: {
          action: tool({
            inputSchema: z.object({ value: z.string() }),
            needsApproval: true,
            execute: approvalExecute,
          }),
          sibling: tool({
            inputSchema: z.object({ value: z.string() }),
            execute,
          }),
          client: tool({ inputSchema: z.object({ value: z.string() }) }),
        },
      });
      const chunks: unknown[] = [];
      const issued = await run(mode, agent, prompt, chunks);
      expect(execute).toHaveBeenCalledOnce();
      expect(approvalExecute).not.toHaveBeenCalled();
      expect(issued.toolResults).toMatchObject([
        { toolCallId: 'sibling', output: 'completed' },
      ]);
      expect(
        issued.content.filter(part => part.type === 'tool-call'),
      ).toHaveLength(3);
      expect(issued.messages[0]).toMatchObject({
        role: 'assistant',
        content: expect.arrayContaining([
          {
            type: 'tool-approval-request',
            approvalId: 'approval-call-1',
            toolCallId: 'call-1',
          },
        ]),
      });
      if (mode === 'stream') {
        const types = chunks.map(chunk => (chunk as { type: string }).type);
        expect(types.indexOf('tool-result')).toBeLessThan(
          types.indexOf('tool-approval-request'),
        );
        expect(types.at(-1)).toBe('finish');
      }
    });

    it.each([true, false])(
      'forwards provider approval responses without local execution (%s)',
      async approved => {
        const execute = vi.fn();
        const m = model([
          { ...approvalCall, providerExecuted: true },
          {
            type: 'tool-approval-request',
            approvalId: 'provider-approval',
            toolCallId: 'call-1',
          },
        ]);
        const agent = new WorkflowAgent<ToolSet>({
          model: m,
          tools: {
            action: tool({
              inputSchema: z.object({ value: z.string() }),
              execute,
            }),
          },
        });
        const issued = await run(mode, agent, prompt);
        expect(issued.content).toContainEqual(
          expect.objectContaining({
            type: 'tool-approval-request',
            approvalId: 'provider-approval',
          }),
        );
        await run(mode, agent, [
          ...prompt,
          ...issued.messages,
          {
            role: 'tool',
            content: [
              {
                type: 'tool-approval-response',
                approvalId: 'provider-approval',
                approved,
              },
            ],
          },
        ]);
        expect(execute).not.toHaveBeenCalled();
        const calls = mode === 'generate' ? m.doGenerateCalls : m.doStreamCalls;
        expect(JSON.stringify(calls[1].prompt)).toContain('provider-approval');
        expect(calls[1].prompt).toContainEqual(
          expect.objectContaining({
            role: 'tool',
            content: expect.arrayContaining([
              expect.objectContaining({
                type: 'tool-approval-response',
                approvalId: 'provider-approval',
                approved,
              }),
            ]),
          }),
        );
      },
    );
  },
);
