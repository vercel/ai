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
import type {
  JSONObject,
  JSONSchema7,
  LanguageModelV4FunctionTool,
  LanguageModelV4ProviderTool,
} from '@ai-sdk/provider';
import {
  asSchema,
  type Experimental_SandboxSession as SandboxSession,
  type InferToolSetContext,
  jsonSchema,
  redactTelemetryValue,
  withTelemetryRedaction,
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
  /** Safe telemetry view retained when serialization drops redaction callbacks. */
  telemetryArgs?: Record<string, unknown>;
};

/**
 * Returns the tool definitions sent to the language model for serialized
 * tools, matching `prepareTools` in the model step. Map keys are the tool
 * names.
 */
export function toLanguageModelToolDefinitions(
  tools: Record<string, SerializableToolDef> | undefined,
):
  | Array<LanguageModelV4FunctionTool | LanguageModelV4ProviderTool>
  | undefined {
  if (tools == null || Object.keys(tools).length === 0) {
    return undefined;
  }

  return Object.entries(tools).map(([name, tool]) =>
    tool.type === 'provider'
      ? {
          type: 'provider' as const,
          name,
          id: tool.id!,
          args: resolveProviderToolArgs(tool),
        }
      : {
          type: 'function' as const,
          name,
          inputSchema: tool.inputSchema,
          ...(tool.description != null
            ? { description: tool.description }
            : {}),
          ...(tool.inputExamples != null
            ? {
                inputExamples:
                  tool.inputExamples as LanguageModelV4FunctionTool['inputExamples'],
              }
            : {}),
          ...(tool.providerOptions != null
            ? { providerOptions: tool.providerOptions }
            : {}),
          ...(tool.strict != null ? { strict: tool.strict } : {}),
        },
  );
}

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
        const telemetryArgs = redactTelemetryValue(t.args);
        if (telemetryArgs !== t.args) {
          // An unsuccessful redactor must not fall back to the raw arguments.
          def.telemetryArgs = telemetryArgs ?? {};
        }
      }

      return [name, def];
    }),
  );
}

function resolveProviderToolArgs(
  def: SerializableToolDef,
): Record<string, unknown> {
  const args = def.args ?? {};
  const telemetryArgs = def.telemetryArgs;
  return telemetryArgs == null
    ? args
    : withTelemetryRedaction(args, () => telemetryArgs);
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

const ajvOptions = {
  allErrors: true,
  strict: false,
  validateFormats: false,
} as const;

/**
 * Resolved tool sets, keyed by the serialized tool definitions.
 *
 * A workflow step rebuilds the tool set every time it runs, so unchanged
 * definitions arrive as new objects on every model step. Rebuilding them costs
 * Ajv a full schema traversal per tool per step, which dominates the time
 * between the step starting and the model call for agents with many
 * JSON-Schema tools.
 *
 * The whole tool set is cached rather than each compiled schema, because the
 * compiler instance is part of the result: tools in one call share it, so a
 * `$ref` in one tool resolves to another tool's `$id`, while a schema whose
 * `$id` stayed the same but whose body changed still needs a compiler that has
 * not seen it. A whole-set hit returns the tools built by the call that first
 * saw these definitions, which keeps both behaviours and touches Ajv not at
 * all.
 */
const resolvedToolSets = new Map<string, ToolSet>();

// A workflow that builds tool definitions dynamically would otherwise grow this
// map without bound. The cap is well above any realistic fixed tool set, so a
// steady-state run never evicts; going over it only costs a rebuild.
const RESOLVED_TOOL_SET_LIMIT = 1000;

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
  const key = JSON.stringify(tools);
  const cached = resolvedToolSets.get(key);
  if (cached != null) {
    return cached;
  }

  const resolved = buildSerializableTools(tools);
  if (resolvedToolSets.size >= RESOLVED_TOOL_SET_LIMIT) {
    resolvedToolSets.clear();
  }
  resolvedToolSets.set(key, resolved);
  return resolved;
}

function buildSerializableTools(
  tools: Record<string, SerializableToolDef>,
): ToolSet {
  // One compiler pair per call: Ajv registers what it compiles by `$id`, so
  // tools in the same set can reference each other, while a later call starts
  // from an empty registry and can compile a changed schema that kept its `$id`.
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
          args: resolveProviderToolArgs(t),
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
            title: t.title,
            metadata: t.metadata,
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
