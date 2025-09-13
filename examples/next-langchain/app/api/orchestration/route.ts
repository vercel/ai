import { toTaggedUIMessageStream } from '@ai-sdk/langchain';
import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { RunnableLambda } from '@langchain/core/runnables';
import { createUIMessageStreamResponse, UIMessage } from 'ai';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  const {
    messages,
  }: {
    messages: UIMessage[];
  } = await req.json();

  // Get the user's question
  const userQuestion = messages[messages.length - 1].parts
    .map(part => (part.type === 'text' ? part.text : ''))
    .join('');

  // Stage 1: Research Bot - gathers information
  const researchBot = new ChatOpenAI({
    model: 'gpt-3.5-turbo-0125',
    temperature: 0,
  }).withConfig({
    tags: ['stage:research'],
  });

  // Stage 2: Synthesis Bot - creates final answer
  const synthesisBot = new ChatOpenAI({
    model: 'gpt-3.5-turbo-0125',
    temperature: 0.3,
  }).withConfig({
    tags: ['stage:synthesis'],
  });

  // Create prompt templates
  const researchTemplate = ChatPromptTemplate.fromTemplate(
    'Please research this topic and gather relevant information: {question}',
  );

  const synthesisTemplate = ChatPromptTemplate.fromTemplate(
    'Based on this research: {research}\n\nOriginal question: {question}\n\nPlease provide a well-structured, comprehensive answer.',
  );

  // Create the chain
  const chain = researchTemplate
    .pipe(researchBot)
    .pipe(
      RunnableLambda.from((research: any) => ({
        research: research.content,
        question: userQuestion,
      })),
    )
    .pipe(synthesisTemplate)
    .pipe(synthesisBot);

  // Stream the chain execution - force v2 type since TypeScript detection is broken
  const stream = chain.streamEvents(
    { question: userQuestion },
    { version: 'v2' as any },
  );

  return createUIMessageStreamResponse({
    stream: toTaggedUIMessageStream(stream, [
      'stage:research',
      'stage:synthesis',
    ]),
  });
}
