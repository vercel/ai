import { openai } from '@ai-sdk/openai';
import { generateText, type ModelMessage } from 'ai';
import { run } from '../../lib/run';
import { print } from '../../lib/print';

// Demonstrates that an OpenAI provider-executed `web_search` result cannot be
// replayed on a later turn when `store: false`.
//
// The Responses API only lets a prior hosted-tool result re-enter a request as
// an `item_reference`, which requires the item to be stored server-side. With
// `store: false` there is nothing to reference, so the AI SDK drops the
// web_search call/result from the outgoing request and warns, once per result:
//
//   Results for OpenAI tool web_search are not sent to the API when store is false
//
// This needs more than one turn to surface: turn 1 runs the search (no prior
// result in the input, so no warning); turn 2 replays turn 1's assistant
// messages (which contain the provider-executed call + result) and triggers it.
//
// Setting `store: true` (the API default) avoids the warning, because the prior
// search is then sent as an `item_reference`. The behavior is the same for the
// legacy `openai.tools.webSearchPreview` tool — it is keyed on the result being
// provider-executed, not on the specific tool.
run(async () => {
  const model = openai.responses('gpt-5-mini');
  const tools = { web_search: openai.tools.webSearch({}) };
  const providerOptions = { openai: { store: false } };

  const searchPrompt: ModelMessage = {
    role: 'user',
    content: 'Search the web for the current Node.js LTS version.',
  };

  // Turn 1: run the hosted web_search. The input has no prior tool result yet,
  // so this turn produces no warning.
  console.log('Turn 1: running web_search (store: false)');
  const search = await generateText({
    model,
    messages: [searchPrompt],
    tools,
    toolChoice: { type: 'tool', toolName: 'web_search' },
    providerOptions,
  });
  print('Turn 1 warnings:', search.warnings);

  // Turn 2: replay turn 1's assistant messages — which include the
  // provider-executed web_search call + result — in the next request. Because
  // `store: false`, the SDK cannot reference the stored items, drops them, and
  // emits the warning. The model keeps the prior assistant text but loses the
  // structured search context (query + source URLs).
  console.log('\nTurn 2: replaying the search result (store: false)');
  const followUp = await generateText({
    model,
    messages: [
      searchPrompt,
      ...search.response.messages,
      { role: 'user', content: 'Reply only with OK.' },
    ],
    tools,
    providerOptions,
  });
  print('Turn 2 warnings:', followUp.warnings);
  print('Turn 2 text:', followUp.text);
});
