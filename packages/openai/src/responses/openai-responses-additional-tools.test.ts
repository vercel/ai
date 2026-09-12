import { describe, expect, it } from 'vitest';
import type {
  JSONValue,
  LanguageModelV4Prompt,
  LanguageModelV4ToolResultOutput,
} from '@ai-sdk/provider';
import { convertToOpenAIResponsesInput } from './convert-to-openai-responses-input';
import {
  omitHistoricalTools,
  type OpenAIResponsesToolResultOptions,
} from './openai-responses-additional-tools';

const definition = {
  type: 'function',
  name: 'specialist',
  parameters: { type: 'object' },
  strict: true,
} satisfies NonNullable<
  OpenAIResponsesToolResultOptions['additionalTools']
>[number];
const convert = (
  additionalTools: JSONValue,
  output: LanguageModelV4ToolResultOutput = {
    type: 'json',
    value: { instructions: 'Use specialist.' },
  },
) =>
  convertToOpenAIResponsesInput({
    prompt: [
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'read',
            toolName: 'readSkill',
            output,
            providerOptions: {
              openai: {
                additionalTools,
                caller: { type: 'direct' },
              },
            },
          },
          {
            type: 'tool-result',
            toolCallId: 'other',
            toolName: 'other',
            output: { type: 'text', value: 'unchanged' },
          },
        ],
      },
    ] satisfies LanguageModelV4Prompt,
    toolNameMapping: {
      toProviderToolName: name => name,
      toCustomToolName: name => name,
    },
    systemMessageMode: 'developer',
    providerOptionsName: 'openai',
    store: false,
  });

describe('additional tools', () => {
  it.each(['error-text', 'error-json', 'execution-denied'] as const)(
    'rejects activation on %s results',
    async type => {
      await expect(
        convert(
          [definition],
          type === 'execution-denied' ? { type } : { type, value: 'failed' },
        ),
      ).rejects.toThrow('successful ordinary function');
    },
  );
  it('inserts immediately after the ordinary output and preserves caller metadata and siblings', async () => {
    expect((await convert([definition])).input).toMatchInlineSnapshot(`
      [
        {
          "call_id": "read",
          "caller": {
            "type": "direct",
          },
          "output": "{\"instructions\":\"Use specialist.\"}",
          "type": "function_call_output",
        },
        {
          "role": "developer",
          "tools": [
            {
              "name": "specialist",
              "parameters": {
                "type": "object",
              },
              "strict": true,
              "type": "function",
            },
          ],
          "type": "additional_tools",
        },
        {
          "call_id": "other",
          "output": "unchanged",
          "type": "function_call_output",
        },
      ]
    `);
  });

  it.each(
    [
      [],
      [{ ...definition, name: '' }],
      [{ ...definition, parameters: false }],
      [{ ...definition, parameters: { type: 'array' } }],
      [{ ...definition, parameters: { type: 'object', required: 'bad' } }],
      [{ ...definition, parameters: { type: 'object', properties: { x: 3 } } }],
      [{ ...definition, surprise: true }],
    ].map(value => ({ value })),
  )('rejects invalid options %j', async ({ value }) => {
    await expect(convert(value)).rejects.toThrow();
  });

  it('omits matching definitions across multiple and repeated activations', async () => {
    const { input } = await convert([definition]);
    const secondDefinition = { ...definition, name: 'secondSpecialist' };
    const second = await convert([secondDefinition]);
    const core = { ...definition, name: 'readSkill', description: undefined };
    expect(
      omitHistoricalTools({
        input: [...input, ...second.input, ...input],
        tools: [
          core,
          { ...definition, description: undefined },
          { ...secondDefinition, description: undefined },
        ],
      }),
    ).toEqual([core]);
  });

  it('compares schemas independently of object property order', async () => {
    const { input } = await convert([
      {
        ...definition,
        parameters: {
          type: 'object',
          properties: { a: { type: 'string' }, b: { type: 'number' } },
        },
      },
    ]);
    expect(
      omitHistoricalTools({
        input,
        tools: [
          {
            ...definition,
            description: undefined,
            parameters: {
              properties: { b: { type: 'number' }, a: { type: 'string' } },
              type: 'object',
            },
          },
        ],
      }),
    ).toEqual([]);
  });

  it('rejects historical and current definition conflicts', async () => {
    const { input } = await convert([definition]);
    expect(() =>
      omitHistoricalTools({
        input,
        tools: [{ ...definition, description: 'different' }],
      }),
    ).toThrow('Conflicting');
    const other = await convert([{ ...definition, strict: false }]);
    expect(() =>
      omitHistoricalTools({
        input: [...input, ...other.input],
        tools: undefined,
      }),
    ).toThrow('Conflicting');
  });
});
