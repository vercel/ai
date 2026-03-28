import { RealtimeToolDefinition } from '../types/realtime-model';
import { asSchema } from '@ai-sdk/provider-utils';
import { ToolSet } from '../generate-text/tool-set';

/**
 * Extracts JSON schema definitions from a ToolSet for use in a realtime
 * session. Returns an array of tool definitions that can be sent to the
 * browser and included in the session.update event.
 *
 * Use this in the GET handler of your tools endpoint.
 *
 * @example
 * ```ts
 * import { tool, getRealtimeToolDefinitions } from 'ai';
 * import { z } from 'zod';
 *
 * const tools = {
 *   getWeather: tool({
 *     description: 'Get weather for a city',
 *     parameters: z.object({ city: z.string() }),
 *     execute: async ({ city }) => ({ temp: 72 }),
 *   }),
 * };
 *
 * export async function GET() {
 *   const definitions = await getRealtimeToolDefinitions({ tools });
 *   return Response.json(definitions);
 * }
 * ```
 */
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
