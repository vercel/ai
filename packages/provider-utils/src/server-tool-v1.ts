import type { JSONSchema7, JSONSchema7Definition } from '@ai-sdk/provider';
import {
  createProviderExecutedToolFactory,
  type ProviderExecutedToolFactory,
} from './provider-executed-tool-factory';
import { asSchema, type FlexibleSchema } from './schema';
import type { Context } from './types/context';

/**
 * Error classification for a server tool call. A `ServerToolV1` adapter
 * classifies the failure; the host decides what to do with it (retry, surface
 * it to the model, count it against a budget).
 */
export type ServerToolErrorCode =
  | 'api_error'
  | 'configuration_error'
  | 'execution_error'
  | 'invalid_input'
  | 'rate_limit'
  | 'timeout';

/**
 * How the upstream call is authenticated. The tool names the scheme; the host
 * supplies the secret, so credentials never pass through the tool definition.
 */
export type ServerToolAuth =
  | { kind: 'header'; name: string }
  | { kind: 'bearer' };

/**
 * A description of the upstream HTTP call to make. Returned by
 * `adapter.buildRequest`, performed by the host.
 *
 * `url` must be within the tool's declared `origins`; the host is expected to
 * assert that before dispatching, so a buggy adapter cannot redirect a
 * credentialed request.
 */
export type ServerToolRequestPlan = {
  url: string;
  method: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: unknown;
  auth: ServerToolAuth;
};

/**
 * Billable quantities observed on a successful call. Dimensions only — a
 * `ServerToolV1` never carries prices, which are the host's business policy.
 */
export type ServerToolUsage = {
  /**
   * Results actually returned.
   */
  resultCount?: number;

  /**
   * Results the caller asked for. Billing basis for per-result pricing, which
   * is normally charged on the requested count rather than the returned one.
   */
  requestedResults?: number;

  /**
   * Vendor-reported passthrough or effort surcharge, in USD.
   */
  vendorCostUsd?: number;
};

/**
 * The upstream response, normalized so that adapters stay free of `fetch`.
 */
export type ServerToolResponse = {
  status: number;
  statusText: string;

  /**
   * Parsed JSON body, or the raw text when the body was not valid JSON.
   */
  body: unknown;

  header: (name: string) => string | undefined;
};

export type ServerToolOutcome<OUTPUT> =
  | { ok: true; output: OUTPUT; usage?: ServerToolUsage }
  | {
      ok: false;
      error: ServerToolErrorCode;
      message: string;

      /**
       * Value of a `retry-after` style header, when the vendor sent one.
       */
      retryAfter?: string;
    };

export type ServerToolBillingDimension =
  | 'calls'
  | 'requestedResults'
  | 'vendorCostUsd';

/**
 * The tool as the model sees it. The JSON Schema is derived from
 * `inputSchema`; this supplies the prose and the vendor-level defaults that
 * validation constraints do not carry.
 */
export type ServerToolModelFacing = {
  /**
   * Tool description shown to the model.
   */
  description: string;

  /**
   * Per-field overlay applied to the derived JSON Schema, keyed by dotted
   * property path (e.g. `'contents.max_age_hours'`).
   *
   * Use this for model-facing wording that should differ from the validation
   * schema's own description, and for documenting the *vendor's* default value
   * — a fact about the upstream API rather than a constraint on input.
   */
  annotations?: Record<string, { description?: string; default?: unknown }>;

  /**
   * Dotted property paths to remove from the model-facing schema. Use it for
   * developer-only configuration the model must not be able to set.
   */
  hiddenFields?: readonly string[];
};

/**
 * The tool-specific half of execution: two pure functions. No `fetch`, no
 * credentials, no clock, no logger, no telemetry — everything with a side
 * effect belongs to the host.
 */
export type ServerToolAdapter<INPUT, OUTPUT> = {
  /**
   * Maps validated input to an upstream request.
   */
  buildRequest: (input: INPUT) => ServerToolRequestPlan;

  /**
   * Classifies and maps an upstream response. Must not throw.
   *
   * Receives the validated input as well, because some billable quantities are
   * properties of the request rather than the response — per-result pricing is
   * charged on the count asked for, which a truncated response does not show.
   */
  parseResponse: (
    response: ServerToolResponse,
    input: INPUT,
  ) => ServerToolOutcome<OUTPUT>;
};

/**
 * Specification for a tool executed by a service the caller controls, rather
 * than by the model provider — an AI gateway, a self-hosted proxy, or the
 * developer's own server.
 *
 * This is deliberately not a spec for provider-executed tools such as
 * `openai.tools.webSearch()`: those run inside the inference call, so there is
 * no separate request to describe. It is also not needed for client-executed
 * provider tools such as `anthropic.tools.bash_20250124()`, which already ship
 * a default `execute` against an injected sandbox.
 *
 * A `ServerToolV1` is pure data plus two pure functions, so one definition can
 * serve three consumers: a client declaring the tool (via
 * `createServerToolFactory`), a server executing it, and a test asserting the
 * contract.
 */
export interface ServerToolV1<INPUT = any, OUTPUT = any> {
  /**
   * Spec version this definition implements.
   */
  readonly specificationVersion: 'server-tool-v1';

  /**
   * Wire identity, `<namespace>.<tool>` — the same shape the provider tool
   * factories take, and what appears in `LanguageModelV*ProviderTool.id`.
   */
  readonly id: `${string}.${string}`;

  /**
   * Upstream vendor slug. Hosts use it as the credential scope and as the
   * `provider` dimension in telemetry.
   */
  readonly vendor: string;

