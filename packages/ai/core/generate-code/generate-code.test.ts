import assert from 'node:assert';
import { z } from 'zod';
import { MockLanguageModelV1 } from '../test/mock-language-model-v1';
import { generateCode } from './generate-code';
import { tool } from '../tool';

const dummyResponseValues = {
  rawCall: { rawPrompt: 'prompt', rawSettings: {} },
  finishReason: 'stop' as const,
  usage: { promptTokens: 10, completionTokens: 20 },
};

let balance = 30;
const history = [
  { amount: 10, from: 'Bob', to: 'me' },
  { amount: 20, to: 'Alice', from: 'me' },
];

const tools = {
  getBalance: tool({
    description: 'get balance of the user',
    parameters: z.object({}),
    execute: async () => {
      return balance;
    },
    returns: z.number(),
  }),
  sentMoney: tool({
    description: 'send money to the user',
    parameters: z.object({ amount: z.number(), receiver: z.string() }),
    execute: async ({ amount, receiver }) => {
      if (balance < amount) {
        throw new Error('Insufficient balance');
      }
      balance -= amount;

      history.push({ amount, to: receiver, from: 'me' });
    },
    returns: z.void(),
  }),
  getHistory: tool({
    description: 'get history of transactions',
    parameters: z.unknown(),
    execute: async () => {
      return history;
    },
    returns: z.array(
      z.object({ amount: z.number(), to: z.string(), from: z.string() }),
    ),
  }),
};

describe('result.code', () => {
  it('should generate code', async () => {
    const result = await generateCode({
      tools,
      model: new MockLanguageModelV1({
        doGenerate: async ({ prompt, mode }) => {
          return {
            ...dummyResponseValues,
            text: `\`\`\`js
let balance = listOfFunctions.getBalance({});
return balance
\`\`\`

\`\`\`json
{
  "type": "number"
}
\`\`\`
`,
          };
        },
      }),
      prompt: 'Get my balance',
      system: 'You are a banking app',
    });

    //     assert.deepStrictEqual(result.code, `let balance = this.getBalance({});
    // return balance`);
    //     assert.deepStrictEqual(result.schema, `{
    //   "type": "number"
    // }`);
    assert.deepStrictEqual(result.execute(), 30);
  });
});
