import {
  LanguageModelV4CallOptions,
  SharedV4Warning,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { jsonSchema } from '@ai-sdk/provider-utils';

export async function prepareTools({
  tools,
  toolChoice,
}: {
  tools: LanguageModelV4CallOptions['tools'];
  toolChoice?: LanguageModelV4CallOptions['toolChoice'];
}): {
  tools:
    | undefined
    | Array<{
        type: 'function';
        function: {
          name: string;
          description: string | undefined;
          parameters: unknown;
          strict?: boolean;
        };
      }>;
  toolChoice:
    | { type: 'function'; function: { name: string } }
    | 'auto'
    | 'none'
    | 'required'
    | undefined;
  toolWarnings: SharedV4Warning[];
} {
  // when the tools array is empty, change it to undefined to prevent errors:
  tools = tools?.length ? tools : undefined;

  const toolWarnings: SharedV4Warning[] = [];

  if (tools == null) {
    return { tools: undefined, toolChoice: undefined, toolWarnings };
  }

  const openaiCompatTools: Array<{
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
        feature: `provider-defined tool ${tool.id}`,
      });
    } else {
      const parameters =
        tool.inputSchema ??
        (await jsonSchema({
          type: 'object',
          properties: {},
          additionalProperties: false,
        }).jsonSchema);

      openaiCompatTools.push({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters,
          ...(tool.strict != null ? { strict: tool.strict } : {}),
        },
      });
    }
  }

  if (toolChoice == null) {
    return { tools: openaiCompatTools, toolChoice: undefined, toolWarnings };
  }

  const type = toolChoice.type;

  switch (type) {
    case 'auto':
    case 'none':
    case 'required':
      return { tools: openaiCompatTools, toolChoice: type, toolWarnings };
    case 'tool':
      return {
        tools: openaiCompatTools,
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