  /**
   * Incremented when the contract changes in a way an already-deployed host
   * would observe. Within one `contractVersion`, changes must be additive:
   * new optional fields and widened constraints, never new required fields or
   * tightened ones.
   */
  readonly contractVersion: number;

  /**
   * Origins (`https://host`) that `buildRequest` may target. Lets a host
   * enforce egress policy without reading adapter code.
   */
  readonly origins: readonly string[];

  /**
   * Model-facing input — what the model emits, and what the host validates.
   */
  readonly inputSchema: FlexibleSchema<INPUT>;

  /**
   * Tool result — what the client validates.
   */
  readonly outputSchema: FlexibleSchema<OUTPUT>;

  readonly modelFacing: ServerToolModelFacing;

  /**
   * How developer configuration keys map onto `inputSchema` keys.
   *
   * - `'snake_case'` (default): deep camelCase-to-snake_case conversion, which
   *   is the convention gap between AI SDK configuration and most vendor APIs.
   * - `'preserve'`: keys are already identical.
   */
  readonly configKeyCase?: 'snake_case' | 'preserve';

  /**
   * Input keys where models commonly emit `''` or `null` instead of omitting
   * the field. Hosts should drop those values before validation so that schema
   * defaults apply.
   */
  readonly lenientFields?: readonly string[];

  readonly adapter: ServerToolAdapter<INPUT, OUTPUT>;

  /**
   * Quantities this tool can be billed on. Never prices.
   */
  readonly billingDimensions?: readonly ServerToolBillingDimension[];
}

/**
 * Wraps a `ServerToolV1` as a provider-executed tool factory, so that a client
 * can declare the tool without pulling in execution concerns.
 *
 * The result is identical to calling `createProviderExecutedToolFactory` with
 * the same id and schemas: adopting the spec does not change the wire format.
 */
export function createServerToolFactory<
  INPUT,
  OUTPUT,
  CONFIG extends object,
  CONTEXT extends Context = {},
>(
  serverTool: ServerToolV1<INPUT, OUTPUT>,
): ProviderExecutedToolFactory<INPUT, OUTPUT, CONFIG, CONTEXT> {
  return createProviderExecutedToolFactory<INPUT, OUTPUT, CONFIG, CONTEXT>({
    id: serverTool.id,
    inputSchema: serverTool.inputSchema,
    outputSchema: serverTool.outputSchema,
  });
}

function toSnakeCase(key: string): string {
  return key.replace(/[A-Z]/g, character => `_${character.toLowerCase()}`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function convertKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(convertKeysDeep);
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const result: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    result[toSnakeCase(key)] = convertKeysDeep(nested);
  }
  return result;
}

/**
 * Converts developer configuration into the tool's input key convention.
 *
 * Hosts use this to translate the `args` carried on a provider tool into values
 * that can be merged with, and validated against, `inputSchema`.
 */
export function mapServerToolConfig(
  serverTool: Pick<ServerToolV1, 'configKeyCase'>,
  config: Record<string, unknown> | undefined | null,
): Record<string, unknown> {
  if (config == null) {
    return {};
  }

  if (serverTool.configKeyCase === 'preserve') {
    return { ...config };
  }

  return convertKeysDeep(config) as Record<string, unknown>;
}

function isSchemaObject(value: JSONSchema7Definition): value is JSONSchema7 {
  return typeof value === 'object' && value !== null;
}

/**
 * Walks to the schema node holding `path`'s final segment, treating each
 * non-final segment as an object property. Returns `undefined` when the path
 * does not resolve, so an annotation for a renamed field is inert rather than
 * fatal.
 */
function resolveParent(
  schema: JSONSchema7,
  path: readonly string[],
): JSONSchema7 | undefined {
  let node: JSONSchema7 = schema;

  for (const segment of path) {
    const next = node.properties?.[segment];
    if (next == null || !isSchemaObject(next)) {
      return undefined;
    }
    node = next;
  }

  return node;
}

/**
 * Materializes the tool definition the model sees: JSON Schema derived from
 * `inputSchema`, with `hiddenFields` removed and `annotations` overlaid.
 *
 * Deriving rather than hand-authoring is the point — it makes it impossible for
 * the schema the model is shown to drift from the schema its output is
 * validated against.
 */
export async function resolveServerToolModelSchema(
  serverTool: Pick<ServerToolV1, 'inputSchema' | 'modelFacing'>,
): Promise<{ description: string; inputSchema: JSONSchema7 }> {
  const derived = await asSchema(serverTool.inputSchema).jsonSchema;
  const inputSchema = structuredClone(derived) as JSONSchema7;
  const { description, annotations, hiddenFields } = serverTool.modelFacing;

  for (const field of hiddenFields ?? []) {
    const segments = field.split('.');
    const leaf = segments.at(-1);
    const parent = resolveParent(inputSchema, segments.slice(0, -1));
    if (leaf == null || parent?.properties == null) {
      continue;
    }
    delete parent.properties[leaf];
    if (Array.isArray(parent.required)) {
      parent.required = parent.required.filter(name => name !== leaf);
    }
  }

  for (const [field, annotation] of Object.entries(annotations ?? {})) {
    const segments = field.split('.');
    const leaf = segments.at(-1);
    const parent = resolveParent(inputSchema, segments.slice(0, -1));
    const target = leaf == null ? undefined : parent?.properties?.[leaf];
    if (target == null || !isSchemaObject(target)) {
      continue;
    }
    if (annotation.description !== undefined) {
      target.description = annotation.description;
    }
    if (annotation.default !== undefined) {
      target.default = annotation.default as JSONSchema7['default'];
    }
  }

  return { description, inputSchema };
}
