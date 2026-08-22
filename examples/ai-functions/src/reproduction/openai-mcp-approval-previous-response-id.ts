import {
  createOpenAI,
  type OpenAILanguageModelResponsesOptions,
  type OpenaiResponsesProviderMetadata,
} from '@ai-sdk/openai';
import { generateText, type ModelMessage } from 'ai';

const model = 'gpt-5-mini';
const mcpTool = {
  serverLabel: 'zip1',
  serverUrl: 'https://zip1.io/mcp',
  serverDescription: 'Link shortener',
  requireApproval: 'always' as const,
};

type OpenAIRequestBody = {
  input?: Array<Record<string, unknown>>;
};

async function main() {
  let approvalRequestBody: OpenAIRequestBody | undefined;

  const openai = createOpenAI({
    fetch: async (input, init) => {
      if (init?.body != null) {
        const body = JSON.parse(String(init.body)) as OpenAIRequestBody;
        if (body.input?.some(item => item.type === 'mcp_approval_response')) {
          approvalRequestBody = body;
        }
      }

      return fetch(input, init);
    },
  });

  const first = await generateText({
    model: openai.responses(model),
    prompt: 'Use the link shortener tool to shorten https://ai-sdk.dev/.',
    tools: {
      mcp: openai.tools.mcp(mcpTool),
    },
    providerOptions: {
      openai: {
        store: true,
      } satisfies OpenAILanguageModelResponsesOptions,
    },
  });

  const approvalRequest = first.content.find(
    part => part.type === 'tool-approval-request',
  );
  if (approvalRequest == null) {
    throw new Error('OpenAI did not return an MCP approval request.');
  }

  const previousResponseId = (
    first.providerMetadata as OpenaiResponsesProviderMetadata | undefined
  )?.openai.responseId;
  if (previousResponseId == null) {
    throw new Error('OpenAI did not return a stored response id.');
  }

  const messages: ModelMessage[] = [
    ...first.response.messages,
    {
      role: 'tool',
      content: [
        {
          type: 'tool-approval-response',
          approvalId: approvalRequest.approvalId,
          approved: true,
          providerExecuted: true,
        },
      ],
    },
  ];

  let sdkError: unknown;
  try {
    await generateText({
      model: openai.responses(model),
      messages,
      tools: {
        mcp: openai.tools.mcp(mcpTool),
      },
      providerOptions: {
        openai: {
          previousResponseId,
          store: true,
        } satisfies OpenAILanguageModelResponsesOptions,
      },
    });
  } catch (error) {
    sdkError = error;
  }

  if (sdkError == null) {
    console.log(
      'The AI SDK MCP approval continuation succeeded; issue #18605 is fixed.',
    );
    return;
  }

  const approvalItems = approvalRequestBody?.input ?? [];
  const sentItemReference = approvalItems.some(
    item =>
      item.type === 'item_reference' && item.id === approvalRequest.approvalId,
  );
  const sentApprovalResponse = approvalItems.some(
    item =>
      item.type === 'mcp_approval_response' &&
      item.approval_request_id === approvalRequest.approvalId,
  );

  if (!sentItemReference || !sentApprovalResponse) {
    throw sdkError;
  }

  const directResponse = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      tools: [
        {
          type: 'mcp',
          server_label: mcpTool.serverLabel,
          server_url: mcpTool.serverUrl,
          server_description: mcpTool.serverDescription,
          require_approval: mcpTool.requireApproval,
        },
      ],
      previous_response_id: previousResponseId,
      store: true,
      input: [
        {
          type: 'mcp_approval_response',
          approve: true,
          approval_request_id: approvalRequest.approvalId,
        },
      ],
    }),
  });

  if (!directResponse.ok) {
    throw new Error(
      `The direct documented continuation failed with HTTP ${directResponse.status}: ${await directResponse.text()}`,
    );
  }

  console.error(
    'REPRODUCED: OpenAI rejected the AI SDK MCP approval continuation after it sent both item_reference and mcp_approval_response; the documented mcp_approval_response-only continuation succeeded.',
  );
  process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
