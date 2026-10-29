/**
 * Helpers for passing tool schemas across workflow step boundaries.
 *
 * Tool schemas (zod, valibot, arktype, etc.) contain functions that can't be
 * serialized by the workflow runtime. These helpers extract JSON Schema from
 * schemas, then reconstruct tools with Ajv validation inside step functions.
 *
 * Uses `asSchema()` from `@ai-sdk/provider-utils` for JSON Schema extraction,
 * which supports Standard Schema compatible libraries. When libraries adopt
 * `~standard.jsonSchema` (Standard Schema v2), extraction can be simplified
 * to use that interface directly.
 */
import type { JSONObject, JSONSchema7 } from '@ai-sdk/provider';
import {
  asSchema,
  type Experimental_SandboxSession as SandboxSession,
  type InferToolSetContext,
  jsonSchema,
  type Tool,
} from '@ai-sdk/provider-utils';
import { dynamicTool, tool, type ToolSet } from 'ai';
import Ajv, { type ErrorObject } from 'ajv';
import Ajv2020 from 'ajv/dist/2020.js';

/**
 * Serializable tool definition — plain objects only, safe for workflow steps.
 */
export type SerializableToolDef = {
  title?: string;
  metadata?: JSONObject;
  description?: string;
  inputSchema: JSONSchema7;
  /** Whether providers should enforce strict tool input generation. */
  strict?: boolean;
  /** Input examples forwarded to providers that support them. */
  inputExamples?: Array<{ input: unknown }>;
  /** Provider-specific options attached to the tool definition. */
  providerOptions?: Tool['providerOptions'];
  /** Whether the original input schema has its own runtime validator. */
  hasOwnValidator?: boolean;
  /** Input lifecycle callbacks that must be invoked outside the step. */
  hasOnInputStart?: boolean;
  hasOnInputDelta?: boolean;
  hasOnInputAvailable?: boolean;
  /** Present on dynamic and provider tools. */
  type?: 'dynamic' | 'provider';
  /** Provider tool is executed by the provider. */
  isProviderExecuted?: boolean;
  /** Provider tool results may arrive in a later model response. */
  supportsDeferredResults?: boolean;
  /** Provider tool ID, e.g. 'anthropic.web_search_20250305'. */
  id?: `${string}.${string}`;
  /** Provider tool configuration args (maxUses, allowedDomains, etc.). */
  args?: Record<string, unknown>;
};

/**
 * Converts a ToolSet (with Zod/standard schemas and execute functions) to a
 * serializable record of tool definitions. Execution functions and callbacks
 * are stripped because they run outside the step.
 */
export function serializeToolSet<TOOLS extends ToolSet>(
  tools: TOOLS,
  {
    toolsContext = {} as InferToolSetContext<TOOLS>,
    experimental_sandbox: sandbox,
  }: {
    toolsContext?: InferToolSetContext<TOOLS>;
    experimental_sandbox?: SandboxSession;
  } = {},
): Record<string, SerializableToolDef> {
  return Object.fromEntries(
    Object.entries(tools).map(([name, t]) => {
      const inputSchema = asSchema(t.inputSchema);
      const def: SerializableToolDef = {
        title: t.title,
        metadata: t.metadata,
        description: resolveToolDescription({
          tool: t,
          toolName: name,
          toolsContext,
          experimental_sandbox: sandbox,
        }),
        inputSchema: inputSchema.jsonSchema as JSONSchema7,
        strict: t.strict,
        inputExamples: t.inputExamples,
        providerOptions: t.providerOptions,
      };

      if (inputSchema.validate != null) {
        def.hasOwnValidator = true;
      }

      if (t.type === 'dynamic') {
        def.type = 'dynamic';
      }
      if (t.onInputStart != null) {
        def.hasOnInputStart = true;
      }
      if (t.onInputDelta != null) {
        def.hasOnInputDelta = true;
      }
      if (t.onInputAvailable != null) {
        def.hasOnInputAvailable = true;
      }

      // Preserve provider tool identity so the Gateway can recognize
      // them as provider-executed tools (e.g. anthropic webSearch).
      if (t.type === 'provider') {
        def.type = 'provider';
        def.isProviderExecuted = t.isProviderExecuted ?? false;
        def.supportsDeferredResults = t.supportsDeferredResults;
        def.id = t.id;
        def.args = t.args;
      }

      return [name, def];
    }),
  );
}

