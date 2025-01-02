import { safeParseJSON, safeValidateTypes } from '@ai-sdk/provider-utils';
import { asSchema, Schema } from '@ai-sdk/ui-utils';
import { z } from 'zod';
import { NoObjectGeneratedError } from '../../errors';
import { injectJsonInstruction } from '../generate-object/inject-json-instruction';
import {
  LanguageModel,
  LanguageModelV1CallOptions,
} from '../types/language-model';
import { LanguageModelResponseMetadata } from '../types/language-model-response-metadata';
import { LanguageModelUsage } from '../types/usage';

export interface Output<OUTPUT> {
  readonly type: 'object' | 'text';
  injectIntoSystemPrompt(options: {
    system: string | undefined;
    model: LanguageModel;
  }): string | undefined;
  responseFormat: (options: {
    model: LanguageModel;
  }) => LanguageModelV1CallOptions['responseFormat'];
  parseOutput(
    options: { text: string },
    context: {
      response: LanguageModelResponseMetadata;
      usage: LanguageModelUsage;
    },
  ): OUTPUT;
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
    parseOutput(
      { text }: { text: string },
      context: {
        response: LanguageModelResponseMetadata;
        usage: LanguageModelUsage;
      },
    ) {
      const parseResult = safeParseJSON({ text });

      if (!parseResult.success) {
        throw new NoObjectGeneratedError({
          message: 'No object generated: could not parse the response.',
          cause: parseResult.error,
          text,
          response: context.response,
          usage: context.usage,
        });
      }

      const validationResult = safeValidateTypes({
        value: parseResult.value,
        schema,
      });

      if (!validationResult.success) {
        throw new NoObjectGeneratedError({
          message: 'No object generated: response did not match schema.',
          cause: validationResult.error,
          text,
          response: context.response,
          usage: context.usage,
        });
      }

      return validationResult.value;
    },
  };
};
