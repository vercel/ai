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
 * Defines how the provider encodes and decodes an Open Responses extension.
 *
 * Tool, item, and event codecs can be registered independently.
 */
export interface OpenResponsesExtension {
  /**
   * Extension ID in `<implementor>.<extension>` format. For extensions that
   * encode a provider tool, this is also the AI SDK provider-tool ID.
   */
  id: LanguageModelV4ProviderTool['id'];

  /**
   * Namespaced Open Responses tool type, in `<implementor>:<tool>` format.
   * Must be provided together with `encodeTool`.
   */
  toolType?: OpenResponsesNamespacedType;

  /**
   * Namespaced item types decoded by this extension. Must be provided together
   * with `decodeItem`.
   */
  itemTypes?: readonly OpenResponsesNamespacedType[];

  /**
   * Namespaced streaming event types decoded by this extension. Must be
   * provided together with `decodeEvent`.
   */
  eventTypes?: readonly OpenResponsesNamespacedType[];

  /**
   * Encodes an AI SDK provider tool. Return `undefined` when its arguments
   * cannot be encoded. The adapter adds `toolType` and omits a specific tool
   * choice that selects the omitted tool.
   */
  encodeTool?(options: {
    name: string;
    args: Record<string, unknown>;
  }): MaybePromiseLike<JSONObject | undefined>;

  /**
   * Encodes a specific `toolChoice`. The adapter adds `toolType`. The default
   * is an object containing only `toolType`.
   */
  encodeToolChoice?(options: {
    name: string;
    args: Record<string, unknown>;
  }): MaybePromiseLike<JSONObject | undefined>;

  /**
   * Decodes a completed namespaced item into AI SDK content parts. The adapter
   * adds a custom replay part containing the original item and reference
   * metadata to the returned parts.
   */
  decodeItem?(options: {
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
   * Decodes a namespaced streaming event.
   *
   * `state` persists for the lifetime of one response stream.
   */
  decodeEvent?(options: {
    event: OpenResponsesExtensionEvent;
    state: Map<string, unknown>;
  }): MaybePromiseLike<OpenResponsesExtensionStreamPart[] | undefined>;
}

export type OpenResponsesExtensionRegistry = {
  byEventType: Map<OpenResponsesNamespacedType, OpenResponsesEventExtension>;
  byExtensionId: Map<LanguageModelV4ProviderTool['id'], OpenResponsesExtension>;
  byItemType: Map<OpenResponsesNamespacedType, OpenResponsesItemExtension>;
  byProviderToolId: Map<
    LanguageModelV4ProviderTool['id'],
    OpenResponsesToolExtension
  >;
  byToolType: Map<OpenResponsesNamespacedType, OpenResponsesToolExtension>;
};

type OpenResponsesToolExtension = OpenResponsesExtension & {
  toolType: OpenResponsesNamespacedType;
  encodeTool: NonNullable<OpenResponsesExtension['encodeTool']>;
};

type OpenResponsesItemExtension = OpenResponsesExtension & {
  itemTypes: readonly OpenResponsesNamespacedType[];
  decodeItem: NonNullable<OpenResponsesExtension['decodeItem']>;
};

type OpenResponsesEventExtension = OpenResponsesExtension & {
  eventTypes: readonly OpenResponsesNamespacedType[];
  decodeEvent: NonNullable<OpenResponsesExtension['decodeEvent']>;
};

export function createOpenResponsesExtensionRegistry(
  extensions?: readonly OpenResponsesExtension[],
): OpenResponsesExtensionRegistry {
  const registry: OpenResponsesExtensionRegistry = {
    byEventType: new Map(),
    byExtensionId: new Map(),
    byItemType: new Map(),
    byProviderToolId: new Map(),
    byToolType: new Map(),
  };

  for (const extension of extensions ?? []) {
    const namespaceSeparatorIndex = extension.id.indexOf('.');
    if (namespaceSeparatorIndex <= 0) {
      throw new Error(
        `Open Responses extension ID ${extension.id} must use <implementor>.<extension> format.`,
      );
    }
    const namespace = extension.id.slice(0, namespaceSeparatorIndex);

    registerUnique({
      map: registry.byExtensionId,
      key: extension.id,
      extension,
      field: 'id',
    });

    const hasToolType = extension.toolType != null;
    const hasToolEncoder = extension.encodeTool != null;
    if (hasToolType !== hasToolEncoder) {
      throw new Error(
        `Open Responses extension ${extension.id} must provide toolType and encodeTool together.`,
      );
    }

    if (extension.encodeToolChoice != null && !hasToolEncoder) {
      throw new Error(
        `Open Responses extension ${extension.id} cannot provide encodeToolChoice without toolType and encodeTool.`,
      );
    }

    if (hasToolType && hasToolEncoder) {
      const toolExtension = extension as OpenResponsesToolExtension;
      assertNamespacedType({
        extensionId: extension.id,
        namespace,
        type: toolExtension.toolType,
        field: 'toolType',
      });
      registerUnique({
        map: registry.byProviderToolId,
        key: extension.id,
        extension: toolExtension,
        field: 'provider-tool id',
      });
      registerUnique({
        map: registry.byToolType,
        key: toolExtension.toolType,
        extension: toolExtension,
        field: 'toolType',
      });
    }

    const hasItemTypes = extension.itemTypes != null;
    const hasItemDecoder = extension.decodeItem != null;
    if (hasItemTypes !== hasItemDecoder) {
      throw new Error(
        `Open Responses extension ${extension.id} must provide itemTypes and decodeItem together.`,
      );
    }

    if (extension.encodeInputItem != null && !hasItemDecoder) {
      throw new Error(
        `Open Responses extension ${extension.id} cannot provide encodeInputItem without itemTypes and decodeItem.`,
      );
    }

    if (hasItemTypes && hasItemDecoder) {
      const itemExtension = extension as OpenResponsesItemExtension;
      if (itemExtension.itemTypes.length === 0) {
        throw new Error(
          `Open Responses extension ${extension.id} must register at least one item type.`,
        );
      }
      for (const itemType of itemExtension.itemTypes) {
        assertNamespacedType({
          extensionId: extension.id,
          namespace,
          type: itemType,
          field: 'itemTypes',
        });
        registerUnique({
          map: registry.byItemType,
          key: itemType,
          extension: itemExtension,
          field: 'item type',
        });
      }
    }

    const hasEventTypes = extension.eventTypes != null;
    const hasEventDecoder = extension.decodeEvent != null;
    if (hasEventTypes !== hasEventDecoder) {
      throw new Error(
        `Open Responses extension ${extension.id} must provide eventTypes and decodeEvent together.`,
      );
    }

    if (hasEventTypes && hasEventDecoder) {
      const eventExtension = extension as OpenResponsesEventExtension;
      if (eventExtension.eventTypes.length === 0) {
        throw new Error(
          `Open Responses extension ${extension.id} must register at least one event type.`,
        );
      }
      for (const eventType of eventExtension.eventTypes) {
        assertNamespacedType({
          extensionId: extension.id,
          namespace,
          type: eventType,
          field: 'eventTypes',
        });
        registerUnique({
          map: registry.byEventType,
          key: eventType,
          extension: eventExtension,
          field: 'event type',
        });
      }
    }

    if (!hasToolEncoder && !hasItemDecoder && !hasEventDecoder) {
      throw new Error(
        `Open Responses extension ${extension.id} must register a tool, item, or event capability.`,
      );
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

function registerUnique<K, Extension extends OpenResponsesExtension>({
  map,
  key,
  extension,
  field,
}: {
  map: Map<K, Extension>;
  key: K;
  extension: Extension;
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
