import type {
  LanguageModelV4GenerateResult,
  LanguageModelV4Prompt,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider';
import { ToolLoopAgent, jsonSchema, tool, type ModelMessage } from 'ai';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import { WorkflowAgent } from './workflow-agent.js';

const prompt = 'What is the weather in London?';

type Input = { city: string };

function weatherTools(executedInputs: Input[]) {
  return {
    weather: tool({
      inputSchema: z.object({ city: z.string() }),
      execute: async ({ city }) => {
        executedInputs.push({ city });
        return { temperature: 18 };
      },
    }),
  };
}

function timeTools(executedInputs: Array<{ timezone: string }>) {
  return {
    weather: tool({
      inputSchema: z.object({ city: z.string() }),
      execute: async () => {
        return { temperature: 18 };
      },
    }),
    clock: tool({
      inputSchema: z.object({ timezone: z.string() }),
      execute: async ({ timezone }) => {
        executedInputs.push({ timezone });
        return { time: '12:00' };
      },
    }),
  };
}

// `jsonSchema` without a `validate` function has no runtime validator.
function schemaOnlyWeatherTools(executedInputs: Input[]) {
  return {
    weather: tool({
      inputSchema: jsonSchema<Input>({
        type: 'object',
        properties: { city: { type: 'string' } },
        required: ['city'],
      }),
      execute: async ({ city }) => {
        executedInputs.push({ city });
        return { temperature: 18 };
      },
    }),
  };
}

const refineToParis = (input: Input): Input => ({ ...input, city: 'Paris' });
const refineToBerlin = (input: Input): Input => ({ ...input, city: 'Berlin' });

type StepLike = {
  toolCalls: ReadonlyArray<{
    toolCallId: string;
    toolName: string;
    input: unknown;
  }>;
  toolResults: ReadonlyArray<{
    toolCallId: string;
    toolName: string;
    input: unknown;
    output: unknown;
  }>;
};

function stepToolCalls(step: StepLike) {
  return step.toolCalls.map(({ toolCallId, toolName, input }) => ({
    toolCallId,
    toolName,
    input,
  }));
}

function stepToolResults(step: StepLike) {
  return step.toolResults.map(({ toolCallId, toolName, input, output }) => ({
    toolCallId,
    toolName,
    input,
    output,
  }));
}

function assistantToolCallParts(prompt: LanguageModelV4Prompt) {
  const parts: Array<{
    toolCallId: string;
    toolName: string;
    input: unknown;
  }> = [];

  for (const message of prompt) {
    if (message.role !== 'assistant') continue;
    for (const part of message.content) {
      if (part.type === 'tool-call') {
        parts.push({
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          input: part.input,
        });
      }
    }
  }

  return parts;
}

describe('experimental_refineToolInput', () => {
  it('refines the tool input in generate() like ToolLoopAgent', async () => {
    const responses = [toolResponse(), textResponse('It is 18°C.')];
    const coreModel = createAgentModel(responses);
    const workflowModel = createAgentModel(responses);
    const coreInputs: Input[] = [];
    const workflowInputs: Input[] = [];
    const coreStartInputs: unknown[] = [];
    const workflowStartInputs: unknown[] = [];

    const core = await new ToolLoopAgent({
      model: coreModel,
      tools: weatherTools(coreInputs),
      experimental_refineToolInput: { weather: refineToParis },
      onToolExecutionStart: ({ toolCall }) => {
        coreStartInputs.push(toolCall.input);
      },
    }).generate({ prompt });

    const workflow = await new WorkflowAgent({
      model: workflowModel,
      tools: weatherTools(workflowInputs),
      experimental_refineToolInput: { weather: refineToParis },
      onToolExecutionStart: ({ toolCall }) => {
        workflowStartInputs.push(toolCall.input);
      },
    }).generate({ prompt });

    expect(coreInputs).toEqual([{ city: 'Paris' }]);
    expect(workflowInputs).toEqual(coreInputs);

    expect(coreStartInputs).toEqual([{ city: 'Paris' }]);
    expect(workflowStartInputs).toEqual(coreStartInputs);

    expect(stepToolCalls(core.steps[0])).toEqual([
      {
        toolCallId: 'weather-call',
        toolName: 'weather',
        input: { city: 'Paris' },
      },
    ]);
    expect(stepToolCalls(workflow.steps[0])).toEqual(
      stepToolCalls(core.steps[0]),
    );

    expect(stepToolResults(core.steps[0])).toEqual([
      {
        toolCallId: 'weather-call',
        toolName: 'weather',
        input: { city: 'Paris' },
        output: { temperature: 18 },
      },
    ]);
    expect(stepToolResults(workflow.steps[0])).toEqual(
      stepToolResults(core.steps[0]),
    );

    expect(assistantToolCallParts(coreModel.doGenerateCalls[1].prompt)).toEqual(
      [
        {
          toolCallId: 'weather-call',
          toolName: 'weather',
          input: { city: 'Paris' },
        },
      ],
    );
    expect(
      assistantToolCallParts(workflowModel.doGenerateCalls[1].prompt),
    ).toEqual(assistantToolCallParts(coreModel.doGenerateCalls[1].prompt));
  });

  it('refines the tool input in stream() like ToolLoopAgent', async () => {
    const responses = [toolResponse(), textResponse('It is 18°C.')];
    const coreModel = createAgentModel(responses);
    const workflowModel = createAgentModel(responses);
    const coreInputs: Input[] = [];
    const workflowInputs: Input[] = [];
    const coreStartInputs: unknown[] = [];
    const workflowStartInputs: unknown[] = [];

    const core = await new ToolLoopAgent({
      model: coreModel,
      tools: weatherTools(coreInputs),
      experimental_refineToolInput: { weather: refineToParis },
      onToolExecutionStart: ({ toolCall }) => {
        coreStartInputs.push(toolCall.input);
      },
    }).stream({ prompt });
    await core.consumeStream();

    const workflow = await new WorkflowAgent({
      model: workflowModel,
      tools: weatherTools(workflowInputs),
      experimental_refineToolInput: { weather: refineToParis },
      onToolExecutionStart: ({ toolCall }) => {
        workflowStartInputs.push(toolCall.input);
      },
    }).stream({ prompt });

    const coreStep = (await core.steps)[0];

    expect(coreInputs).toEqual([{ city: 'Paris' }]);
    expect(workflowInputs).toEqual(coreInputs);

    expect(coreStartInputs).toEqual([{ city: 'Paris' }]);
    expect(workflowStartInputs).toEqual(coreStartInputs);

    expect(stepToolCalls(coreStep)).toEqual([
      {
        toolCallId: 'weather-call',
        toolName: 'weather',
        input: { city: 'Paris' },
      },
    ]);
    expect(stepToolCalls(workflow.steps[0])).toEqual(stepToolCalls(coreStep));

    expect(stepToolResults(coreStep)).toEqual([
      {
        toolCallId: 'weather-call',
        toolName: 'weather',
        input: { city: 'Paris' },
        output: { temperature: 18 },
      },
    ]);
    expect(stepToolResults(workflow.steps[0])).toEqual(
      stepToolResults(coreStep),
    );

    expect(assistantToolCallParts(coreModel.doStreamCalls[1].prompt)).toEqual([
      {
        toolCallId: 'weather-call',
        toolName: 'weather',
        input: { city: 'Paris' },
      },
    ]);
    expect(
      assistantToolCallParts(workflowModel.doStreamCalls[1].prompt),
    ).toEqual(assistantToolCallParts(coreModel.doStreamCalls[1].prompt));
  });

  it('keeps tools without a refinement entry unchanged', async () => {
    const responses = [clockResponse(), textResponse('It is 12:00.')];
    const coreModel = createAgentModel(responses);
    const workflowModel = createAgentModel(responses);
    const coreInputs: Array<{ timezone: string }> = [];
    const workflowInputs: Array<{ timezone: string }> = [];

    const core = await new ToolLoopAgent({
      model: coreModel,
      tools: timeTools(coreInputs),
      experimental_refineToolInput: { weather: refineToParis },
    }).generate({ prompt });

    const workflow = await new WorkflowAgent({
      model: workflowModel,
      tools: timeTools(workflowInputs),
      experimental_refineToolInput: { weather: refineToParis },
    }).generate({ prompt });

    expect(coreInputs).toEqual([{ timezone: 'UTC' }]);
    expect(workflowInputs).toEqual(coreInputs);

    expect(stepToolCalls(workflow.steps[0])).toEqual([
      {
        toolCallId: 'clock-call',
        toolName: 'clock',
        input: { timezone: 'UTC' },
      },
    ]);
    expect(stepToolCalls(workflow.steps[0])).toEqual(
      stepToolCalls(core.steps[0]),
    );
  });

  it('lets a per-call refinement override the constructor refinement', async () => {
    const model = createAgentModel([
      toolResponse(),
      textResponse('It is 18°C.'),
    ]);
    const executedInputs: Input[] = [];

    const workflow = await new WorkflowAgent({
      model,
      tools: weatherTools(executedInputs),
      experimental_refineToolInput: { weather: refineToBerlin },
    }).generate({
      prompt,
      experimental_refineToolInput: { weather: refineToParis },
    });

    expect(executedInputs).toEqual([{ city: 'Paris' }]);
    expect(stepToolCalls(workflow.steps[0])).toEqual([
      {
        toolCallId: 'weather-call',
        toolName: 'weather',
        input: { city: 'Paris' },
      },
    ]);
    expect(assistantToolCallParts(model.doGenerateCalls[1].prompt)).toEqual([
      {
        toolCallId: 'weather-call',
        toolName: 'weather',
        input: { city: 'Paris' },
      },
    ]);
  });

  it.each(['generate', 'stream'] as const)(
    'refines the input of a tool without a runtime validator in %s() like ToolLoopAgent',
    async mode => {
      const responses = [toolResponse(), textResponse('It is 18°C.')];
      const coreInputs: Input[] = [];
      const workflowInputs: Input[] = [];

      const coreAgent = new ToolLoopAgent({
        model: createAgentModel(responses),
        tools: schemaOnlyWeatherTools(coreInputs),
        experimental_refineToolInput: { weather: refineToParis },
      });
      let coreSteps: ReadonlyArray<StepLike>;
      if (mode === 'generate') {
        coreSteps = (await coreAgent.generate({ prompt })).steps;
      } else {
        const coreStream = await coreAgent.stream({ prompt });
        await coreStream.consumeStream();
        coreSteps = await coreStream.steps;
      }

      const workflowAgent = new WorkflowAgent({
        model: createAgentModel(responses),
        tools: schemaOnlyWeatherTools(workflowInputs),
        experimental_refineToolInput: { weather: refineToParis },
      });
      const workflow =
        mode === 'generate'
          ? await workflowAgent.generate({ prompt })
          : await workflowAgent.stream({ prompt });

      expect(coreInputs).toEqual([{ city: 'Paris' }]);
      expect(workflowInputs).toEqual(coreInputs);
      expect(stepToolCalls(coreSteps[0])).toEqual([
        {
          toolCallId: 'weather-call',
          toolName: 'weather',
          input: { city: 'Paris' },
        },
      ]);
      expect(stepToolCalls(workflow.steps[0])).toEqual(
        stepToolCalls(coreSteps[0]),
      );
      expect(stepToolResults(workflow.steps[0])).toEqual(
        stepToolResults(coreSteps[0]),
      );
    },
  );

  it('does not run a tool without a runtime validator when its refinement throws', async () => {
    const responses = [toolResponse(), textResponse('It is 18°C.')];
    const coreModel = createAgentModel(responses);
    const workflowModel = createAgentModel(responses);
    const coreInputs: Input[] = [];
    const workflowInputs: Input[] = [];
    const refine = (): Input => {
      throw new Error('refinement failed');
    };
    const invalidFlags = (step: { toolCalls: ReadonlyArray<object> }) =>
      step.toolCalls.map(
        toolCall => (toolCall as { invalid?: boolean }).invalid === true,
      );

    const core = await new ToolLoopAgent({
      model: coreModel,
      tools: schemaOnlyWeatherTools(coreInputs),
      experimental_refineToolInput: { weather: refine },
    }).generate({ prompt });

    const workflow = await new WorkflowAgent({
      model: workflowModel,
      tools: schemaOnlyWeatherTools(workflowInputs),
      experimental_refineToolInput: { weather: refine },
    }).generate({ prompt });

    expect(coreInputs).toEqual([]);
    expect(workflowInputs).toEqual([]);
    expect(invalidFlags(core.steps[0])).toEqual([true]);
    expect(invalidFlags(workflow.steps[0])).toEqual(
      invalidFlags(core.steps[0]),
    );
    expect(workflowModel.doGenerateCalls).toHaveLength(
      coreModel.doGenerateCalls.length,
    );
  });

  it.each(['generate', 'stream'] as const)(
    'runs an approved tool call with the refined input when %s() resumes',
    async mode => {
      const executedInputs: Input[] = [];
      const agent = new WorkflowAgent({
        model: createAgentModel([toolResponse(), textResponse('It is 18°C.')]),
        tools: {
          weather: tool({
            inputSchema: z.object({ city: z.string() }),
            needsApproval: true,
            execute: async ({ city }) => {
              executedInputs.push({ city });
              return { temperature: 18 };
            },
          }),
        },
        experimental_refineToolInput: { weather: refineToParis },
      });
      const run = async (messages: ModelMessage[]) => {
        if (mode === 'generate') {
          const result = await agent.generate({ messages });
          return {
            messages: result.responseMessages as ModelMessage[],
            toolResults: result.toolResults,
          };
        }
        const result = await agent.stream({ messages });
        return {
          messages: result.steps.flatMap(
            step => step.response.messages,
          ) as ModelMessage[],
          toolResults: result.steps.flatMap(step => step.toolResults),
        };
      };
      const userMessage: ModelMessage = { role: 'user', content: prompt };

      const issued = await run([userMessage]);
      expect(executedInputs).toEqual([]);

      await run([
        userMessage,
        ...issued.messages,
        {
          role: 'tool',
          content: [
            {
              type: 'tool-approval-response',
              approvalId: 'approval-weather-call',
              approved: true,
            },
          ],
        },
      ]);

      expect(executedInputs).toEqual([{ city: 'Paris' }]);
    },
  );

  it('supports async refinement functions', async () => {
    const responses = [toolResponse(), textResponse('It is 18°C.')];
    const generateModel = createAgentModel(responses);
    const streamModel = createAgentModel(responses);
    const generateInputs: Input[] = [];
    const streamInputs: Input[] = [];
    const refine = async (input: Input): Promise<Input> => ({
      ...input,
      city: 'Paris',
    });

    const generated = await new WorkflowAgent({
      model: generateModel,
      tools: weatherTools(generateInputs),
      experimental_refineToolInput: { weather: refine },
    }).generate({ prompt });

    const streamed = await new WorkflowAgent({
      model: streamModel,
      tools: weatherTools(streamInputs),
      experimental_refineToolInput: { weather: refine },
    }).stream({ prompt });

    expect(generateInputs).toEqual([{ city: 'Paris' }]);
    expect(streamInputs).toEqual([{ city: 'Paris' }]);
    expect(stepToolCalls(generated.steps[0])).toEqual([
      {
        toolCallId: 'weather-call',
        toolName: 'weather',
        input: { city: 'Paris' },
      },
    ]);
    expect(stepToolCalls(streamed.steps[0])).toEqual(
      stepToolCalls(generated.steps[0]),
    );
    expect(
      assistantToolCallParts(generateModel.doGenerateCalls[1].prompt),
    ).toEqual(assistantToolCallParts(streamModel.doStreamCalls[1].prompt));
  });
});

/**
 * The same scripted responses for core generate and Workflow stream tests.
 * Deliberately supports only the content used by these fixtures, so adding a
 * new content kind requires defining its equivalent streaming representation.
 */
function createAgentModel(responses: LanguageModelV4GenerateResult[]) {
  return new MockLanguageModelV4({
    doGenerate: responses,
    doStream: responses.map(response => {
      const parts: LanguageModelV4StreamPart[] = [
        { type: 'stream-start', warnings: response.warnings },
        { type: 'response-metadata', ...response.response },
      ];

      for (const [index, part] of response.content.entries()) {
        switch (part.type) {
          case 'text': {
            const id = `text-${index}`;
            parts.push(
              { type: 'text-start', id },
              { type: 'text-delta', id, delta: part.text },
              { type: 'text-end', id },
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
        providerMetadata: response.providerMetadata,
      });

      return { stream: convertArrayToReadableStream(parts) };
    }),
  });
}

function textResponse(text: string): LanguageModelV4GenerateResult {
  return {
    content: [{ type: 'text', text }],
    finishReason: { unified: 'stop', raw: 'stop' },
    usage: {
      inputTokens: {
        total: 3,
        noCache: 2,
        cacheRead: 1,
        cacheWrite: undefined,
      },
      outputTokens: { total: 2, text: 2, reasoning: undefined },
    },
    warnings: [],
    response: {
      id: 'response-fixture',
      timestamp: new Date(0),
      modelId: 'mock-model-id',
    },
  };
}

function toolResponse(): LanguageModelV4GenerateResult {
  return {
    ...textResponse('Checking the weather.'),
    content: [
      { type: 'text', text: 'Checking the weather.' },
      {
        type: 'tool-call',
        toolCallId: 'weather-call',
        toolName: 'weather',
        input: '{"city":"London"}',
      },
    ],
    finishReason: { unified: 'tool-calls', raw: 'tool-calls' },
  };
}

function clockResponse(): LanguageModelV4GenerateResult {
  return {
    ...textResponse('Checking the time.'),
    content: [
      { type: 'text', text: 'Checking the time.' },
      {
        type: 'tool-call',
        toolCallId: 'clock-call',
        toolName: 'clock',
        input: '{"timezone":"UTC"}',
      },
    ],
    finishReason: { unified: 'tool-calls', raw: 'tool-calls' },
  };
}
