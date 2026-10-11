import {
  Experimental_DecisionRefusalError as DecisionRefusalError,
  experimental_decide,
} from 'ai';
import { Experimental_DecisionMockModelV4 } from 'ai/test';
import { run } from '../../lib/run';

run(async () => {
  try {
    await experimental_decide({
      model: new Experimental_DecisionMockModelV4({
        doDecide: async () => ({
          answers: {
            requestsRefund: { type: 'boolean', probability: 0.95 },
            containsSensitiveData: { type: 'refusal' },
          },
          usage: { inputTokens: 12, outputTokens: 3 },
          warnings: [],
          response: { id: 'synthetic-response' },
        }),
      }),
      state:
        'I was charged twice. My account details are included in the attachment.',
      questions: {
        requestsRefund: {
          type: 'boolean',
          instructions: 'Is the customer requesting a refund?',
        },
        containsSensitiveData: {
          type: 'boolean',
          instructions: 'Does the request contain sensitive data?',
        },
      },
    });
  } catch (error) {
    if (DecisionRefusalError.isInstance(error)) {
      console.log({
        refusedQuestionIds: error.questionIds,
        completedAnswers: error.answers,
        usage: error.usage,
        response: error.response,
      });
      return;
    }

    throw error;
  }
});
