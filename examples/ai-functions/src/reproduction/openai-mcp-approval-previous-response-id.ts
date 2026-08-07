import {
  createOpenAI,
  type OpenAILanguageModelResponsesOptions,
  type OpenaiResponsesProviderMetadata,
} from '@ai-sdk/openai';
import { generateText, type ModelMessage } from 'ai';

const signal =
  'ISSUE #18605 REPRODUCED: OpenAI rejected the SDK MCP approval request as a duplicate item';

type OpenAIRequestBody = {
  input?: Array<
    | { type: 'item_reference'; id: string }
    | {
        type: 'mcp_approval_response';
        approval_request_id: string;
        approve: boolean;
      }
  >;
  previous_response_id?: string;
  store?: boolean;
};

async function main() {
  const requestBodies: OpenAIRequestBody[] = [];
  const openai = createOpenAI({
    fetch: async (input, init) => {
      if (typeof init?.body === 'string') {
        requestBodies.push(JSON.parse(init.body) as OpenAIRequestBody);
      }
      return fetch(input, init);
    },
  });

  const tools = {
    mcp: openai.tools.mcp({
      serverLabel: 'zip1',
      serverUrl: 'https://zip1.io/mcp',
      serverDescription: 'Link shortener',
      requireApproval: 'always',
    }),
  };

  const firstResult = await generateText({
    model: openai.responses('gpt-5-mini'),
    prompt: 'Use the MCP create_short_url tool to shorten https://ai-sdk.dev/.',
    tools,
    providerOptions: {
      openai: {
        store: true,
      } satisfies OpenAILanguageModelResponsesOptions,
    },
  });

  const approvalRequest = firstResult.content.find(
    part => part.type === 'tool-approval-request',
  );
  if (approvalRequest?.type !== 'tool-approval-request') {
    throw new Error('OpenAI did not return an MCP approval request.');
  }

  const providerMetadata = firstResult.finalStep.providerMetadata as
    | OpenaiResponsesProviderMetadata
    | undefined;
  const previousResponseId = providerMetadata?.openai.responseId;
  if (!previousResponseId) {
    throw new Error('OpenAI did not return a stored response ID.');
  }

  const messages: ModelMessage[] = [
    ...firstResult.responseMessages,
    {
      role: 'tool',
      content: [
        {
          type: 'tool-approval-response',
          approvalId: approvalRequest.approvalId,
          approved: false,
          providerExecuted: true,
        },
      ],
    },
  ];

  try {
    await generateText({
      model: openai.responses('gpt-5-mini'),
      messages,
      tools,
      providerOptions: {
        openai: {
          previousResponseId,
          store: true,
        } satisfies OpenAILanguageModelResponsesOptions,
      },
    });
  } catch (error) {
    const followUpBody = requestBodies.at(-1);
    const approvalInput = followUpBody?.input?.find(
      item => item.type === 'mcp_approval_response',
    );
    const duplicateReference =
      approvalInput?.type === 'mcp_approval_response' &&
      followUpBody?.input?.some(
        item =>
          item.type === 'item_reference' &&
          item.id === approvalInput.approval_request_id,
      );
    const providerRejectedDuplicate =
      error instanceof Error &&
      error.message.includes('Duplicate item found with id');

    if (
      followUpBody?.previous_response_id === previousResponseId &&
      followUpBody.store === true &&
      duplicateReference &&
      providerRejectedDuplicate
    ) {
      console.error(signal);
      process.exitCode = 1;
      return;
    }

    throw error;
  }

  console.log(
    'Issue #18605 not reproduced: the stored MCP approval continuation succeeded.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
