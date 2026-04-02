import { RealtimeToolDefinition } from '../types/realtime-model';
import { asSchema } from '@ai-sdk/provider-utils';
import { ToolSet } from '../generate-text/tool-set';

export async function getRealtimeToolDefinitions({
  tools,
}: {
  tools: ToolSet;
}): Promise<RealtimeToolDefinition[]> {
  const definitions: RealtimeToolDefinition[] = [];

  for (const [name, tool] of Object.entries(tools)) {
    const toolType = tool.type;

    switch (toolType) {
      case undefined:
      case 'function':
      case 'dynamic': {
        definitions.push({
          type: 'function',
          name,
          description: tool.description,
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
