import { createAnthropic } from '@ai-sdk/anthropic';
import { CoreMessage, generateText } from 'ai';
import 'dotenv/config';

const anthropic = createAnthropic({
  // example fetch wrapper that logs the input to the API call:
  fetch: async (url, options) => {
    console.log('URL', url);
    console.log('Headers', JSON.stringify(options!.headers, null, 2));
    console.log(
      `Body ${JSON.stringify(JSON.parse(options!.body! as string), null, 2)}`,
    );
    return await fetch(url, options);
  },
});

async function main() {
  const result = await generateText({
    model: anthropic('claude-3-7-sonnet-20250219'),
    messages: [
      {
        role: 'user',
        content: 'How many "r"s are in the word "strawberry"?',
      },
      // {
      //   role: 'assistant',
      //   content: [
      //     {
      //       type: 'reasoning',
      //       text: 'I need to count the number of "r"s in the word "strawberry".',
      //     },
      //     {
      //       type: 'text',
      //       text: 'The word "strawberry" has 3 "r"s.',
      //     },
      //   ],
      // },
      {
        role: 'assistant',
        content: [
          {
            type: 'redacted-reasoning',
            data: 'EuQHCoYBGAIiQESROEPNfH7eVu5moNjDCKMZlqmOhEmRBkur4pkXFjs/+8Sm9Z2k+b/VbvRNOWBGnLTMOwQSMNGnj+O5njjOZhQqQIfFNcPnRcd35jVq6y3fhaK/gsN4Vtn80SeKnSVmwR9j675j8U5VnDXrOqdCNWTiGFOTjwwxq8kJw6Yp/q9APmoSDBdYD8oErUkU3YOmshoMIuRrYnTH2LCa/b0+IjDpZZn4b3k/FVSF5fJdDkSMAwqegGFUiXCa/YT5auaOtSafCjUg9r61gaHBcokPrdQqigZv8GoLBcmbLPFNQ1es8lUDpXP3I8xhoD5n1imiWApe1h1BNHk1cv1CLNyKSvUiaHgvkuxNcllZslFYg2s5fGS4ITj+FWu6JdwnpRaqrfQ46ptWuL6SO2IEaX22hXePYYHM1xB+uEU30Xnx4206fljudXKvhut9VxNn4nMNZ8VD3NviYiiXXYnarjUHKzKMQPU6+qClgKRESEjSipDVBU+8kqhPhwEAs+CB3uR+Wk6lzJbNfj9JNbj9ASScsNsxvWbipQQgY89Hi6DOLjm4tywuZZLNFMVqMsrhmFjdhZIzGMnnz1F0dalnq2J/ftrtuGp9DI6C2df4J+AFX90rsMB9uaHQ1lsgyxRDHL9F9X6yPHW8+gl16LwIU+ua+yF/TNZWUjCq9Q9no+phFh4C437+70NhYeK7GUe60RLBjW5gR813S9Sk9LtYaxCnKf9Ac7OjKl6WWCnv2Nc16ORSK3IthspzS++LNSIohx9b4KtGSvS87aVIel1sKBdRVBwIM7M5iAEUWue8TjnEsfRHP0BFtkfs7YfzjKhTj8q2m0qUxZSo00inegqSn5n0E61hzOzQrEAn9lrc1l6Ae7PMIKPegubWggAb4TJdwL8SiAkoKm3FWjByz43ikRjAek//k83iN1AyA8Hbkquzz+ydqhMKJ/014O9glTVOPn9lTex2egKxwI+cQYqnSuwD1Qj10/bTTZan0k/Gpih6PTjPSO7brswEkCUB1eizztje5wbkXBIWGp7Fr5AJPIY214/o1MVvJAhuj6jmTxWqNVS26YerECaVZ+FLSDLKuPvJr9VClV5/b/UIyKc1imdPViQzQ+z0/14aJMkHT8vBnoRQJZcsVy4GEj4ZnnhnNtuD7kfvTHmhf9Bdsh4vwDVsVHcvHX1nluNdNdcHWlD58Z9DW1C2/tQhriyrx+G626urJPA0CUMVWsxtYnsGIldsPfB6mVn/FkvK8thC3vn+Eb1UKBZ2cyEIBw/otIx+7m/vk2JMIyNY3UggBZUxNTsG37N5ZCW3GxqMo1rsT4Aw',
          },
          {
            type: 'text',
            text: 'The word "strawberry" has 3 "r"s.',
          },
        ],
      },
      {
        role: 'user',
        content: 'How many "o"s are in the word "xylophone"?',
      },
    ] satisfies CoreMessage[],
    temperature: 0.5, // should get ignored (warning)
    providerOptions: {
      anthropic: {
        thinking: { type: 'enabled', budgetTokens: 12000 },
      },
    },
  });

  console.log('Reasoning:');
  console.log(result.reasoning);
  console.log();

  console.log('Text:');
  console.log(result.text);
  console.log();

  console.log('Warnings:', result.warnings);
}

main().catch(console.error);
