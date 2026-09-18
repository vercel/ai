import { experimental_evaluate } from 'ai';
import { Experimental_EvaluationMockModelV4 } from 'ai/test';
import { run } from '../../lib/run';

run(async () => {
  const result = await experimental_evaluate({
    model: new Experimental_EvaluationMockModelV4({
      doEvaluate: async () => ({
        answers: { requestsRefund: { type: 'boolean', probability: 0.95 } },
        warnings: [],
      }),
    }),
    state: 'I was charged twice. Please refund the duplicate.',
    questions: {
      requestsRefund: {
        type: 'boolean',
        instructions: 'Is the customer requesting a refund?',
      },
    },
  });

  console.log(result.answers);
});
