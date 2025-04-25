import { Schema } from '@ai-sdk/ui-utils';
import { z } from 'zod';
import { CallSettings } from '../prompt/call-settings';
import { Prompt } from '../prompt/prompt';
import { LanguageModel } from '../types/language-model';
import { ProviderMetadata } from '../types/provider-metadata';
import { ProviderOptions } from '../types/provider-metadata';
import { TelemetrySettings } from '../telemetry/telemetry-settings';
import { TypeValidationError } from '@ai-sdk/provider';
import { JSONParseError } from '@ai-sdk/provider';

/**
A function that attempts to repair the raw output of the mode
to enable JSON parsing.

Should return the repaired text or null if the text cannot be repaired.
     */
export type RepairTextFunction = (options: {
  text: string;
  error: JSONParseError | TypeValidationError;
}) => Promise<string | null>;

export type GenerateObjectBaseOptions = Omit<CallSettings, 'stopSequences'> &
  Prompt & {
    /**
The language model to use.
     */
    model: LanguageModel;

    /**
The mode to use for object generation.

The schema is converted into a JSON schema and used in one of the following ways

- 'auto': The provider will choose the best mode for the model.
- 'tool': A tool with the JSON schema as parameters is provided and the provider is instructed to use it.
- 'json': The JSON schema and an instruction are injected into the prompt. If the provider supports JSON mode, it iis enabled. If the provider supports JSON grammars, the grammar is used.

Please note that most providers do not support all modes.

Default and recommended: 'auto' (best mode for the model).
     */
    mode?: 'auto' | 'json' | 'tool';

    /**
A function that attempts to repair the raw output of the mode
to enable JSON parsing.
     */
    experimental_repairText?: RepairTextFunction;

    /**
Optional telemetry configuration (experimental).
 */

    experimental_telemetry?: TelemetrySettings;

    /**
Additional provider-specific options. They are passed through
to the provider from the AI SDK and enable provider-specific
functionality that can be fully encapsulated in the provider.
*/
    providerOptions?: ProviderOptions;

    /**
@deprecated Use `providerOptions` instead.
*/
    experimental_providerMetadata?: ProviderMetadata;

    /**
     * Internal. For test use only. May change without notice.
     */
    _internal?: {
      generateId?: () => string;
      currentDate?: () => Date;
    };
  };

/**
 * Schema-based options with common schema properties
 */
export interface SchemaBasedOptions<T> extends GenerateObjectBaseOptions {
  /**
   * The schema of the object that the model should generate.
   */
  schema: z.Schema<T, z.ZodTypeDef, any> | Schema<T>;

  /**
   * Optional name of the output that should be generated.
   * Used by some providers for additional LLM guidance, e.g.
   * via tool or schema name.
   */
  schemaName?: string;

  /**
   * Optional description of the output that should be generated.
   * Used by some providers for additional LLM guidance, e.g.
   * via tool or schema description.
   */
  schemaDescription?: string;
}

export type GenerateObjectNoSchemaOptions = GenerateObjectBaseOptions & {
  output: 'no-schema';
  /**
The mode to use for object generation. Must be "json" for no-schema output.
     */
  mode?: 'json';
};

export type GenerateObjectArrayOptions<ELEMENT> = GenerateObjectBaseOptions & {
  output: 'array';
  /**
The element schema of the array that the model should generate.
 */
  schema: z.Schema<ELEMENT, z.ZodTypeDef, any> | Schema<ELEMENT>;

  /**
Optional name of the array that should be generated.
Used by some providers for additional LLM guidance, e.g.
via tool or schema name.
*/
  schemaName?: string;

  /**
Optional description of the array that should be generated.
Used by some providers for additional LLM guidance, e.g.
via tool or schema description.
*/
  schemaDescription?: string;
};

export type GenerateObjectEnumOptions<ENUM extends string> =
  GenerateObjectBaseOptions & {
    output: 'enum';
    /**
The enum values that the model should use.
     */
    enum: Array<ENUM>;
  };

export type GenerateObjectObjectOptions<OBJECT> = GenerateObjectBaseOptions & {
  output?: 'object' | undefined;
  /**
The schema of the object that the model should generate.
     */
  schema: z.Schema<OBJECT, z.ZodTypeDef, any> | Schema<OBJECT>;

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
};

export type GenerateObjectOptions =
  | GenerateObjectNoSchemaOptions
  | GenerateObjectArrayOptions<any>
  | GenerateObjectEnumOptions<any>
  | GenerateObjectObjectOptions<any>;
