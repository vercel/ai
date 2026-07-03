import { xai } from '@ai-sdk/xai';
import { streamText } from 'ai';

async function main() {
  console.log('Reproducing vercel/ai#13218: xAI Responses web_search stream');

  const result = streamText({
    model: xai.responses('grok-4-fast-non-reasoning'),
    tools: {
      web_search: xai.tools.webSearch(),
    },
    include: {
      rawChunks: true,
    },
    prompt:
      'Use web search to find one current headline from xAI today, then answer in one short sentence.',
  });

  const eventTypes: string[] = [];
  const providerToolCallIds = new Set<string>();
  const providerToolResultIds = new Set<string>();
  let sawXaiWebSearchDone = false;

  try {
    for await (const event of result.stream) {
      eventTypes.push(event.type);

      if (event.type === 'raw') {
        const raw = event.rawValue as {
          type?: string;
          item?: { id?: string; type?: string };
        };

        if (
          raw.type === 'response.output_item.done' &&
          raw.item?.type === 'web_search_call'
        ) {
          sawXaiWebSearchDone = true;
          console.log(
            `raw response.output_item.done for web_search_call id=${raw.item.id}`,
          );
        }
        continue;
      }

      if (event.type === 'tool-call' && event.providerExecuted) {
        providerToolCallIds.add(event.toolCallId);
        console.log(
          `tool-call providerExecuted id=${event.toolCallId} name=${event.toolName}`,
        );
      }

      if (event.type === 'tool-result') {
        providerToolResultIds.add(event.toolCallId);
        console.log(`tool-result id=${event.toolCallId}`);
      }
    }
  } catch (error) {
    console.error('The live xAI provider call failed before the stream completed.');
    console.error(error);
    throw error;
  }

  const missingResultIds = [...providerToolCallIds].filter(
    id => !providerToolResultIds.has(id),
  );

  console.log('Observed stream event types:', eventTypes.join(', '));
  console.log('Provider tool-call ids:', [...providerToolCallIds].join(', '));
  console.log('Provider tool-result ids:', [...providerToolResultIds].join(', '));

  if (providerToolCallIds.size === 0) {
    throw new Error(
      'The live model did not execute a provider-side web_search tool, so the reported scenario was not exercised.',
    );
  }

  if (missingResultIds.length > 0) {
    throw new Error(
      `Reproduced vercel/ai#13218: provider-executed tool calls completed but no tool-result was emitted for id(s): ${missingResultIds.join(
        ', ',
      )}. raw web_search done observed=${sawXaiWebSearchDone}.`,
    );
  }

  console.log(
    'Could not reproduce: every provider-executed tool-call had a matching tool-result.',
  );
}

main().catch(error => {
  process.exitCode = 1;
  console.error(error instanceof Error ? error.message : error);
});
