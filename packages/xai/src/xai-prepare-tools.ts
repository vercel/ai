import {
  JSONSchema7,
  LanguageModelV4CallOptions,
  SharedV4Warning,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { XaiToolChoice } from './xai-chat-prompt';

export function prepareTools({
  tools,
  toolChoice,
}: {
  tools: LanguageModelV4CallOptions['tools'];
  toolChoice?: LanguageModelV4CallOptions['toolChoice'];
}): {
  tools:
    | Array<{
        type: 'function';
        function: {
          name: string;
          description: string | undefined;
          parameters: unknown;
          strict?: boolean;
        };
      }>
    | undefined;
  toolChoice: XaiToolChoice | undefined;
  toolWarnings: SharedV4Warning[];
} {
  // when the tools array is empty, change it to undefined to prevent errors
  tools = tools?.length ? tools : undefined;

  const toolWarnings: SharedV4Warning[] = [];

  if (tools == null) {
    return { tools: undefined, toolChoice: undefined, toolWarnings };
  }

  // convert ai sdk tools to xai format
  const xaiTools: Array<{
    type: 'function';
    function: {
      name: string;
      description: string | undefined;
      parameters: unknown;
      strict?: boolean;
    };
  }> = [];

  for (const tool of tools) {
    if (tool.type === 'provider') {
      toolWarnings.push({
        type: 'unsupported',
        feature: `provider-defined tool ${tool.name}`,
      });
    } else {
      xaiTools.push({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: removeAdditionalProperties(tool.inputSchema as JSONSchema7),
          ...(tool.strict != null ? { strict: tool.strict } : {}),
        },
      });
    }
  }

  if (toolChoice == null) {
    return { tools: xaiTools, toolChoice: undefined, toolWarnings };
  }

  const type = toolChoice.type;

  switch (type) {
    case 'auto':
    case 'none':
      return { tools: xaiTools, toolChoice: type, toolWarnings };
    case 'required':
      // xai supports 'required' directly
      return { tools: xaiTools, toolChoice: 'required', toolWarnings };
    case 'tool':
      // xai supports specific tool selection
      return {
        tools: xaiTools,
        toolChoice: {
          type: 'function',
          function: { name: toolChoice.toolName },
        },
        toolWarnings,
      };
    default: {
      const _exhaustiveCheck: never = type;
      throw new UnsupportedFunctionalityError({
        functionality: `tool choice type: ${_exhaustiveCheck}`,
      });
    }
  }
}

/**
 * xAI rejects schemas containing `additionalProperties: false` because it
 * treats `false` as an unsupported boolean property schema.  The AI SDK's
 * `addAdditionalPropertiesToJsonSchema` adds this field globally, so we
 * strip it here before sending to xAI.
 *
 * @see https://docs.x.ai/docs/guides/structured-outputs
 */
export function removeAdditionalProperties(schema: JSONSchema7): JSONSchema7 {
  if (schema == null || typeof schema !== 'object') {
    return schema;
  }

  const result = { ...schema };

  if ('additionalProperties' in result) {
    delete result.additionalProperties;
  }

  if (result.properties != null) {
    result.properties = Object.fromEntries(
      Object.entries(result.properties).map(([key, value]) => [
        key,
        typeof value === 'object' && value !== null
          ? removeAdditionalProperties(value as JSONSchema7)
          : value,
      ]),
    );
  }

  if (result.items != null) {
    result.items = Array.isArray(result.items)
      ? result.items.map(item =>
          typeof item === 'object' && item !== null
            ? removeAdditionalProperties(item as JSONSchema7)
            : item,
        )
      : typeof result.items === 'object' && result.items !== null
        ? removeAdditionalProperties(result.items as JSONSchema7)
        : result.items;
  }

  for (const keyword of ['anyOf', 'allOf', 'oneOf'] as const) {
    if (result[keyword] != null) {
      result[keyword] = (result[keyword] as JSONSchema7[]).map(s =>
        typeof s === 'object' && s !== null
          ? removeAdditionalProperties(s as JSONSchema7)
          : s,
      );
    }
  }

  if (result.definitions != null) {
    result.definitions = Object.fromEntries(
      Object.entries(result.definitions).map(([key, value]) => [
        key,
        typeof value === 'object' && value !== null
          ? removeAdditionalProperties(value as JSONSchema7)
          : value,
      ]),
    );
  }

  return result;
}
