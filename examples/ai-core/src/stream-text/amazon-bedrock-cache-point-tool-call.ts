import { bedrock } from '@ai-sdk/amazon-bedrock';
import {
  streamText,
  tool,
  ModelMessage,
  ToolCallPart,
  ToolResultPart,
} from 'ai';
import 'dotenv/config';
import { z } from 'zod';

const messages: ModelMessage[] = [];

const weatherTool = tool({
  description: 'Get the weather in a location',
  parameters: z.object({
    location: z.string().describe('The location to get the weather for'),
  }),
  // location below is inferred to be a string:
  execute: async ({ location }) => ({
    location,
    temperature: weatherData[location],
  }),
});

const weatherData: Record<string, number> = {
  'New York': 72.4,
  'Los Angeles': 84.2,
  Chicago: 68.9,
  Houston: 89.7,
  Phoenix: 95.6,
  Philadelphia: 71.3,
  'San Antonio': 88.4,
  'San Diego': 76.8,
  Dallas: 86.5,
  'San Jose': 75.2,
  Austin: 87.9,
  Jacksonville: 83.6,
  'Fort Worth': 85.7,
  Columbus: 69.8,
  'San Francisco': 68.4,
  Charlotte: 77.3,
  Indianapolis: 70.6,
  Seattle: 65.9,
  Denver: 71.8,
  'Washington DC': 74.5,
  Boston: 69.7,
  'El Paso': 91.2,
  Detroit: 67.8,
  Nashville: 78.4,
  Portland: 66.7,
  Memphis: 81.3,
  'Oklahoma City': 82.9,
  'Las Vegas': 93.4,
  Louisville: 75.6,
  Baltimore: 73.8,
  Milwaukee: 66.5,
  Albuquerque: 84.7,
  Tucson: 92.3,
  Fresno: 87.2,
  Sacramento: 82.5,
  Mesa: 94.8,
  'Kansas City': 77.9,
  Atlanta: 80.6,
  Miami: 88.3,
  Raleigh: 76.4,
  Omaha: 73.5,
  'Colorado Springs': 70.2,
  'Long Beach': 79.8,
  'Virginia Beach': 78.1,
  Oakland: 71.4,
  Minneapolis: 65.8,
  Tulsa: 81.7,
  Arlington: 85.3,
  Tampa: 86.9,
  'New Orleans': 84.5,
  Wichita: 79.4,
  Cleveland: 68.7,
  Bakersfield: 88.6,
  Aurora: 72.3,
  Anaheim: 81.5,
  Honolulu: 84.9,
  'Santa Ana': 80.7,
  Riverside: 89.2,
  'Corpus Christi': 87.6,
  Lexington: 74.8,
  Henderson: 92.7,
  Stockton: 83.9,
  'Saint Paul': 66.2,
  Cincinnati: 72.9,
  Pittsburgh: 70.4,
  Greensboro: 75.9,
  Anchorage: 52.3,
  Plano: 84.8,
  Lincoln: 74.2,
  Orlando: 85.7,
  Irvine: 78.9,
  Newark: 71.6,
  Toledo: 69.3,
  Durham: 77.1,
  'Chula Vista': 77.4,
  'Fort Wayne': 71.2,
  'Jersey City': 72.7,
  'St. Petersburg': 85.4,
  Laredo: 90.8,
  Madison: 67.3,
  Chandler: 93.6,
  Buffalo: 66.8,
  Lubbock: 83.2,
  Scottsdale: 94.1,
  Reno: 76.5,
  Glendale: 92.8,
  Gilbert: 93.9,
  'Winston-Salem': 76.2,
  Irving: 85.1,
  Hialeah: 87.8,
  Garland: 84.6,
  Fremont: 73.9,
  Boise: 75.3,
  Richmond: 76.7,
  'Baton Rouge': 83.7,
  Spokane: 67.4,
  'Des Moines': 72.1,
  Tacoma: 66.3,
  'San Bernardino': 88.1,
  Modesto: 84.3,
  Fontana: 87.4,
  'Santa Clarita': 82.6,
  Birmingham: 81.9,
};

async function main() {
  let toolResponseAvailable = false;

  const result = streamText({
    model: bedrock('anthropic.claude-3-haiku-20240307-v1:0'),
    maxOutputTokens: 512,
    tools: {
      weather: weatherTool,
    },
    toolChoice: 'required',
    prompt: 'What is the weather in San Francisco?',
    // TODO: need a way to set cachePoint on `tools`.
    providerOptions: {
      bedrock: {
        cachePoint: {
          type: 'default',
        },
      },
    },
  });

  let fullResponse = '';
  const toolCalls: ToolCallPart[] = [];
  const toolResponses: ToolResultPart[] = [];

  for await (const delta of result.fullStream) {
    switch (delta.type) {
      case 'text': {
        fullResponse += delta.text;
        process.stdout.write(delta.text);
        break;
      }

      case 'tool-call': {
        toolCalls.push(delta);

        process.stdout.write(
          `\nTool call: '${delta.toolName}' ${JSON.stringify(delta.args)}`,
        );
        break;
      }

      case 'tool-result': {
        toolResponses.push(delta);

        process.stdout.write(
          `\nTool response: '${delta.toolName}' ${JSON.stringify(
            delta.result,
          )}`,
        );
        break;
      }
    }
  }
  process.stdout.write('\n\n');

  messages.push({
    role: 'assistant',
    content: [{ type: 'text', text: fullResponse }, ...toolCalls],
  });

  if (toolResponses.length > 0) {
    messages.push({ role: 'tool', content: toolResponses });
  }

  toolResponseAvailable = toolCalls.length > 0;
  console.log('Messages:', messages[0].content);
  console.log(JSON.stringify(result.providerMetadata, null, 2));
}

main().catch(console.error);
