import 'server-only';

import { openai } from 'ai/openai';
import { createAI, createStreamableUI, getMutableAIState } from 'ai/rsc';

import {
  BotCard,
  BotMessage,
  Events,
  Purchase,
  Stock,
  Stocks,
  SystemMessage,
  spinner,
} from '@/components/llm-stocks';

import { EventsSkeleton } from '@/components/llm-stocks/events-skeleton';
import { StockSkeleton } from '@/components/llm-stocks/stock-skeleton';
import { StocksSkeleton } from '@/components/llm-stocks/stocks-skeleton';
import { formatNumber, runAsyncFnWithoutBlocking, sleep } from '@/lib/utils';
import {
  ExperimentalMessage,
  ToolCallPart,
  ToolResultPart,
  experimental_streamText,
} from 'ai';
import { z } from 'zod';

async function confirmPurchase(symbol: string, price: number, amount: number) {
  'use server';

  const aiState = getMutableAIState<typeof AI>();

  const purchasing = createStreamableUI(
    <div className="inline-flex items-start gap-1 md:items-center">
      {spinner}
      <p className="mb-2">
        Purchasing {amount} ${symbol}...
      </p>
    </div>,
  );

  const systemMessage = createStreamableUI(null);

  runAsyncFnWithoutBlocking(async () => {
    // You can update the UI at any point.
    await sleep(1000);

    purchasing.update(
      <div className="inline-flex items-start gap-1 md:items-center">
        {spinner}
        <p className="mb-2">
          Purchasing {amount} ${symbol}... working on it...
        </p>
      </div>,
    );

    await sleep(1000);

    purchasing.done(
      <div>
        <p className="mb-2">
          You have successfully purchased {amount} ${symbol}. Total cost:{' '}
          {formatNumber(amount * price)}
        </p>
      </div>,
    );

    systemMessage.done(
      <SystemMessage>
        You have purchased {amount} shares of {symbol} at ${price}. Total cost ={' '}
        {formatNumber(amount * price)}.
      </SystemMessage>,
    );

    aiState.done([
      ...aiState.get(),
      {
        role: 'user',
        content: `[User has purchased ${amount} shares of ${symbol} at ${price}. Total cost = ${
          amount * price
        }]`,
      },
    ]);
  });

  return {
    purchasingUI: purchasing.value,
    newMessage: {
      id: Date.now(),
      display: systemMessage.value,
    },
  };
}

