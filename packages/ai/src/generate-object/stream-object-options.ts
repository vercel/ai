import { JSONValue } from '@ai-sdk/provider';
import {
  ProviderOptions,
  type InferSchema,
  type Schema,
} from '@ai-sdk/provider-utils';
import * as z3 from 'zod/v3';
import * as z4 from 'zod/v4';
import { CallSettings } from '../prompt/call-settings';
import { Prompt } from '../prompt/prompt';
import { TelemetrySettings } from '../telemetry/telemetry-settings';
import { CallWarning, LanguageModel } from '../types/language-model';
import { LanguageModelResponseMetadata } from '../types/language-model-response-metadata';
import { ProviderMetadata } from '../types/provider-metadata';
import { LanguageModelUsage } from '../types/usage';
import { DeepPartial } from '../util';
import { AsyncIterableStream } from '../util/async-iterable-stream';
import { DownloadFunction } from '../util/download/download-function';
import { RepairTextFunction } from './repair-text';
import { StreamObjectResult } from './stream-object-result';

/**
 * Computes the return type of streamObject based on output format.
 */
export type StreamObjectReturnType<SCHEMA, OUTPUT, RESULT> = StreamObjectResult<
  OUTPUT extends 'enum'
    ? string
    : OUTPUT extends 'array'
      ? RESULT
      : DeepPartial<RESULT>,
  OUTPUT extends 'array' ? RESULT : RESULT,
  OUTPUT extends 'array'
    ? RESULT extends Array<infer U>
      ? AsyncIterableStream<U>
      : never
    : never
>;

/**
Options for the streamObject function.
 */
export type StreamObjectOptions<
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
Callback that is invoked when an error occurs during streaming.
You can use it to log errors.
The stream processing will pause until the callback promise is resolved.
     */
    onError?: StreamObjectOnErrorCallback<SCHEMA, OUTPUT, RESULT>;

    /**
Callback that is called when the LLM response and the final object validation are finished.
*/
    onFinish?: StreamObjectOnFinishCallback<RESULT>;

    /**
     * Internal. For test use only. May change without notice.
     */
    _internal?: {
      generateId?: () => string;
      currentDate?: () => Date;
      now?: () => number;
    };
  };

/**
Callback that is set using the `onError` option.

@param event - The event that is passed to the callback.
 */
export type StreamObjectOnErrorCallback<
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
    newOptions?: Partial<StreamObjectOptions<SCHEMA, OUTPUT, RESULT>>,
  ) => StreamObjectReturnType<SCHEMA, OUTPUT, RESULT>;
}) => Promise<void> | void;

/**
Callback that is set using the `onFinish` option.

@param event - The event that is passed to the callback.
 */
export type StreamObjectOnFinishCallback<RESULT> = (event: {
  /**
The token usage of the generated response.
*/
  usage: LanguageModelUsage;

  /**
The generated object. Can be undefined if the final object does not match the schema.
*/
  object: RESULT | undefined;

  /**
Optional error object. This is e.g. a TypeValidationError when the final object does not match the schema.
*/
  error: unknown | undefined;

  /**
Response metadata.
 */
  response: LanguageModelResponseMetadata;

  /**
Warnings from the model provider (e.g. unsupported settings).
*/
  warnings?: CallWarning[];

  /**
Additional provider-specific metadata. They are passed through
to the provider from the AI SDK and enable provider-specific
functionality that can be fully encapsulated in the provider.
*/
  providerMetadata: ProviderMetadata | undefined;
}) => Promise<void> | void;
