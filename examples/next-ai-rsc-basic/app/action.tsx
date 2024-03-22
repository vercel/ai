import { OpenAI } from 'openai';
import { createAI, getMutableAIState, render } from 'ai/rsc';
import { z } from 'zod';

interface FlightInfo {
  readonly flightNumber: string;
  readonly departure: string;
  readonly arrival: string;
}

interface FlightCardProps {
  readonly flightInfo: FlightInfo;
}

type AIStateItem =
  | {
      readonly role: 'user' | 'assistant' | 'system';
      readonly content: string;
    }
  | {
      readonly role: 'function';
      readonly content: string;
      readonly name: string;
    };

interface UIStateItem {
  readonly id: number;
  readonly display: React.ReactNode;
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function getFlightInfo(flightNumber: string): Promise<FlightInfo> {
  return {
    flightNumber,
    departure: 'New York',
    arrival: 'San Francisco',
  };
}

function Spinner() {
  return <div>Loading...</div>;
}

function FlightCard({ flightInfo }: FlightCardProps) {
  return (
    <div>
      <h2>Flight Information</h2>
      <p>Flight Number: {flightInfo.flightNumber}</p>
      <p>Departure: {flightInfo.departure}</p>
      <p>Arrival: {flightInfo.arrival}</p>
    </div>
  );
}

async function submitUserMessage(userInput: string): Promise<UIStateItem> {
  'use server';

  const aiState = getMutableAIState<typeof AI>();

  aiState.update([...aiState.get(), { role: 'user', content: userInput }]);

  const ui = render({
    model: 'gpt-4-0125-preview',
    provider: openai,
    messages: [
      { role: 'system', content: 'You are a flight assistant' },
      { role: 'user', content: userInput },
      ...aiState.get(),
    ],
    text: ({ content, done }) => {
      if (done) {
        aiState.done([...aiState.get(), { role: 'assistant', content }]);
      }

      return <p>{content}</p>;
    },
    tools: {
      get_flight_info: {
        description: 'Get the information for a flight',
        parameters: z
          .object({
            flightNumber: z.string().describe('the number of the flight'),
          })
          .required(),
        render: async function* ({ flightNumber }) {
          yield <Spinner />;

          const flightInfo = await getFlightInfo(flightNumber);

          aiState.done([
            ...aiState.get(),
            {
              role: 'function',
              name: 'get_flight_info',
              content: JSON.stringify(flightInfo),
            },
          ]);

          return <FlightCard flightInfo={flightInfo} />;
        },
      },
    },
  });

  return { id: Date.now(), display: ui };
}

const initialAIState: AIStateItem[] = [];
const initialUIState: UIStateItem[] = [];

export const AI = createAI({
  actions: { submitUserMessage },
  initialUIState,
  initialAIState,
});
