import { openai, type OpenAIResponsesToolResultOptions } from '@ai-sdk/openai';
import {
  isStepCount,
  jsonSchema,
  type ModelMessage,
  type PrepareStepFunction,
  type ToolModelMessage,
} from 'ai';

const parameters = {
  type: 'object',
  properties: {},
  additionalProperties: false,
} as const;
const instructions =
  'The getExampleNumber tool returns the example number. Call it to answer the user.';
const resultOptions = {
  additionalTools: [{ type: 'function', name: 'getExampleNumber', parameters }],
} satisfies OpenAIResponsesToolResultOptions;

export const tools = {
  readSkill: {
    description: 'Read instructions and load the example number tool.',
    inputSchema: jsonSchema<Record<string, never>>(parameters),
    execute: async () => instructions,
  },
  getExampleNumber: {
    inputSchema: jsonSchema<Record<string, never>>(parameters),
    execute: async () => 42,
  },
};

// This demo has one immutable skill. A real application should resolve saved
// successful receipts against its trusted, version-pinned catalog.
function isSkillResult(part: ToolModelMessage['content'][number]) {
  return (
    part.type === 'tool-result' &&
    part.toolName === 'readSkill' &&
    part.output.type === 'text' &&
    part.output.value === instructions
  );
}

export function project(messages: ModelMessage[]): ModelMessage[] {
  return messages.map(message => {
    if (message.role !== 'tool') return message;
    return {
      ...message,
      content: message.content.map(part => {
        if (part.type !== 'tool-result' || !isSkillResult(part)) return part;
        return {
          ...part,
          providerOptions: {
            ...part.providerOptions,
            openai: { ...part.providerOptions?.openai, ...resultOptions },
          },
        };
      }),
    };
  });
}

const prepareStep: PrepareStepFunction<typeof tools> = ({ messages }) => {
  const projected = project(messages);
  const loaded = projected.some(
    message => message.role === 'tool' && message.content.some(isSkillResult),
  );
  return {
    messages: projected,
    activeTools: loaded ? ['readSkill', 'getExampleNumber'] : ['readSkill'],
  };
};

export const options = {
  model: openai.responses('gpt-5.6-luna'),
  tools,
  prepareStep,
  stopWhen: isStepCount(4),
  maxRetries: 0,
  providerOptions: { openai: { store: false } },
};
