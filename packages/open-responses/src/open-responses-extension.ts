import type {
  JSONObject,
  LanguageModelV4Content,
  LanguageModelV4ProviderTool,
  LanguageModelV4StreamPart,
  LanguageModelV4ToolCallPart,
  LanguageModelV4ToolResultPart,
} from '@ai-sdk/provider';
import type { MaybePromiseLike } from '@ai-sdk/provider-utils';

export type OpenResponsesNamespacedType = `${string}:${string}`;

export type OpenResponsesExtensionRecord = JSONObject & {
  type: OpenResponsesNamespacedType;
};

export type OpenResponsesExtensionItem = OpenResponsesExtensionRecord & {
  id: string;
  status: string;
};

export type OpenResponsesExtensionEvent = OpenResponsesExtensionRecord & {
  sequence_number: number;
};

export type OpenResponsesExtensionInputPart =
  | LanguageModelV4ToolCallPart
  | LanguageModelV4ToolResultPart;

export type OpenResponsesExtensionContentPart = Extract<
  LanguageModelV4Content,
  LanguageModelV4StreamPart
>;

export type OpenResponsesExtensionStreamPart = Exclude<
  LanguageModelV4StreamPart,
  {
    type: 'error' | 'finish' | 'raw' | 'response-metadata' | 'stream-start';
  }
>;

/**
 * Codec for an explicitly registered, implementation-specific Open Responses
 * tool and its namespaced items and streaming events.
 */
export interface OpenResponsesExtension {
  /**
   * AI SDK provider-tool ID, in `<implementor>.<tool>` format.
   */
  id: LanguageModelV4ProviderTool['id'];

  /**
   * Namespaced Open Responses tool type, in `<implementor>:<tool>` format.
   */
  toolType: OpenResponsesNamespacedType;

  /**
   * Namespaced item types decoded by this extension.
   */
  itemTypes: readonly OpenResponsesNamespacedType[];

  /**
   * Namespaced streaming event types decoded by this extension.
   */
  eventTypes?: readonly OpenResponsesNamespacedType[];

  /**
   * Whether tool calls decoded by this extension are executed by the endpoint.
   */
  providerExecuted: boolean;

  /**
   * Encodes a registered AI SDK provider tool. Return `undefined` when the
   * supplied arguments cannot be encoded. The adapter adds `toolType`.
   */
  encodeTool(options: {
    name: string;
    args: Record<string, unknown>;
  }): MaybePromiseLike<JSONObject | undefined>;

  /**
   * Optionally encodes a specific `toolChoice` for this extension. The adapter
   * adds `toolType`. Defaults to an object containing only `toolType`.
   */
  encodeToolChoice?(options: {
    name: string;
    args: Record<string, unknown>;
  }): MaybePromiseLike<JSONObject | undefined>;

  /**
   * Decodes a completed namespaced item into AI SDK content parts.
   */
  decodeItem(options: {
    item: OpenResponsesExtensionItem;
    mode: 'generate' | 'stream';
  }): MaybePromiseLike<OpenResponsesExtensionContentPart[] | undefined>;

  /**
   * Encodes an AI SDK history part when no original wire item is available.
   * Every returned item must use one of `itemTypes`.
   */
  encodeInputItem?(options: {
    part: OpenResponsesExtensionInputPart;
    tool: LanguageModelV4ProviderTool;
  }): MaybePromiseLike<
    OpenResponsesExtensionItem | OpenResponsesExtensionItem[] | undefined
  >;

  /**
   * Decodes a registered namespaced streaming event.
   *
   * `state` is unique to the response stream and can be used to accumulate
   * extension-specific deltas.
   */
  decodeEvent?(options: {
    event: OpenResponsesExtensionEvent;
    state: Map<string, unknown>;
  }): MaybePromiseLike<OpenResponsesExtensionStreamPart[] | undefined>;
}

