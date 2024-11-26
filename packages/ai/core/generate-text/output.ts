import { parseJSON } from '@ai-sdk/provider-utils';
import { asSchema, Schema } from '@ai-sdk/ui-utils';
import { z } from 'zod';
import { injectJsonInstruction } from '../generate-object/inject-json-instruction';
import {
  LanguageModel,
  LanguageModelV1CallOptions,
} from '../types/language-model';

export interface Output<OUTPUT> {
  readonly type: 'object' | 'text';
  injectIntoSystemPrompt(options: {
    system: string | undefined;
    model: LanguageModel;
  }): string | undefined;
  responseFormat: (options: {
    model: LanguageModel;
  }) => LanguageModelV1CallOptions['responseFormat'];
  parseOutput(options: { text: string }): OUTPUT;
}

export const text = (): Output<string> => ({
  type: 'text',
  responseFormat: () => ({ type: 'text' }),
  injectIntoSystemPrompt({ system }: { system: string | undefined }) {
    return system;
  },
  parseOutput({ text }: { text: string }) {
    return text;
  },
});

export const object = <OUTPUT>({
  schema: inputSchema,
}: {
  schema: z.Schema<OUTPUT, z.ZodTypeDef, any> | Schema<OUTPUT>;
}): Output<OUTPUT> => {
  const schema = asSchema(inputSchema);

  return {
    type: 'object',
    responseFormat: ({ model }) => ({
      type: 'json',
      schema: model.supportsStructuredOutputs ? schema.jsonSchema : undefined,
    }),
    injectIntoSystemPrompt({ system, model }) {
      // when the model supports structured outputs,
      // we can use the system prompt as is:
      return model.supportsStructuredOutputs
        ? system
        : injectJsonInstruction({
            prompt: system,
            schema: schema.jsonSchema,
          });
    },
    parseOutput({ text }: { text: string }) {
      return parseJSON({ text, schema });
    },
  };
};
