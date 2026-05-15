// @ts-nocheck
import {
  generateText,
  streamText,
  type GenerateTextResult,
  type StepResult,
} from 'ai';

interface MessageReasoningProps {
  isLoading: boolean;
  reasoning: string;
  reasoningDetails?: string[];
}

export function MessageReasoning({
  isLoading,
  reasoning,
}: MessageReasoningProps) {
  const local = {
    reasoning,
    reasoningDetails: [],
  };
  const { reasoning: localReasoning } = local;

  console.log(localReasoning, local.reasoning, local.reasoningDetails);

  return <div>{isLoading ? 'Loading reasoning...' : reasoning}</div>;
}

async function run() {
  const result = await generateText({
    model: 'gpt-4',
    prompt: 'Explain your reasoning',
  });

  console.log(result.reasoningText);
  console.log(result.reasoning);
  console.log(result['reasoningText']);

  const { reasoningText: reasoning, reasoning: details } = await streamText({
    model: 'gpt-4',
    prompt: 'Explain your reasoning',
  });

  const { reasoningText: resultReasoning } = result;
  const { steps } = await generateText({
    model: 'gpt-4',
    prompt: 'Explain in steps',
  });

  for (const step of steps) {
    console.log(step.reasoningText);
  }

  console.log(steps[0].reasoningText);
  steps.map(step => step.reasoningText);

  steps.forEach(({ reasoningText: reasoning }) => {
    console.log(reasoning);
  });

  const typedResult: GenerateTextResult<any, any, any> = {} as any;
  console.log(typedResult.reasoning);

  const typedStep: StepResult<any> = {} as any;
  console.log(typedStep.reasoningText);

  const oldResult = {
    reasoningText: 'text',
    reasoning: [],
  } satisfies GenerateTextResult<any, any, any>;

  return { reasoning, details, resultReasoning, oldResult };
}
