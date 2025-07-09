import { LanguageModelV2CallOptions } from '@ai-sdk/provider';
import {
  asSchema,
  safeParseJSON,
  safeValidateTypes,
  Schema,
<<<<<<< HEAD:packages/ai/core/generate-text/output.ts
} from '@ai-sdk/ui-utils';
import { z } from 'zod';
import { NoObjectGeneratedError } from '../../errors';
import { injectJsonInstruction } from '../generate-object/inject-json-instruction';
import {
  FinishReason,
  LanguageModel,
  LanguageModelV1CallOptions,
} from '../types/language-model';
=======
} from '@ai-sdk/provider-utils';
import * as z3 from 'zod/v3';
import * as z4 from 'zod/v4';
import { NoObjectGeneratedError } from '../../src/error/no-object-generated-error';
import { DeepPartial } from '../../src/util/deep-partial';
import { parsePartialJson } from '../../src/util/parse-partial-json';
import { FinishReason } from '../types/language-model';
>>>>>>> ffac5e5f564b670187256f9adb84a0095255e1f9:packages/ai/src/generate-text/output.ts
import { LanguageModelResponseMetadata } from '../types/language-model-response-metadata';
import { LanguageModelUsage } from '../types/usage';

export interface Output<OUTPUT, PARTIAL> {
  readonly type: 'object' | 'text';

  responseFormat: LanguageModelV2CallOptions['responseFormat'];

  parsePartial(options: {
    text: string;
  }): Promise<{ partial: PARTIAL } | undefined>;

  parseOutput(
    options: { text: string },
    context: {
      response: LanguageModelResponseMetadata;
      usage: LanguageModelUsage;
      finishReason: FinishReason;
    },
  ): Promise<OUTPUT>;
}

export const text = (): Output<string, string> => ({
  type: 'text',

  responseFormat: { type: 'text' },

  async parsePartial({ text }: { text: string }) {
    return { partial: text };
  },

  async parseOutput({ text }: { text: string }) {
    return text;
  },
});

export const object = <OUTPUT>({
  schema: inputSchema,
}: {
  schema:
    | z4.ZodType<OUTPUT, any>
    | z3.Schema<OUTPUT, z3.ZodTypeDef, any>
    | Schema<OUTPUT>;
}): Output<OUTPUT, DeepPartial<OUTPUT>> => {
  const schema = asSchema(inputSchema);

  return {
    type: 'object',

    responseFormat: {
      type: 'json',
      schema: schema.jsonSchema,
    },

    async parsePartial({ text }: { text: string }) {
      const result = await parsePartialJson(text);

      switch (result.state) {
        case 'failed-parse':
        case 'undefined-input':
          return undefined;

        case 'repaired-parse':
        case 'successful-parse':
          return {
            // Note: currently no validation of partial results:
            partial: result.value as DeepPartial<OUTPUT>,
          };

        default: {
          const _exhaustiveCheck: never = result.state;
          throw new Error(`Unsupported parse state: ${_exhaustiveCheck}`);
        }
      }
    },

    async parseOutput(
      { text }: { text: string },
      context: {
        response: LanguageModelResponseMetadata;
        usage: LanguageModelUsage;
        finishReason: FinishReason;
      },
    ) {
      const parseResult = await safeParseJSON({ text });

      if (!parseResult.success) {
        throw new NoObjectGeneratedError({
          message: 'No object generated: could not parse the response.',
          cause: parseResult.error,
          text,
          response: context.response,
          usage: context.usage,
          finishReason: context.finishReason,
        });
      }

      const validationResult = await safeValidateTypes({
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
          finishReason: context.finishReason,
        });
      }

      return validationResult.value;
    },
  };
};
