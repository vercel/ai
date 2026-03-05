import { anthropic } from '@ai-sdk/anthropic';
import {
  generateText,
  streamText,
  UIMessage,
  convertToModelMessages,
} from 'ai';
import { run } from '../../lib/run';

run(async () => {
  // Step 1: Use streamText to trigger a web_fetch error on a blocked URL.
  // This is the path that useChat takes internally.
  console.log('--- Step 1: streamText with web_fetch on blocked URL ---\n');

  const tools = {
    web_fetch: anthropic.tools.webFetch_20250910({ maxUses: 5 }),
  };

  const result1 = streamText({
    model: anthropic('claude-sonnet-4-20250514'),
    tools,
    system:
      'You are a helpful assistant. Always use web_fetch when asked to fetch a URL.',
    messages: [
      {
        role: 'user',
        content:
          'Please fetch the content from http://localhost:9999/secret — I need to know what is on that page.',
      },
    ],
  });

  // Collect the stream into a UI message, simulating what useChat/processUIMessageStream does.
  // Provider tool errors become { state: 'output-error', errorText: <plain string> },
  // losing the structured errorCode.
  const uiMessage: UIMessage = {
    id: 'msg-1',
    role: 'assistant',
    parts: [],
  };

  let textAccumulator = '';

  for await (const part of result1.fullStream) {
    switch (part.type) {
      case 'text-delta':
        textAccumulator += part.text;
        process.stdout.write(part.text);
        break;

      case 'tool-call':
        console.log(
          `\nTool call: ${part.toolName}(${JSON.stringify(part.input)})`,
        );
        uiMessage.parts.push({
          type: 'tool-web-fetch',
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          state: 'input-available',
          input: part.input,
          providerExecuted: part.providerExecuted,
        } as any);
        break;

      case 'tool-result':
        console.log(
          `Tool result: ${JSON.stringify(part.output).slice(0, 200)}`,
        );
        {
          const toolPart = uiMessage.parts.find(
            (p: any) =>
              p.type === 'tool-invocation' && p.toolCallId === part.toolCallId,
          ) as any;
          if (toolPart) {
            toolPart.state = 'output-available';
            toolPart.output = part.output;
            toolPart.providerExecuted = part.providerExecuted;
          }
        }
        break;

      case 'tool-error':
        console.log(`Tool error: ${JSON.stringify(part)}`);
        {
          const toolPart = uiMessage.parts.find(
            (p: any) =>
              p.type === 'tool-invocation' && p.toolCallId === part.toolCallId,
          ) as any;
          if (toolPart) {
            // This is what useChat/processUIMessageStream does: the structured
            // error gets converted to a plain string via onError()/getErrorMessage().
            // The original errorCode (e.g. "url_not_allowed") is lost here.
            toolPart.state = 'output-error';
            toolPart.errorText = String(part.error);
            toolPart.providerExecuted = part.providerExecuted;
          }
        }
        break;
    }
  }

  if (textAccumulator) {
    uiMessage.parts.push({ type: 'text', text: textAccumulator });
  }

  console.log(
    '\n\nUI message parts:',
    JSON.stringify(uiMessage.parts, null, 2),
  );

  // Step 2: Convert UI messages back to model messages. This is what useChat does
  // before sending the next API request. The errorText (plain string) gets passed
  // through createToolModelOutput with errorMode: 'json', producing output like
  // { type: 'error-json', value: "url_not_allowed" } instead of the correct
  // { type: 'error-json', value: { errorCode: "url_not_allowed" } }.
  console.log(
    '\n--- Step 2: convertToModelMessages (UI → Model round-trip) ---\n',
  );

  const uiMessages: UIMessage[] = [
    {
      id: 'user-1',
      role: 'user',
      parts: [
        {
          type: 'text',
          text: 'Please fetch the content from http://localhost:9999/secret',
        },
      ],
    },
    uiMessage,
    {
      id: 'user-2',
      role: 'user',
      parts: [
        { type: 'text', text: 'Thanks! Can you summarize what happened?' },
      ],
    },
  ];

  const modelMessages = await convertToModelMessages(uiMessages);
  console.log(
    'Converted model messages:',
    JSON.stringify(modelMessages, null, 2),
  );

  // Step 3: Send follow-up using the converted model messages.
  // The Anthropic provider reads errorValue.errorCode from the tool-result output,
  // gets undefined (because the value is a plain string, not an object),
  // and falls back to "unknown" — which Anthropic's API rejects with 400.
  console.log(
    '\n--- Step 3: Send follow-up (should trigger 400 from Anthropic) ---\n',
  );

  const result2 = await generateText({
    model: anthropic('claude-sonnet-4-20250514'),
    tools,
    system:
      'You are a helpful assistant. Always use web_fetch when asked to fetch a URL.',
    messages: modelMessages,
  });

  console.log('Assistant:', result2.text);
});