function resolveToolDescription<TOOLS extends ToolSet>({
  tool,
  toolName,
  toolsContext,
  experimental_sandbox: sandbox,
}: {
  tool: Tool;
  toolName: string;
  toolsContext: InferToolSetContext<TOOLS>;
  experimental_sandbox?: SandboxSession;
}): string | undefined {
  return tool.description === undefined
    ? undefined
    : typeof tool.description === 'string'
      ? tool.description
      : tool.description({
          context: toolsContext[toolName as keyof InferToolSetContext<TOOLS>],
          experimental_sandbox: sandbox,
        });
}

function formatAjvError(error: ErrorObject): string {
  const path = `data${error.instancePath}`;

  switch (error.keyword) {
    case 'enum':
      return `${path} must be one of ${error.params.allowedValues
        .map((value: unknown) => JSON.stringify(value))
        .join(', ')}`;
    case 'additionalProperties':
      return `${path} has unexpected property ${JSON.stringify(
        error.params.additionalProperty,
      )}`;
    case 'const':
      return `${path} must equal ${JSON.stringify(error.params.allowedValue)}`;
    case 'required':
      return `${path} is missing required property ${JSON.stringify(
        error.params.missingProperty,
      )}`;
    default:
      return `${path} ${error.message ?? 'is invalid'}`;
  }
}

/**
 * Reconstructs tool objects from serializable tool definitions inside a step.
 *
 * Wraps each tool's JSON Schema with `jsonSchema()`. Tools without their own
 * validator are validated with Ajv. Tools with their own validator are
 * validated after the workflow step, where the original schema is available.
 */
export function resolveSerializableTools(
  tools: Record<string, SerializableToolDef>,
): ToolSet {
  const ajvOptions = {
    allErrors: true,
    strict: false,
    validateFormats: false,
  } as const;
  const ajv = new Ajv(ajvOptions);
  const ajv2020 = new Ajv2020(ajvOptions);

  const createValidatedInputSchema = (inputSchema: JSONSchema7) => {
    const schemaDialect =
      typeof inputSchema.$schema === 'string'
        ? inputSchema.$schema.replace(/#$/, '')
        : undefined;
    const schemaAjv =
      schemaDialect === 'https://json-schema.org/draft/2020-12/schema'
        ? ajv2020
        : ajv;
    const validateFn = schemaAjv.compile(inputSchema);

    return jsonSchema(inputSchema, {
      validate: value => {
        if (validateFn(value)) {
          return { success: true, value: value as any };
        }
        return {
          success: false,
          error: new Error(validateFn.errors!.map(formatAjvError).join(', ')),
        };
      },
    });
  };

  const createInputSchema = (tool: SerializableToolDef) =>
    tool.hasOwnValidator
      ? jsonSchema(tool.inputSchema)
      : createValidatedInputSchema(tool.inputSchema);

  return Object.fromEntries(
    Object.entries(tools).map(([name, t]) => {
      // Provider tools are executed server-side — pass them through
      // with their identity intact, no client-side validation needed.
      if (t.type === 'provider') {
        const providerTool = {
          type: 'provider' as const,
          title: t.title,
          metadata: t.metadata,
          id: t.id!,
          args: t.args ?? {},
          inputSchema: jsonSchema(t.inputSchema),
          providerOptions: t.providerOptions,
        };

        return [
          name,
          t.isProviderExecuted
            ? tool({
                ...providerTool,
                isProviderExecuted: true,
                supportsDeferredResults: t.supportsDeferredResults,
              })
            : tool({
                ...providerTool,
                isProviderExecuted: false,
              }),
        ];
      }

      if (t.type === 'dynamic') {
        return [
          name,
          dynamicTool({
            description: t.description,
            inputExamples: t.inputExamples,
            providerOptions: t.providerOptions,
            inputSchema: createInputSchema(t),
          }),
        ];
      }

      const functionTool = {
        title: t.title,
        metadata: t.metadata,
        description: t.description,
        strict: t.strict,
        inputExamples: t.inputExamples,
        providerOptions: t.providerOptions,
        inputSchema: createInputSchema(t),
      };

      return [
        name,
        t.type === 'dynamic'
          ? tool({ ...functionTool, type: 'dynamic' })
          : tool(functionTool),
      ];
    }),
  );
}
