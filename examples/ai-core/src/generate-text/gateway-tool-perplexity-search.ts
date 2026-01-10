import { createGateway, generateText } from 'ai';
import 'dotenv/config';

async function main() {
    const gateway = createGateway({
        baseURL: 'http://localhost:3000/v1/ai',
    });

    const result = await generateText({
        model: gateway('openai/gpt-5-nano'),
        prompt:
            'Use the perplexitySearch tool to find current news about AI regulations in January 2025. You must search the web first before answering.',
        tools: {
            perplexitySearch: gateway.tools.perplexitySearch(),
        },
    });

    console.log('Text:', result.text);
    console.log();
    console.log('Reasoning:', result.reasoning);
    console.log();
    console.log('Tool calls:', JSON.stringify(result.toolCalls, null, 2));
    console.log('Tool results:', JSON.stringify(result.toolResults, null, 2));
    console.log();
    console.log('Token usage:', result.usage);
    console.log('Finish reason:', result.finishReason);
    console.log(
        'Provider metadata:',
        JSON.stringify(result.providerMetadata, null, 2),
    );
}

main().catch(console.error);
