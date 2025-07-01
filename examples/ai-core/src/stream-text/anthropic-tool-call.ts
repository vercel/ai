import { ModelMessage, streamText } from 'ai';
import 'dotenv/config';
import { tool } from 'ai';
import { z as zodV3 } from 'zod';
import { z as zodV4 } from 'zod/v4';
import { anthropic } from '@ai-sdk/anthropic';
import { bedrock } from '@ai-sdk/amazon-bedrock';
import { ToolCallPart, ToolResultPart } from 'ai';

// streamText fails IFF:
// - We use the Anthropic provider directly (IS_BEDROCK = false) AND
// - We use zod v3 (ZOD_VERSION = "v3") AND
// - Our input schema has a nullable field (IS_NULLABLE = true)
// Quick fix = use zod v4. But, need to debug the Anthropic provider as Bedrock works fine.
const IS_BEDROCK = false;
const IS_NULLABLE = true;
const ZOD_VERSION: "v3" | "v4" = "v4";

const getWeatherTool = (isNullable: boolean, z: typeof zodV3 | typeof zodV4) => tool({
    description: 'Get the weather in a location',
    // @ts-ignore type error from different zod versions
    inputSchema: z.object({
        location: isNullable
            ? z.string().nullable().describe('The location to get the weather for')
            : z.string().describe('The location to get the weather for'),
    }),
    // location below is inferred to be a string:
    execute: async ({ location }) => ({
        location,
        temperature: 72 + Math.floor(Math.random() * 21) - 10,
    }),
});

const messages: ModelMessage[] = [];

async function main() {
    let toolResponseAvailable = false;

    const result = streamText({
        model: IS_BEDROCK ? bedrock('us.anthropic.claude-sonnet-4-20250514-v1:0') : anthropic('claude-4-sonnet-20250514'),
        maxOutputTokens: 512,
        tools: {
            // @ts-ignore type error from different zod versions
            weather: getWeatherTool(IS_NULLABLE, ZOD_VERSION === "v3" ? zodV3 : zodV4),
        },
        prompt:
            'What is the weather in San Francisco and what attractions should I visit?',
    });

    let fullResponse = '';
    const toolCalls: ToolCallPart[] = [];
    const toolResponses: ToolResultPart[] = [];

    for await (const delta of result.fullStream) {
        switch (delta.type) {
            case 'text': {
                fullResponse += delta.text;
                break;
            }

            case 'tool-call': {
                toolCalls.push(delta);

                process.stdout.write(
                    `\nTool call: '${delta.toolName}' ${JSON.stringify(delta.input)}`,
                );
                break;
            }

            case 'tool-result': {
                // Transform to new format
                const transformedDelta: ToolResultPart = {
                    ...delta,
                    output: { type: 'json', value: delta.output },
                };
                toolResponses.push(transformedDelta);

                process.stdout.write(
                    `\nTool response: '${delta.toolName}' ${JSON.stringify(
                        delta.output,
                    )}`,
                );
                break;
            }
        }
    }
    process.stdout.write('\n\n');

    messages.push({
        role: 'assistant',
        content: [{ type: 'text', text: fullResponse }, ...toolCalls],
    });

    if (toolResponses.length > 0) {
        messages.push({ role: 'tool', content: toolResponses });
    }

    toolResponseAvailable = toolCalls.length > 0;
}

main().catch(console.error);
