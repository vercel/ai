import type {
  LanguageModelV4CallOptions,
  LanguageModelV4GenerateResult,
  LanguageModelV4StreamPart,
} from '@ai-sdk/provider';
import { ToolLoopAgent, tool, type Instructions } from 'ai';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import { WorkflowAgent, type ProviderOptions } from './workflow-agent.js';

const prompt = 'What is the weather in London?';

function weatherTools() {
  return {
    weather: tool({
      inputSchema: z.object({ city: z.string() }),
      execute: async () => ({ temperature: 18 }),
    }),
  };
}

type PrepareStepOverride = {
  instructions?: Instructions;
  system?: string;
  providerOptions?: ProviderOptions;
};

async function runAgents({
  instructions,
  stepOverride,
  providerOptions,
}: {
  instructions?: Instructions;
  stepOverride?: PrepareStepOverride;
  providerOptions?: ProviderOptions;
}) {
  const responses = () => [toolResponse(), textResponse('It is 18°C.')];
  const prepareStep = ({ stepNumber }: { stepNumber: number }) =>
    stepNumber === 0 ? stepOverride : undefined;

  const coreModel = createAgentModel(responses());
  await new ToolLoopAgent({
    model: coreModel,
    tools: weatherTools(),
    instructions,
    providerOptions,
    prepareStep,
  }).generate({ prompt });

  const generateModel = createAgentModel(responses());
  await new WorkflowAgent({
    model: generateModel,
    tools: weatherTools(),
    instructions,
    providerOptions,
    prepareStep,
  }).generate({ prompt });

  const streamModel = createAgentModel(responses());
  await new WorkflowAgent({
    model: streamModel,
    tools: weatherTools(),
    instructions,
    providerOptions,
    prepareStep,
  }).stream({ prompt });

  return {
    core: coreModel.doGenerateCalls,
    generate: generateModel.doGenerateCalls,
    stream: streamModel.doStreamCalls,
  };
}

type SystemMessage = {
  role: 'system';
  content: string;
  providerOptions?: unknown;
};

function systemMessages(call: LanguageModelV4CallOptions): SystemMessage[] {
  const messages: SystemMessage[] = [];

  for (const message of call.prompt) {
    if (message.role !== 'system') break;

    messages.push({
      role: message.role,
      content: message.content,
      ...(message.providerOptions === undefined
        ? {}
        : { providerOptions: message.providerOptions }),
    });
  }

  return messages;
}

