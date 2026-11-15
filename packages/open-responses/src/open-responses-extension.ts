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

export type OpenResponsesExtensionRecord<
  Type extends string = OpenResponsesNamespacedType,
> = JSONObject & {
  type: Type;
};

export type OpenResponsesExtensionItem<
  Type extends string = OpenResponsesNamespacedType,
> = OpenResponsesExtensionRecord<Type> & {
  id: string;
  status: string;
};

export type OpenResponsesExtensionEvent<
  Type extends string = OpenResponsesNamespacedType,
> = OpenResponsesExtensionRecord<Type> & {
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
interface OpenResponsesExtensionBase {
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
   * Encodes an AI SDK provider tool. Return `undefined` when its arguments
   * cannot be encoded. The adapter adds the registered tool type and omits a
   * specific tool choice that selects the omitted tool.
   */
  encodeTool?(options: {
    name: string;
    args: Record<string, unknown>;
  }): MaybePromiseLike<JSONObject | undefined>;

  /**
   * Encodes a specific `toolChoice`. The adapter adds the registered tool type.
   * The default is an object containing only that type.
   */
  encodeToolChoice?(options: {
    name: string;
    args: Record<string, unknown>;
  }): MaybePromiseLike<JSONObject | undefined>;
}

type OpenResponsesExtensionItemCodec<Type extends string> = {
  /**
   * Namespaced item types decoded by this extension. Must be provided together
   * with `decodeItem`.
   */
  itemTypes?: readonly OpenResponsesNamespacedType[];

  /**
   * Decodes a completed registered item into AI SDK content parts. The adapter
   * adds a custom replay part containing the original item and reference
   * metadata to the returned parts.
   */
  decodeItem?(options: {
    item: OpenResponsesExtensionItem<Type>;
    mode: 'generate' | 'stream';
  }): MaybePromiseLike<OpenResponsesExtensionContentPart[] | undefined>;

  /**
   * Encodes an AI SDK history part when no original wire item is available.
   * Every returned item must use one of the registered item types.
   */
  encodeInputItem?(options: {
    part: OpenResponsesExtensionInputPart;
    tool: LanguageModelV4ProviderTool;
  }): MaybePromiseLike<
    | OpenResponsesExtensionItem<Type>
    | OpenResponsesExtensionItem<Type>[]
    | undefined
  >;
};

type OpenResponsesExtensionEventCodec<Type extends string> = {
  /**
   * Namespaced streaming event types decoded by this extension. Must be
   * provided together with `decodeEvent`.
   */
  eventTypes?: readonly OpenResponsesNamespacedType[];

  /**
   * Decodes a registered streaming event.
   *
   * `state` persists for the lifetime of one response stream.
   */
  decodeEvent?(options: {
    event: OpenResponsesExtensionEvent<Type>;
    state: Map<string, unknown>;
  }): MaybePromiseLike<OpenResponsesExtensionStreamPart[] | undefined>;
};

/**
 * Defines a portable Open Responses extension using namespaced wire types.
 *
 * This remains an interface so existing consumers can extend it from their own
 * interfaces and implement it in classes.
 */
export interface OpenResponsesExtension
  extends
    OpenResponsesExtensionBase,
    OpenResponsesExtensionItemCodec<OpenResponsesNamespacedType>,
    OpenResponsesExtensionEventCodec<OpenResponsesNamespacedType> {
  allowBareTypes?: false;
  bareToolType?: undefined;
  bareItemTypes?: undefined;
  bareEventTypes?: undefined;
}

/**
 * Defines a non-portable Open Responses extension that explicitly registers
 * exact bare wire types.
 */
export type OpenResponsesBareExtension = OpenResponsesExtensionBase &
  OpenResponsesExtensionItemCodec<string> &
  OpenResponsesExtensionEventCodec<string> & {
    /**
     * Explicitly enables non-portable bare discriminator registration for this
     * extension.
     */
    allowBareTypes: true;

    /**
     * Exact non-namespaced tool type used by a documented implementation
     * extension. Must be provided together with `encodeTool` and cannot be used
     * together with `toolType`.
     */
    bareToolType?: string;

    /**
     * Exact non-namespaced item types decoded by a documented implementation
     * extension. Must be provided together with `decodeItem`.
     */
    bareItemTypes?: readonly string[];

    /**
     * Exact non-namespaced streaming event types decoded by this extension.
     * Must be provided together with `decodeEvent`.
     */
    bareEventTypes?: readonly string[];
  } & (
    | { bareToolType: string }
    | { bareItemTypes: readonly string[] }
    | { bareEventTypes: readonly string[] }
  );

export type OpenResponsesExtensionRegistration =
  | OpenResponsesExtension
  | OpenResponsesBareExtension;

export type OpenResponsesExtensionRegistry = {
  byEventType: Map<string, OpenResponsesEventExtension>;
  byExtensionId: Map<
    LanguageModelV4ProviderTool['id'],
    OpenResponsesExtensionRegistration
  >;
  byItemType: Map<string, OpenResponsesItemExtension>;
  byProviderToolId: Map<
    LanguageModelV4ProviderTool['id'],
    OpenResponsesToolExtension
  >;
  byToolType: Map<string, OpenResponsesToolExtension>;
};

type OpenResponsesToolExtension = OpenResponsesExtensionRegistration & {
  encodeTool: NonNullable<OpenResponsesExtensionRegistration['encodeTool']>;
  encodeInputItem?: (options: {
    part: OpenResponsesExtensionInputPart;
    tool: LanguageModelV4ProviderTool;
  }) => MaybePromiseLike<
    | OpenResponsesExtensionItem<string>
    | OpenResponsesExtensionItem<string>[]
    | undefined
  >;
};

type OpenResponsesItemExtension = OpenResponsesExtensionRegistration & {
  decodeItem(options: {
    item: OpenResponsesExtensionItem<string>;
    mode: 'generate' | 'stream';
  }): MaybePromiseLike<OpenResponsesExtensionContentPart[] | undefined>;
};

type OpenResponsesEventExtension = OpenResponsesExtensionRegistration & {
  decodeEvent(options: {
    event: OpenResponsesExtensionEvent<string>;
    state: Map<string, unknown>;
  }): MaybePromiseLike<OpenResponsesExtensionStreamPart[] | undefined>;
};

const coreToolTypes = new Set(['allowed_tools', 'function']);
const coreItemTypes = new Set([
  'function_call',
  'function_call_output',
  'item_reference',
  'message',
  'reasoning',
]);
const coreEventTypes = new Set([
  'error',
  'response.completed',
  'response.content_part.added',
  'response.content_part.done',
  'response.created',
  'response.failed',
  'response.function_call_arguments.delta',
  'response.function_call_arguments.done',
  'response.in_progress',
  'response.incomplete',
  'response.output_item.added',
  'response.output_item.done',
  'response.output_text.delta',
  'response.output_text.done',
  'response.reasoning_summary_part.added',
  'response.reasoning_summary_part.done',
  'response.reasoning_summary_text.delta',
  'response.reasoning_summary_text.done',
  'response.reasoning_text.delta',
  'response.refusal.delta',
  'response.refusal.done',
]);

export function createOpenResponsesExtensionRegistry(
  extensions?: readonly OpenResponsesExtensionRegistration[],
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

    const hasBareTypes =
      extension.bareToolType != null ||
      extension.bareItemTypes != null ||
      extension.bareEventTypes != null;
    if (hasBareTypes !== (extension.allowBareTypes === true)) {
      throw new Error(
        `Open Responses extension ${extension.id} must set allowBareTypes to true exactly when registering bare types.`,
      );
    }

    if (extension.toolType != null && extension.bareToolType != null) {
      throw new Error(
        `Open Responses extension ${extension.id} cannot provide toolType and bareToolType together.`,
      );
    }

    const toolType = extension.toolType ?? extension.bareToolType;
    const hasToolType = toolType != null;
    const hasToolEncoder = extension.encodeTool != null;
    if (hasToolType !== hasToolEncoder) {
      const typeField =
        extension.bareToolType != null ? 'bareToolType' : 'toolType';
      throw new Error(
        `Open Responses extension ${extension.id} must provide ${typeField} and encodeTool together.`,
      );
    }

    if (extension.encodeToolChoice != null && !hasToolEncoder) {
      throw new Error(
        `Open Responses extension ${extension.id} cannot provide encodeToolChoice without a tool type and encodeTool.`,
      );
    }

    if (hasToolType && hasToolEncoder) {
      const toolExtension = extension as OpenResponsesToolExtension;
      if (extension.toolType != null) {
        assertNamespacedType({
          extensionId: extension.id,
          namespace,
          type: extension.toolType,
          field: 'toolType',
        });
      } else {
        assertBareType({
          coreTypes: coreToolTypes,
          extensionId: extension.id,
          type: extension.bareToolType!,
          field: 'bareToolType',
        });
      }
      registerUnique({
        map: registry.byProviderToolId,
        key: extension.id,
        extension: toolExtension,
        field: 'provider-tool id',
      });
      registerUnique({
        map: registry.byToolType,
        key: toolType,
        extension: toolExtension,
        field: 'tool type',
      });
    }

    const itemTypes = [
      ...(extension.itemTypes ?? []),
      ...(extension.bareItemTypes ?? []),
    ];
    const hasItemTypes =
      extension.itemTypes != null || extension.bareItemTypes != null;
    const hasItemDecoder = extension.decodeItem != null;
    if (hasItemTypes !== hasItemDecoder) {
      throw new Error(
        `Open Responses extension ${extension.id} must provide itemTypes or bareItemTypes together with decodeItem.`,
      );
    }

    if (extension.encodeInputItem != null && !hasItemDecoder) {
      throw new Error(
        `Open Responses extension ${extension.id} cannot provide encodeInputItem without itemTypes or bareItemTypes and decodeItem.`,
      );
    }

    if (hasItemTypes && hasItemDecoder) {
      const itemExtension = extension as OpenResponsesItemExtension;
      if (itemTypes.length === 0) {
        throw new Error(
          `Open Responses extension ${extension.id} must register at least one item type.`,
        );
      }
      for (const itemType of extension.itemTypes ?? []) {
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
      for (const itemType of extension.bareItemTypes ?? []) {
        assertBareType({
          coreTypes: coreItemTypes,
          extensionId: extension.id,
          type: itemType,
          field: 'bareItemTypes',
        });
        registerUnique({
          map: registry.byItemType,
          key: itemType,
          extension: itemExtension,
          field: 'item type',
        });
      }
    }

    const eventTypes = [
      ...(extension.eventTypes ?? []),
      ...(extension.bareEventTypes ?? []),
    ];
    const hasEventTypes =
      extension.eventTypes != null || extension.bareEventTypes != null;
    const hasEventDecoder = extension.decodeEvent != null;
    if (hasEventTypes !== hasEventDecoder) {
      throw new Error(
        `Open Responses extension ${extension.id} must provide eventTypes or bareEventTypes together with decodeEvent.`,
      );
    }

    if (hasEventTypes && hasEventDecoder) {
      const eventExtension = extension as OpenResponsesEventExtension;
      if (eventTypes.length === 0) {
        throw new Error(
          `Open Responses extension ${extension.id} must register at least one event type.`,
        );
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
          extension: eventExtension,
          field: 'event type',
        });
      }
      for (const eventType of extension.bareEventTypes ?? []) {
        assertBareType({
          coreTypes: coreEventTypes,
          extensionId: extension.id,
          type: eventType,
          field: 'bareEventTypes',
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
  const separatorIndex = type.indexOf(':');
  if (separatorIndex <= 0 || type.slice(0, separatorIndex) !== namespace) {
    throw new Error(
      `Open Responses extension ${extensionId} has invalid ${field} value ${type}. Extension wire types must use the ${namespace}: namespace.`,
    );
  }
}

function assertBareType({
  coreTypes,
  extensionId,
  type,
  field,
}: {
  coreTypes: Set<string>;
  extensionId: string;
  type: string;
  field: string;
}) {
  if (type.length === 0 || type.includes(':')) {
    throw new Error(
      `Open Responses extension ${extensionId} has invalid ${field} value ${type}. Bare extension wire types must be non-empty and must not contain a colon.`,
    );
  }

  if (coreTypes.has(type)) {
    throw new Error(
      `Open Responses extension ${extensionId} cannot register core ${field} value ${type}.`,
    );
  }
}

export function getOpenResponsesExtensionItemTypes(
  extension: OpenResponsesExtensionRegistration,
): readonly string[] {
  return [...(extension.itemTypes ?? []), ...(extension.bareItemTypes ?? [])];
}

export function getOpenResponsesExtensionToolType(
  extension: OpenResponsesExtensionRegistration,
): string | undefined {
  return extension.toolType ?? extension.bareToolType;
}

/**
 * Keeps the internal API unions narrow enough to discriminate core wire types.
 * Bare records only reach this boundary after registry validation.
 */
export function asOpenResponsesExtensionRecord(
  value: OpenResponsesExtensionRecord<string>,
): OpenResponsesExtensionRecord {
  return value as OpenResponsesExtensionRecord;
}

function registerUnique<
  K,
  Extension extends OpenResponsesExtensionRegistration,
>({
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
): value is OpenResponsesExtensionRecord<string> {
  return (
    isOpenResponsesJSONObject(value) &&
    typeof (value as { type?: unknown }).type === 'string'
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
): value is OpenResponsesExtensionItem<string> {
  return (
    isOpenResponsesExtensionRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.status === 'string'
  );
}

export function isOpenResponsesExtensionEvent(
  value: unknown,
): value is OpenResponsesExtensionEvent<string> {
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
