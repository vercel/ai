import { anthropic, AnthropicProviderOptions } from '@ai-sdk/anthropic';
import { generateText, tool } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
    const result = await generateText({
        model: anthropic('claude-3-7-sonnet-20250219'),
        messages: [
            {
                role: 'user',
                content: 'What is the weather in San Francisco?'
            },
            {
                role: 'assistant',
                content: [
                    {
                        type: 'tool-call',
                        toolCallId: 'tool_1',
                        toolName: 'weather',
                        input: { location: 'San Francisco' },
                    }
                ]
            },
            {
                role: 'tool',
                content: [
                    {
                        type: 'tool-result',
                        toolCallId: 'tool_1',
                        toolName: 'weather',
                        output: {
                            type: 'json',
                            value: { temperature: 72, condition: 'sunny' }
                        }
                    }
                ]
            },
            {
                role: 'user',
                content: 'What about New York?'
            },
            {
                role: 'assistant',
                content: [
                    {
                        type: 'tool-call',
                        toolCallId: 'tool_2',
                        toolName: 'weather',
                        input: { location: 'New York' }
                    }
                ]
            },
            {
                role: 'tool',
                content: [
                    {
                        type: 'tool-result',
                        toolCallId: 'tool_2',
                        toolName: 'weather',
                        output: {
                            type: 'json',
                            value: { temperature: 65, condition: 'cloudy' }
                        }
                    }
                ]
            },
            {
                role: 'user',
                content: 'compare the two cities.'
            }
        ],
        tools: {
            weather: tool({
                description: 'Get the weather of a location',
                inputSchema: z.object({
                    location: z.string().describe('The location to get the weather for')
                }),
                execute: async ({ location }) => ({
                    location,
                    temperature: 72 + Math.floor(Math.random() * 21) - 10,
                    condition: 'sunny'
                })
            })
        },
        providerOptions: {
            anthropic: {
                contextManagement: {
                    edits: [
                        {
                            type: 'clear_tool_uses_20250919',
                            trigger: {
                                type: 'input_tokens',
                                value: 1000
                            },
                            keep: {
                                type: 'tool_uses',
                                value: 1
                            },
                            clearAtLeast: {
                                type: 'input_tokens',
                                value: 500
                            },
                            clearToolInputs: true,
                            excludeTools: ['important_tool']
                        }
                    ]
                }
            } satisfies AnthropicProviderOptions
        }
    });

    console.log('Text:');
    console.log(result.text);
    console.log();

    console.log('Context Management:');
    console.log(JSON.stringify(
        result.providerMetadata?.anthropic?.contextManagement,
        null,
        2
    ));
    console.log();

    console.log('Usage:');
    console.log(JSON.stringify(result.usage, null, 2));
};

main().catch(console.error);