export type OpenResponsesExtensionRegistry = {
  byEventType: Map<OpenResponsesNamespacedType, OpenResponsesExtension>;
  byId: Map<LanguageModelV4ProviderTool['id'], OpenResponsesExtension>;
  byItemType: Map<OpenResponsesNamespacedType, OpenResponsesExtension>;
  byToolType: Map<OpenResponsesNamespacedType, OpenResponsesExtension>;
};

export function createOpenResponsesExtensionRegistry(
  extensions?: readonly OpenResponsesExtension[],
): OpenResponsesExtensionRegistry {
  const registry: OpenResponsesExtensionRegistry = {
    byEventType: new Map(),
    byId: new Map(),
    byItemType: new Map(),
    byToolType: new Map(),
  };

  for (const extension of extensions ?? []) {
    const namespace = extension.id.slice(0, extension.id.indexOf('.'));

    assertNamespacedType({
      extensionId: extension.id,
      namespace,
      type: extension.toolType,
      field: 'toolType',
    });

    registerUnique({
      map: registry.byId,
      key: extension.id,
      extension,
      field: 'id',
    });
    registerUnique({
      map: registry.byToolType,
      key: extension.toolType,
      extension,
      field: 'toolType',
    });

    for (const itemType of extension.itemTypes) {
      assertNamespacedType({
        extensionId: extension.id,
        namespace,
        type: itemType,
        field: 'itemTypes',
      });
      registerUnique({
        map: registry.byItemType,
        key: itemType,
        extension,
        field: 'item type',
      });
    }

    for (const eventType of extension.eventTypes ?? []) {
      assertNamespacedType({
        extensionId: extension.id,
        namespace,
        type: eventType,
        field: 'eventTypes',
      });
      registerUnique({
        map: registry.byEventType,
        key: eventType,
        extension,
        field: 'event type',
      });
    }
  }

  return registry;
}

function assertNamespacedType({
  extensionId,
  namespace,
  type,
  field,
}: {
  extensionId: string;
  namespace: string;
  type: string;
  field: string;
}) {
  if (!type.includes(':') || type.slice(0, type.indexOf(':')) !== namespace) {
    throw new Error(
      `Open Responses extension ${extensionId} has invalid ${field} value ${type}. Extension wire types must use the ${namespace}: namespace.`,
    );
  }
}

function registerUnique<K>({
  map,
  key,
  extension,
  field,
}: {
  map: Map<K, OpenResponsesExtension>;
  key: K;
  extension: OpenResponsesExtension;
  field: string;
}) {
  const existing = map.get(key);
  if (existing != null) {
    throw new Error(
      `Open Responses extension ${extension.id} cannot register ${field} ${String(key)} because it is already registered by ${existing.id}.`,
    );
  }
  map.set(key, extension);
}

export function isOpenResponsesNamespacedType(
  value: unknown,
): value is OpenResponsesNamespacedType {
  return typeof value === 'string' && value.includes(':');
}

export function isOpenResponsesExtensionRecord(
  value: unknown,
): value is OpenResponsesExtensionRecord {
  return (
    isOpenResponsesJSONObject(value) &&
    isOpenResponsesNamespacedType((value as { type?: unknown }).type)
  );
}

export function isOpenResponsesJSONObject(value: unknown): value is JSONObject {
  return (
    value != null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype &&
    Object.values(value).every(isOpenResponsesJSONValue)
  );
}

export function isOpenResponsesExtensionItem(
  value: unknown,
): value is OpenResponsesExtensionItem {
  return (
    isOpenResponsesExtensionRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.status === 'string'
  );
}

export function isOpenResponsesExtensionEvent(
  value: unknown,
): value is OpenResponsesExtensionEvent {
  return (
    isOpenResponsesExtensionRecord(value) &&
    typeof value.sequence_number === 'number'
  );
}

function isOpenResponsesJSONValue(value: unknown): boolean {
  if (
    value == null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(isOpenResponsesJSONValue);
  }

  return isOpenResponsesJSONObject(value);
}
