import { JSONValue } from '@ai-sdk/provider';
import { InferSchema, ProviderOptions, Schema } from '@ai-sdk/provider-utils';
import * as z3 from 'zod/v3';
import * as z4 from 'zod/v4';
import { CallSettings } from '../prompt/call-settings';
import { Prompt } from '../prompt/prompt';
import { TelemetrySettings } from '../telemetry/telemetry-settings';
import { LanguageModel } from '../types/language-model';
import { DownloadFunction } from '../util/download/download-function';
import { GenerateObjectResult } from './generate-object-result';
import { RepairTextFunction } from './repair-text';

/**
Options for the generateObject function.
 */
export type GenerateObjectOptions<
  SCHEMA extends
    | z3.Schema
    | z4.core.$ZodType
    | Schema = z4.core.$ZodType<JSONValue>,
  OUTPUT extends
    | 'object'
    | 'array'
    | 'enum'
    | 'no-schema' = InferSchema<SCHEMA> extends string ? 'enum' : 'object',
  RESULT = OUTPUT extends 'array'
    ? Array<InferSchema<SCHEMA>>
    : InferSchema<SCHEMA>,
> = Omit<CallSettings, 'stopSequences'> &
  Prompt &
  (OUTPUT extends 'enum'
    ? {
        /**
The enum values that the model should use.
        */
        enum: Array<RESULT>;
        mode?: 'json';
        output: 'enum';
      }
    : OUTPUT extends 'no-schema'
      ? {}
      : {
          /**
The schema of the object that the model should generate.
        */
          schema: SCHEMA;

          /**
Optional name of the output that should be generated.
Used by some providers for additional LLM guidance, e.g.
via tool or schema name.
        */
          schemaName?: string;

          /**
Optional description of the output that should be generated.
Used by some providers for additional LLM guidance, e.g.
via tool or schema description.
        */
          schemaDescription?: string;

          /**
The mode to use for object generation.

The schema is converted into a JSON schema and used in one of the following ways

- 'auto': The provider will choose the best mode for the model.
- 'tool': A tool with the JSON schema as parameters is provided and the provider is instructed to use it.
- 'json': The JSON schema and an instruction are injected into the prompt. If the provider supports JSON mode, it is enabled. If the provider supports JSON grammars, the grammar is used.

Please note that most providers do not support all modes.

Default and recommended: 'auto' (best mode for the model).
        */
          mode?: 'auto' | 'json' | 'tool';
        }) & {
    output?: OUTPUT;

    /**
The language model to use.
     */
    model: LanguageModel;
    /**
A function that attempts to repair the raw output of the model
to enable JSON parsing.
       */
    experimental_repairText?: RepairTextFunction;

    /**
Optional telemetry configuration (experimental).
       */

    experimental_telemetry?: TelemetrySettings;

    /**
Custom download function to use for URLs.

By default, files are downloaded if the model does not support the URL for the given media type.
       */
    experimental_download?: DownloadFunction | undefined;

    /**
Additional provider-specific options. They are passed through
to the provider from the AI SDK and enable provider-specific
functionality that can be fully encapsulated in the provider.
 */
    providerOptions?: ProviderOptions;

    /**
Callback that is invoked when an error occurs during generation.
You can use it to log errors or retry with different options.
     */
    onError?: GenerateObjectOnErrorCallback<SCHEMA, OUTPUT, RESULT>;

    /**
     * Internal. For test use only. May change without notice.
     */
    _internal?: {
      generateId?: () => string;
      currentDate?: () => Date;
    };
  };

/**
Callback that is set using the `onError` option.

@param event - The event that is passed to the callback.
 */
export type GenerateObjectOnErrorCallback<
  SCHEMA extends
    | z3.Schema
    | z4.core.$ZodType
    | Schema = z4.core.$ZodType<JSONValue>,
  OUTPUT extends
    | 'object'
    | 'array'
    | 'enum'
    | 'no-schema' = InferSchema<SCHEMA> extends string ? 'enum' : 'object',
  RESULT = OUTPUT extends 'array'
    ? Array<InferSchema<SCHEMA>>
    : InferSchema<SCHEMA>,
> = (event: {
  error: unknown;
  retry: (
    newOptions?: Partial<GenerateObjectOptions<SCHEMA, OUTPUT, RESULT>>,
  ) => Promise<GenerateObjectResult<RESULT>>;
}) => Promise<void> | void;