async function submitUserMessage(content: string) {
  'use server';

  const aiState = getMutableAIState<typeof AI>();
  aiState.update([
    ...aiState.get(),
    {
      role: 'user',
      content,
    },
  ]);

  const reply = createStreamableUI(
    <BotMessage className="items-center">{spinner}</BotMessage>,
  );

  const resultPromise = experimental_streamText({
    model: openai.chat('gpt-3.5-turbo'),
    system: `\
You are a stock trading conversation bot and you can help users buy stocks, step by step.
You and the user can discuss stock prices and the user can adjust the amount of stocks they want to buy, or place an order, in the UI.

Messages inside [] means that it's a UI element or a user event. For example:
- "[Price of AAPL = 100]" means that an interface of the stock price of AAPL is shown to the user.
- "[User has changed the amount of AAPL to 10]" means that the user has changed the amount of AAPL to 10 in the UI.

If the user requests purchasing a stock, call \`show_stock_purchase_ui\` to show the purchase UI.
If the user just wants the price, call \`show_stock_price\` to show the price.
If you want to show trending stocks, call \`list_stocks\`.
If you want to show events, call \`get_events\`.
If the user wants to sell stock, or complete another impossible task, respond that you are a demo and cannot do that.

Besides that, you can also chat with users and do some calculations if needed.`,
    messages: aiState.get(),
    tools: {
      show_stock_price: {
        description:
          'Get the current stock price of a given stock or currency. Use this to show the price to the user.',
        parameters: z.object({
          symbol: z
            .string()
            .describe(
              'The name or symbol of the stock or currency. e.g. DOGE/AAPL/USD.',
            ),
          price: z.number().describe('The price of the stock.'),
          delta: z.number().describe('The change in price of the stock'),
        }),
      },
      show_stock_purchase_ui: {
        description:
          'Show price and the UI to purchase a stock or currency. Use this if the user wants to purchase a stock or currency.',
        parameters: z.object({
          symbol: z
            .string()
            .describe(
              'The name or symbol of the stock or currency. e.g. DOGE/AAPL/USD.',
            ),
          price: z.number().describe('The price of the stock.'),
          numberOfShares: z
            .number()
            .describe(
              'The **number of shares** for a stock or currency to purchase. Can be optional if the user did not specify it.',
            ),
        }),
      },
      list_stocks: {
        description: 'List three imaginary stocks that are trending.',
        parameters: z.object({
          stocks: z.array(
            z.object({
              symbol: z.string().describe('The symbol of the stock'),
              price: z.number().describe('The price of the stock'),
              delta: z.number().describe('The change in price of the stock'),
            }),
          ),
        }),
      },
      get_events: {
        description:
          'List funny imaginary events between user highlighted dates that describe stock activity.',
        parameters: z.object({
          events: z.array(
            z.object({
              date: z
                .string()
                .describe('The date of the event, in ISO-8601 format'),
              headline: z.string().describe('The headline of the event'),
              description: z.string().describe('The description of the event'),
            }),
          ),
        }),
      },
    },
  });

  // run async
  resultPromise.then(async result => {
    const toolCalls: ToolCallPart[] = [];
    const toolResponses: ToolResultPart[] = [];
    let fullResponse = '';

    for await (const part of result.fullStream) {
      switch (part.type) {
        case 'text-delta': {
          fullResponse += part.textDelta;
          reply.update(<BotMessage>{fullResponse}</BotMessage>);
          break;
        }

        case 'tool-call': {
          toolCalls.push(part);

          switch (part.toolName) {
            case 'list_stocks': {
              const { stocks } = part.args;

              reply.update(
                <BotCard>
                  <StocksSkeleton />
                </BotCard>,
              );

              await sleep(1000);

              reply.update(
                <BotCard>
                  <Stocks stocks={stocks} />
                </BotCard>,
              );

              toolResponses.push({
                ...part,
                type: 'tool-result',
                result: `[List stocks ${stocks.map(s => s.symbol).join(', ')}]`,
              });

              break;
            }

            case 'get_events': {
              const { events } = part.args;

              reply.update(
                <BotCard>
                  <EventsSkeleton />
                </BotCard>,
              );

              await sleep(1000);

              reply.update(
                <BotCard>
                  <Events events={events} />
                </BotCard>,
              );

              toolResponses.push({
                ...part,
                type: 'tool-result',
                result: `[Get events ${JSON.stringify(events)}]`,
              });

              break;
            }

            case 'show_stock_price': {
              const { symbol, price, delta } = part.args;

              reply.update(
                <BotCard>
                  <StockSkeleton />
                </BotCard>,
              );

              await sleep(1000);

              reply.update(
                <BotCard>
                  <Stock name={symbol} price={price} delta={delta} />
                </BotCard>,
              );

              toolResponses.push({
                ...part,
                type: 'tool-result',
                result: `[Price of ${symbol} = ${price}]`,
              });

              break;
            }

            case 'show_stock_purchase_ui': {
              const { symbol, price, numberOfShares: number } = part.args;
              const numberOfShares = number ?? 100;

              if (numberOfShares <= 0 || numberOfShares > 1000) {
                reply.done(<BotMessage>Invalid amount</BotMessage>);

                toolResponses.push({
                  ...part,
                  type: 'tool-result',
                  result: `[Invalid amount]`,
                });

                break;
              }

              reply.update(
                <>
                  <BotMessage>
                    Sure!{' '}
                    {typeof numberOfShares === 'number'
                      ? `Click the button below to purchase ${numberOfShares} shares of $${symbol}:`
                      : `How many $${symbol} would you like to purchase?`}
                  </BotMessage>
                  <BotCard showAvatar={false}>
                    <Purchase
                      defaultAmount={numberOfShares}
                      name={symbol}
                      price={+price}
                    />
                  </BotCard>
                </>,
              );

              toolResponses.push({
                ...part,
                type: 'tool-result',
                result: `[UI for purchasing ${numberOfShares} shares of ${symbol}. Current price = ${price}, total cost = ${
                  numberOfShares * price
                }]`,
              });
            }
          }

          break;
        }

        case 'error':
          console.error('Error:', part.error);
          break;
      }
    }

    reply.done();
    aiState.done([
      ...aiState.get(),
      {
        role: 'assistant',
        content: [{ type: 'text', text: fullResponse }, ...toolCalls],
      },
      ...(toolResponses.length > 0
        ? [{ role: 'tool' as const, content: toolResponses }]
        : []),
    ]);
  });

  return {
    id: Date.now(),
    display: reply.value,
  };
}

// Define necessary types and create the AI.

const initialAIState: (ExperimentalMessage & {
  id?: string;
})[] = [];

const initialUIState: {
  id: number;
  display: React.ReactNode;
}[] = [];

export const AI = createAI({
  actions: {
    submitUserMessage,
    confirmPurchase,
  },
  initialUIState,
  initialAIState,
});
