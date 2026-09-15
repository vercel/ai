import { UnsupportedFunctionalityError } from '@ai-sdk/provider';
import { z } from 'zod/v4';
import type {
  OpenAIResponsesInput,
  OpenAIResponsesTool,
} from './openai-responses-api';

export const openaiResponsesToolResultOptionsSchema = z.object({
  additionalTools: z
    .array(
      z.strictObject({
        type: z.literal('function'),
        name: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
        description: z.string().optional(),
        parameters: z
          .object({
            type: z.literal('object'),
            properties: z
              .record(
                z.string(),
                z.union([z.boolean(), z.record(z.string(), z.json())]),
              )
              .optional(),
            required: z.array(z.string()).optional(),
            additionalProperties: z
              .union([z.boolean(), z.record(z.string(), z.json())])
              .optional(),
          })
          .catchall(z.json()),
        strict: z.boolean().optional(),
      }),
    )
    .min(1)
    .optional(),
});

/** Options on an ordinary function tool-result part in Responses history. */
export type OpenAIResponsesToolResultOptions = z.infer<
  typeof openaiResponsesToolResultOptionsSchema
>;

// Compare JSON objects independently of their property insertion order.
function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value != null && typeof value === 'object') {
    return `{${Object.entries(value)
      .filter(([, value]) => value !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${JSON.stringify(key)}:${canonicalize(value)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

/** Keep declarations at their original history position, never in both lists. */
export function omitHistoricalTools({
  input,
  tools,
}: {
  input: OpenAIResponsesInput;
  tools: OpenAIResponsesTool[] | undefined;
}): OpenAIResponsesTool[] | undefined {
  const historical = new Map<string, string>();
  for (const item of input) {
    if (!('type' in item) || item.type !== 'additional_tools') continue;
    for (const tool of item.tools) {
      const definition = canonicalize(tool);
      const previous = historical.get(tool.name);
      if (previous != null && previous !== definition) {
        throw new UnsupportedFunctionalityError({
          functionality: `Conflicting additionalTools definition for ${tool.name}`,
        });
      }
      historical.set(tool.name, definition);
    }
  }
  return tools?.filter(tool => {
    if (tool.type !== 'function' || !historical.has(tool.name)) return true;
    if (historical.get(tool.name) !== canonicalize(tool)) {
      throw new UnsupportedFunctionalityError({
        functionality: `Conflicting additionalTools definition for ${tool.name}`,
      });
    }
    return false;
  });
}
