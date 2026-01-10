import { createGateway, generateText } from 'ai';
import 'dotenv/config';

async function main() {
    const gateway = createGateway({
        baseURL: 'http://localhost:3000/v1/ai',
    });

    const result = await generateText({
        model: gateway('openai/gpt-5-nano'),
        prompt: `Search for news about AI regulations from the first week of January 2025. 
Use the perplexitySearch tool with specific date filtering:
- Use search_after_date: "1/1/2025" to get results from January 1st onwards
- Use search_before_date: "1/8/2025" to limit to the first week
Tell me what you found about AI policy changes in that period.`,
        tools: {
            perplexitySearch: gateway.tools.perplexitySearch({
                maxResults: 5,
                searchLanguageFilter: ['en'],
                country: 'US',
                searchDomainFilter: ['reuters.com', 'bbc.com', 'nytimes.com'],
            }),
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
