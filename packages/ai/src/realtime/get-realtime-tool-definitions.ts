import { asSchema, type ToolSet } from '@ai-sdk/provider-utils';
import type { Experimental_RealtimeToolDefinition } from '../types/realtime-model';

export async function experimental_getRealtimeToolDefinitions({
  tools,
}: {
  tools: ToolSet;
}): Promise<Experimental_RealtimeToolDefinition[]> {
  const definitions: Experimental_RealtimeToolDefinition[] = [];

  for (const [name, tool] of Object.entries(tools)) {
    const toolType = tool.type;

    switch (toolType) {
      case undefined:
      case 'function':
      case 'dynamic': {
        const description =
          typeof tool.description === 'function'
            ? tool.description({ context: undefined as never })
            : tool.description;
        definitions.push({
          type: 'function',
          name,
          description,
          parameters: await asSchema(tool.inputSchema).jsonSchema,
        });
        break;
      }
      case 'provider':
        break;
      default: {
        const exhaustiveCheck: never = toolType as never;
        throw new Error(`Unsupported tool type: ${exhaustiveCheck}`);
      }
    }
  }

  return definitions;
}
