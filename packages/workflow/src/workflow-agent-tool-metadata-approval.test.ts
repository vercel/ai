import type {
  JSONObject,
  LanguageModelV4GenerateResult,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider';
import {
  dynamicTool,
  jsonSchema,
  tool,
  type ModelMessage,
  type StepResult,
  type ToolSet,
} from 'ai';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';
import { WorkflowAgent } from './workflow-agent.js';

type Mode = 'generate' | 'stream';

const prompt: ModelMessage[] = [
  { role: 'user', content: 'Delete the records.' },
];

const usage = {
  inputTokens: {
    total: 2,
    noCache: 2,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

const recordsSchema = jsonSchema<{ table?: string }>({
  type: 'object',
  properties: { table: { type: 'string' } },
});

/**
 * A dynamic tool with a `jsonSchema()` input schema has no runtime validator,
 * which is the shape `@ai-sdk/mcp` produces for tools with automatic schemas.
 */
function dynamicDeleteRecords(execute: () => Promise<string>) {
  return dynamicTool({
    description: 'Delete records. Admin only.',
    title: 'Delete records',
    metadata: { requiresAdmin: true },
    inputSchema: recordsSchema,
    execute,
  });
}

function staticDeleteRecords(
  execute: () => Promise<string>,
  metadata: JSONObject = { requiresAdmin: true },
) {
  return tool({
    description: 'Delete records. Admin only.',
    title: 'Delete records',
    metadata,
    inputSchema: recordsSchema,
    execute,
  });
}

function toolCallResponse(
  input = '{"table":"users"}',
): LanguageModelV4GenerateResult {
  return {
    content: [
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'deleteRecords',
        input,
      },
    ],
    finishReason: { unified: 'tool-calls', raw: 'tool-calls' },
    usage,
    warnings: [],
  };
}

function textResponse(text: string): LanguageModelV4GenerateResult {
  return {
    content: [{ type: 'text', text }],
    finishReason: { unified: 'stop', raw: 'stop' },
    usage,
    warnings: [],
  };
}

type AgentRun = {
  steps: Array<StepResult<ToolSet>>;
  messages: Array<ModelMessage>;
};

async function runAgent(
  mode: Mode,
  agent: WorkflowAgent<ToolSet>,
  messages: ModelMessage[],
): Promise<AgentRun> {
  if (mode === 'generate') {
    const result = await agent.generate({ messages });
    return { steps: result.steps, messages: result.responseMessages };
  }
  const result = await agent.stream({ messages });
  return {
    steps: result.steps,
    messages: result.steps.flatMap(step => step.response.messages),
  };
}

type ObservedToolCall = {
  toolMetadata: unknown;
  dynamic: unknown;
  title: unknown;
  input: unknown;
};

/**
 * Captures exactly what an approval policy can read from the tool call.
 * `toolMetadata`, `dynamic`, and `title` come from the server-side tool
 * definition, not from the model.
 */
function observe(toolCall: {
  toolMetadata?: JSONObject;
  dynamic?: boolean;
  title?: string;
  input: unknown;
}): ObservedToolCall {
  return {
    toolMetadata: toolCall.toolMetadata,
    dynamic: toolCall.dynamic,
    title: toolCall.title,
    input: toolCall.input,
  };
}

function approvalRequests(steps: Array<StepResult<ToolSet>>) {
  return steps
    .flatMap(step => step.content)
    .filter(part => part.type === 'tool-approval-request') as Array<{
    type: 'tool-approval-request';
    approvalId: string;
    toolCall: { toolCallId: string };
  }>;
}

function approvalIdOf(steps: Array<StepResult<ToolSet>>): string {
  const request = approvalRequests(steps)[0];
  if (request == null) {
    throw new Error('Missing tool approval request');
  }
  return request.approvalId;
}

function approvalResponse(approvalId: string, approved: boolean): ModelMessage {
  return {
    role: 'tool',
    content: [{ type: 'tool-approval-response', approvalId, approved }],
  };
}

const serverDefinedFields = {
  toolMetadata: { requiresAdmin: true },
  dynamic: true,
  title: 'Delete records',
  input: { table: 'users' },
};

describe.each<Mode>(['generate', 'stream'])(
  '%s toolApproval policies receive the server-defined tool fields',
  mode => {
    it.each(['denied', 'user-approval'] as const)(
      'does not run a protected dynamic tool that the policy marks as %s',
      async status => {
        const execute = vi.fn(async () => 'deleted');
        const seen: ObservedToolCall[] = [];
        const agent = new WorkflowAgent<ToolSet>({
          model: createAgentModel([toolCallResponse(), textResponse('Done')]),
          tools: { deleteRecords: dynamicDeleteRecords(execute) },
          toolApproval: ({ toolCall }) => {
            seen.push(observe(toolCall));
            if (toolCall.toolMetadata?.requiresAdmin === true) {
              return status === 'denied'
                ? { type: 'denied', reason: 'admin-only tool' }
                : { type: 'user-approval', reason: 'admin-only tool' };
            }
            return 'not-applicable';
          },
        });

        const run = await runAgent(mode, agent, prompt);

        expect(execute).not.toHaveBeenCalled();
        expect(seen).toEqual([serverDefinedFields]);
        expect(approvalRequests(run.steps)).toMatchObject([
          { toolCall: { toolCallId: 'call-1' } },
        ]);
      },
    );

    it('passes the server-defined fields and the refined input to the policy', async () => {
      const execute = vi.fn(async () => 'deleted');
      const seen: ObservedToolCall[] = [];
      const agent = new WorkflowAgent<ToolSet>({
        model: createAgentModel([toolCallResponse(), textResponse('Done')]),
        tools: { deleteRecords: dynamicDeleteRecords(execute) },
        experimental_refineToolInput: {
          deleteRecords: (input: { table?: string }) => ({
            ...input,
            dryRun: true,
          }),
        },
        toolApproval: ({ toolCall }) => {
          seen.push(observe(toolCall));
          return 'not-applicable';
        },
      });

      await runAgent(mode, agent, prompt);

      expect(seen).toEqual([
        { ...serverDefinedFields, input: { table: 'users', dryRun: true } },
      ]);
      expect(execute).toHaveBeenCalledOnce();
      expect(execute).toHaveBeenCalledWith(
        { table: 'users', dryRun: true },
        expect.anything(),
      );
    });

    it('passes the server-defined fields for a static tool without a runtime validator', async () => {
      const execute = vi.fn(async () => 'deleted');
      const seen: ObservedToolCall[] = [];
      const agent = new WorkflowAgent<ToolSet>({
        model: createAgentModel([toolCallResponse(), textResponse('Done')]),
        tools: { deleteRecords: staticDeleteRecords(execute) },
        toolApproval: ({ toolCall }) => {
          seen.push(observe(toolCall));
          return 'not-applicable';
        },
      });

      await runAgent(mode, agent, prompt);

      expect(seen).toEqual([{ ...serverDefinedFields, dynamic: undefined }]);
      expect(execute).toHaveBeenCalledOnce();
    });
  },
);

describe('resumed approvals receive the server-defined tool fields', () => {
  it('runs an approved dynamic call that the policy still requires approval for', async () => {
    const execute = vi.fn(async () => 'deleted');
    const tools: ToolSet = { deleteRecords: dynamicDeleteRecords(execute) };
    const issued = await new WorkflowAgent<ToolSet>({
      model: createAgentModel([toolCallResponse()]),
      tools,
      toolApproval: ({ toolCall }) =>
        toolCall.dynamic === true ? 'user-approval' : 'not-applicable',
    }).generate({ messages: prompt });

    expect(execute).not.toHaveBeenCalled();
    const approvalId = approvalIdOf(issued.steps);

    const seen: ObservedToolCall[] = [];
    const resumed = await new WorkflowAgent<ToolSet>({
      model: createAgentModel([textResponse('Done')]),
      tools,
      toolApproval: ({ toolCall }) => {
        seen.push(observe(toolCall));
        return toolCall.dynamic === true ? 'user-approval' : 'not-applicable';
      },
    }).generate({
      messages: [
        ...prompt,
        ...issued.responseMessages,
        approvalResponse(approvalId, true),
      ],
    });

    expect(seen.length).toBeGreaterThan(0);
    for (const toolCall of seen) {
      expect(toolCall).toEqual(serverDefinedFields);
    }
    expect(execute).toHaveBeenCalledOnce();
    expect(JSON.stringify(resumed.responseMessages)).toContain('"deleted"');
  });

  it('does not run an approved call that the policy reports as not needing approval', async () => {
    const execute = vi.fn(async () => 'deleted');
    const tools: ToolSet = {
      deleteRecords: staticDeleteRecords(execute, { readOnlyHint: true }),
    };
    const issued = await new WorkflowAgent<ToolSet>({
      model: createAgentModel([toolCallResponse()]),
      tools,
      toolApproval: () => 'user-approval',
    }).generate({ messages: prompt });

    expect(execute).not.toHaveBeenCalled();
    const approvalId = approvalIdOf(issued.steps);

    const resumed = await new WorkflowAgent<ToolSet>({
      model: createAgentModel([textResponse('Done')]),
      tools,
      toolApproval: ({ toolCall }) =>
        toolCall.toolMetadata?.readOnlyHint === true
          ? 'not-applicable'
          : 'user-approval',
    }).generate({
      messages: [
        ...prompt,
        ...issued.responseMessages,
        approvalResponse(approvalId, true),
      ],
    });

    expect(execute).not.toHaveBeenCalled();
    const toolResults = resumed.responseMessages
      .filter(message => message.role === 'tool')
      .flatMap(message =>
        Array.isArray(message.content) ? message.content : [],
      )
      .filter(part => part.type === 'tool-result');
    expect(toolResults).toMatchObject([
      {
        toolCallId: 'call-1',
        output: {
          type: 'error-text',
          value: expect.stringContaining('does not require approval'),
        },
      },
    ]);
  });
});

/**
 * The same scripted responses for `generate()` and `stream()`. Deliberately
 * supports only the content used by these fixtures.
 */
function createAgentModel(responses: LanguageModelV4GenerateResult[]) {
  return new MockLanguageModelV4({
    doGenerate: responses,
    doStream: responses.map(response => {
      const parts: LanguageModelV4StreamPart[] = [
        { type: 'stream-start', warnings: response.warnings },
      ];

      for (const part of response.content) {
        switch (part.type) {
          case 'text': {
            parts.push(
              { type: 'text-start', id: 'text' },
              { type: 'text-delta', id: 'text', delta: part.text },
              { type: 'text-end', id: 'text' },
            );
            break;
          }
          case 'tool-call':
            parts.push(part);
            break;
          default:
            throw new Error(`Unsupported fixture content: ${part.type}`);
        }
      }

      parts.push({
        type: 'finish',
        finishReason: response.finishReason,
        usage: response.usage,
      });

      return { stream: convertArrayToReadableStream(parts) };
    }),
  });
}
