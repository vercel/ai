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

  console.log(result.reasoning);
  console.log(result.reasoningDetails);
  console.log(result['reasoning']);

  const { reasoning, reasoningDetails: details } = await streamText({
    model: 'gpt-4',
    prompt: 'Explain your reasoning',
  });

  const { reasoning: resultReasoning } = result;
  const { steps } = await generateText({
    model: 'gpt-4',
    prompt: 'Explain in steps',
  });

  for (const step of steps) {
    console.log(step.reasoning);
  }

  console.log(steps[0].reasoning);
  steps.map(step => step.reasoning);

  steps.forEach(({ reasoning }) => {
    console.log(reasoning);
  });

  const typedResult: GenerateTextResult<any, any, any> = {} as any;
  console.log(typedResult.reasoningDetails);

  const typedStep: StepResult<any> = {} as any;
  console.log(typedStep.reasoning);

  const oldResult = {
    reasoning: 'text',
    reasoningDetails: [],
  } satisfies GenerateTextResult<any, any, any>;

  return { reasoning, details, resultReasoning, oldResult };
}
