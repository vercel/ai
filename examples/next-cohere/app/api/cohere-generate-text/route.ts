import { cohere, createCohere } from '@ai-sdk/cohere';
import { generateText } from 'ai';
import 'dotenv/config';

import { streamText } from 'ai';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function GET(req: Request) {
  // Extract the `prompt` from the body of the request
//   const { prompt } = await req.json();
console.log(process.env.COHERE_API_KEY);
    const cohereProvider = createCohere({
        apiKey: process.env.COHERE_API_KEY
    })

  // Ask OpenAI for a streaming chat completion given the prompt
  const result = await generateText({
    model: cohereProvider.languageModel('command-a-03-2025'),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'What are the key benefits of artificial intelligence mentioned in these documents?',
          },
          {
            type: 'file',
            data: `Artificial Intelligence (AI) has revolutionized many industries by providing:
1. Automation of repetitive tasks
2. Enhanced decision-making through data analysis
3. Improved customer service through chatbots
4. Predictive analytics for better planning
5. Cost reduction through efficiency gains`,
            mediaType: 'text/plain',
            filename: 'ai-benefits.txt',
          },
          {
            type: 'file',
            data: `Machine Learning, a subset of AI, offers additional advantages:
- Pattern recognition in large datasets
- Personalized recommendations
- Fraud detection and prevention
- Medical diagnosis assistance
- Natural language processing capabilities`,
            mediaType: 'text/plain',
            filename: 'ml-advantages.txt',
          },
        ],
      },
    ],
  });

  console.log('Generated response:');
  console.log(result.text);

  console.log('\nFull result object:');
  console.log(JSON.stringify(result, null, 2));

  // Respond with the stream
  return new Response(JSON.stringify({ text: result.text }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