describe('WorkflowAgent prepareStep results', () => {
  describe('instructions', () => {
    it('applies string instructions returned at step 0, like ToolLoopAgent', async () => {
      const calls = await runAgents({
        instructions: 'Initial instructions',
        stepOverride: { instructions: 'Step instructions' },
      });

      expect(calls.core).toHaveLength(2);
      expect(calls.core.map(systemMessages)).toEqual([
        [{ role: 'system', content: 'Step instructions' }],
        [{ role: 'system', content: 'Step instructions' }],
      ]);
      expect(calls.generate.map(systemMessages)).toEqual(
        calls.core.map(systemMessages),
      );
      expect(calls.stream.map(systemMessages)).toEqual(
        calls.core.map(systemMessages),
      );
    });

    it('applies system message instructions with providerOptions returned at step 0, like ToolLoopAgent', async () => {
      const calls = await runAgents({
        instructions: 'Initial instructions',
        stepOverride: {
          instructions: {
            role: 'system',
            content: 'Step instructions',
            providerOptions: { test: { value: 'step' } },
          },
        },
      });

      expect(calls.core.map(systemMessages)).toEqual([
        [
          {
            role: 'system',
            content: 'Step instructions',
            providerOptions: { test: { value: 'step' } },
          },
        ],
        [
          {
            role: 'system',
            content: 'Step instructions',
            providerOptions: { test: { value: 'step' } },
          },
        ],
      ]);
      expect(calls.generate.map(systemMessages)).toEqual(
        calls.core.map(systemMessages),
      );
      expect(calls.stream.map(systemMessages)).toEqual(
        calls.core.map(systemMessages),
      );
    });

    it('applies array instructions returned at step 0, like ToolLoopAgent', async () => {
      const calls = await runAgents({
        instructions: 'Initial instructions',
        stepOverride: {
          instructions: [
            {
              role: 'system',
              content: 'Step instructions 1',
              providerOptions: { test: { value: 'step 1' } },
            },
            { role: 'system', content: 'Step instructions 2' },
          ],
        },
      });

      expect(calls.core.map(systemMessages)).toEqual([
        [
          {
            role: 'system',
            content: 'Step instructions 1',
            providerOptions: { test: { value: 'step 1' } },
          },
          { role: 'system', content: 'Step instructions 2' },
        ],
        [
          {
            role: 'system',
            content: 'Step instructions 1',
            providerOptions: { test: { value: 'step 1' } },
          },
          { role: 'system', content: 'Step instructions 2' },
        ],
      ]);
      expect(calls.generate.map(systemMessages)).toEqual(
        calls.core.map(systemMessages),
      );
      expect(calls.stream.map(systemMessages)).toEqual(
        calls.core.map(systemMessages),
      );
    });

    it('replaces initial instructions that are an array of messages, like ToolLoopAgent', async () => {
      const calls = await runAgents({
        instructions: [
          {
            role: 'system',
            content: 'Initial instructions 1',
            providerOptions: { test: { value: 'initial 1' } },
          },
          { role: 'system', content: 'Initial instructions 2' },
        ],
        stepOverride: {
          instructions: [
            { role: 'system', content: 'Step instructions 1' },
            { role: 'system', content: 'Step instructions 2' },
          ],
        },
      });

      expect(calls.core.map(systemMessages)).toEqual([
        [
          { role: 'system', content: 'Step instructions 1' },
          { role: 'system', content: 'Step instructions 2' },
        ],
        [
          { role: 'system', content: 'Step instructions 1' },
          { role: 'system', content: 'Step instructions 2' },
        ],
      ]);
      expect(calls.generate.map(systemMessages)).toEqual(
        calls.core.map(systemMessages),
      );
      expect(calls.stream.map(systemMessages)).toEqual(
        calls.core.map(systemMessages),
      );
    });

    it('applies system returned at step 0, like ToolLoopAgent', async () => {
      const calls = await runAgents({
        instructions: 'Initial instructions',
        stepOverride: { system: 'Step instructions' },
      });

      expect(calls.core.map(systemMessages)).toEqual([
        [{ role: 'system', content: 'Step instructions' }],
        [{ role: 'system', content: 'Step instructions' }],
      ]);
      expect(calls.generate.map(systemMessages)).toEqual(
        calls.core.map(systemMessages),
      );
      expect(calls.stream.map(systemMessages)).toEqual(
        calls.core.map(systemMessages),
      );
    });

    it('passes the instructions in effect to prepareStep like ToolLoopAgent', async () => {
      const responses = () => [toolResponse(), textResponse('It is 18°C.')];
      const stepOverride = { instructions: 'Step instructions' };
      const coreSeen: Array<Instructions | undefined> = [];
      const generateSeen: Array<Instructions | undefined> = [];
      const streamSeen: Array<Instructions | undefined> = [];

      const coreModel = createAgentModel(responses());
      await new ToolLoopAgent({
        model: coreModel,
        tools: weatherTools(),
        instructions: 'Initial instructions',
        prepareStep: ({ stepNumber, instructions }) => {
          coreSeen.push(instructions);
          return stepNumber === 0 ? stepOverride : undefined;
        },
      }).generate({ prompt });

      const generateModel = createAgentModel(responses());
      await new WorkflowAgent({
        model: generateModel,
        tools: weatherTools(),
        instructions: 'Initial instructions',
        prepareStep: ({ stepNumber, instructions }) => {
          generateSeen.push(instructions);
          return stepNumber === 0 ? stepOverride : undefined;
        },
      }).generate({ prompt });

      const streamModel = createAgentModel(responses());
      await new WorkflowAgent({
        model: streamModel,
        tools: weatherTools(),
        instructions: 'Initial instructions',
        prepareStep: ({ stepNumber, instructions }) => {
          streamSeen.push(instructions);
          return stepNumber === 0 ? stepOverride : undefined;
        },
      }).stream({ prompt });

      expect(coreSeen).toEqual(['Initial instructions', 'Step instructions']);
      expect(generateSeen).toEqual(coreSeen);
      expect(streamSeen).toEqual(coreSeen);
    });
  });

  describe('providerOptions', () => {
    it('merges providerOptions returned at step 0, like ToolLoopAgent', async () => {
      const calls = await runAgents({
        providerOptions: {
          mock: { fromAgent: 'agent', shared: 'agent' },
          agentOnly: { value: 'agent' },
        },
        stepOverride: {
          providerOptions: { mock: { fromStep: 'step', shared: 'step' } },
        },
      });

      expect(calls.core.map(call => call.providerOptions)).toEqual([
        {
          mock: { fromAgent: 'agent', fromStep: 'step', shared: 'step' },
          agentOnly: { value: 'agent' },
        },
        {
          mock: { fromAgent: 'agent', shared: 'agent' },
          agentOnly: { value: 'agent' },
        },
      ]);
      expect(calls.generate.map(call => call.providerOptions)).toEqual(
        calls.core.map(call => call.providerOptions),
      );
      expect(calls.stream.map(call => call.providerOptions)).toEqual(
        calls.core.map(call => call.providerOptions),
      );
    });
  });

  describe('headers', () => {
    it('merges headers returned at step 0 over the call headers', async () => {
      const responses = () => [toolResponse(), textResponse('It is 18°C.')];
      const prepareStep = ({ stepNumber }: { stepNumber: number }) =>
        stepNumber === 0 ? { headers: { 'x-step': 'step' } } : undefined;

      const generateModel = createAgentModel(responses());
      await new WorkflowAgent({
        model: generateModel,
        tools: weatherTools(),
        headers: { 'x-agent': 'agent' },
        prepareStep,
      }).generate({ prompt });

      const streamModel = createAgentModel(responses());
      await new WorkflowAgent({
        model: streamModel,
        tools: weatherTools(),
        headers: { 'x-agent': 'agent' },
        prepareStep,
      }).stream({ prompt });

      for (const calls of [
        generateModel.doGenerateCalls,
        streamModel.doStreamCalls,
      ]) {
        expect(calls[0].headers).toMatchObject({
          'x-agent': 'agent',
          'x-step': 'step',
        });
        expect(calls[0].headers?.['user-agent']).toContain(
          'ai-sdk-agent/workflow',
        );
        expect(calls[1].headers).toMatchObject({ 'x-agent': 'agent' });
        expect(calls[1].headers?.['x-step']).toBeUndefined();
        expect(calls[1].headers?.['user-agent']).toContain(
          'ai-sdk-agent/workflow',
        );
      }
    });

    it('keeps the agent user-agent when prepareStep returns a user-agent', async () => {
      const responses = () => [toolResponse(), textResponse('It is 18°C.')];
      const prepareStep = ({ stepNumber }: { stepNumber: number }) =>
        stepNumber === 0 ? { headers: { 'user-agent': 'custom' } } : undefined;

      const generateModel = createAgentModel(responses());
      await new WorkflowAgent({
        model: generateModel,
        tools: weatherTools(),
        headers: { 'x-agent': 'agent' },
        prepareStep,
      }).generate({ prompt });

      const streamModel = createAgentModel(responses());
      await new WorkflowAgent({
        model: streamModel,
        tools: weatherTools(),
        headers: { 'x-agent': 'agent' },
        prepareStep,
      }).stream({ prompt });

      for (const calls of [
        generateModel.doGenerateCalls,
        streamModel.doStreamCalls,
      ]) {
        expect(calls[0].headers?.['user-agent']).toBeDefined();
        expect(calls[0].headers?.['user-agent']).toContain('custom');
        expect(calls[0].headers?.['user-agent']).toContain(
          'ai-sdk-agent/workflow',
        );
        expect(calls[0].headers?.['x-agent']).toBe('agent');
      }
    });
  });
});

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
