import { convertToModelMessages } from '../../ai/src/ui/convert-to-model-messages';
import { convertToOpenAIResponsesInput } from '../src/responses/convert-to-openai-responses-input';
import type { ToolNameMapping } from '../../provider-utils/src/create-tool-name-mapping';

const toolNameMapping: ToolNameMapping = {
  toProviderToolName: toolName => toolName,
  toCustomToolName: toolName => toolName,
};

const duplicateToolCallId = 'call_issue_13307';
const approvalId = 'approval_issue_13307';

// This mirrors a persisted/rehydrated HITL chat where the approval request part
// and a later output part for the same tool call are both present as separate
// UI message parts.
const uiMessages = [
  {
    role: 'user',
    parts: [{ type: 'text', text: 'What is the weather in Tokyo?' }],
  },
  {
    role: 'assistant',
    parts: [
      { type: 'step-start' },
      {
        type: 'tool-weather',
        toolCallId: duplicateToolCallId,
        state: 'input-available',
        input: { city: 'Tokyo' },
        approval: {
          id: approvalId,
        },
      },
      {
        type: 'tool-weather',
        toolCallId: duplicateToolCallId,
        state: 'output-available',
        input: { city: 'Tokyo' },
        output: { weather: 'Sunny', temperature: '20°C' },
        approval: {
          id: approvalId,
          approved: true,
        },
      },
    ],
  },
] as any[];

const modelMessages = await convertToModelMessages(uiMessages);

const { input: responsesInput } = await convertToOpenAIResponsesInput({
  prompt: modelMessages as any,
  toolNameMapping,
  systemMessageMode: 'system',
  providerOptionsName: 'openai',
  store: true,
});

const functionCalls = responsesInput.filter(
  (item): item is Extract<(typeof responsesInput)[number], { type: string }> =>
    typeof item === 'object' &&
    item != null &&
    'type' in item &&
    item.type === 'function_call',
) as Array<{ type: 'function_call'; call_id: string; name: string }>;

const counts = new Map<string, number>();
for (const call of functionCalls) {
  counts.set(call.call_id, (counts.get(call.call_id) ?? 0) + 1);
}

const duplicateCallIds = [...counts.entries()]
  .filter(([, count]) => count > 1)
  .map(([callId]) => callId);

console.log(
  JSON.stringify(
    {
      modelMessages,
      responsesInput,
      duplicateFunctionCallIds: duplicateCallIds,
    },
    null,
    2,
  ),
);

if (duplicateCallIds.length > 0) {
  throw new Error(
    `Issue #13307 reproduced: OpenAI Responses input contains duplicate function_call items for call_id(s): ${duplicateCallIds.join(
      ', ',
    )}.`,
  );
}

console.log('No duplicate function_call items were produced.');
