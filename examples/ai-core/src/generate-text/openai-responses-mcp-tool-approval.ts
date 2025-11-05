import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { run } from '../lib/run';

run(async () => {
  // First request - this will trigger an approval request
  const initialResult = await generateText({
    model: openai.responses('gpt-5-mini'),
    prompt: 'Can you search the web for latest NYC mayoral election results?',
    tools: {
      mcp: openai.tools.mcp({
        serverLabel: 'dmcp',
        serverUrl: 'https://mcp.exa.ai/mcp',
        serverDescription: 'A web-search API for AI agents',
      }),
    },
  });

  console.log('=== Initial Response ===');
  console.dir(initialResult.response.body, { depth: Infinity });
  console.dir(initialResult.toolCalls, { depth: Infinity });
  console.dir(initialResult.toolResults, { depth: Infinity });
  console.log('Text:', initialResult.text);

  // Check if there's an approval request
  const approvalRequest = initialResult.staticToolResults.find(
    result =>
      result.toolName === 'mcp' &&
      result.output &&
      typeof result.output === 'object' &&
      'type' in result.output &&
      result.output.type === 'approvalRequest',
  );

  if (approvalRequest && approvalRequest.output && typeof approvalRequest.output === 'object' && 'approvalRequestId' in approvalRequest.output) {
    const approvalRequestId = (
      approvalRequest.output as { approvalRequestId: string }
    ).approvalRequestId;
    const responseId = (initialResult.response.body as { id: string }).id;

    console.log('\n=== Approval Request Found ===');
    console.log('Approval Request ID:', approvalRequestId);
    console.log('Response ID:', responseId);
    console.log('Tool:', (approvalRequest.output as any).name);
    console.log('Arguments:', (approvalRequest.output as any).arguments);

    // Approve the request
    console.log('\n=== Approving Request ===');
    const approvedResult = await generateText({
      model: openai.responses('gpt-5-mini'),
      prompt: 'Continue with the tool call. If denied, please explain.',
      tools: {
        mcp: openai.tools.mcp({
          serverLabel: 'dmcp',
          serverUrl: 'https://mcp.exa.ai/mcp',
          serverDescription: 'A web-search API for AI agents',
        }),
      },
      providerOptions: {
        openai: {
          previousResponseId: responseId,
          additionalInput: [
            {
              type: 'mcp_approval_response',
              approve: false,
              approval_request_id: approvalRequestId,
            },
          ],
        },
      },
    });

    console.log('\n=== Approved Response ===');
    console.dir(approvedResult.response.body, { depth: Infinity });
    console.dir(approvedResult.toolCalls, { depth: Infinity });
    console.dir(approvedResult.toolResults, { depth: Infinity });
    console.log('Text:', approvedResult.text);
  } else {
    console.log('\nNo approval request found - tool was executed automatically');
  }
});
