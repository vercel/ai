// @ts-nocheck
import { generateText } from 'ai';

interface MessageReasoningProps {
  isLoading: boolean;
  reasoning: string;
}

export function MessageReasoning({
  isLoading,
  reasoning,
}: MessageReasoningProps) {
  return <div>{isLoading ? 'Loading reasoning...' : reasoning}</div>;
}

async function run() {
  const { steps } = await generateText({
    model: 'gpt-4',
    prompt: 'Explain in steps',
  });

  for (const step of steps) {
    console.log(step.reasoningText);
  }

  steps.forEach(step => {
    console.log(step.reasoningText);
  });
}
