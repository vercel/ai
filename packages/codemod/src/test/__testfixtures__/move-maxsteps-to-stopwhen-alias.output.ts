// @ts-nocheck
import { generateText as GT, isStepCount } from 'ai';
import { useChat as UC } from '@ai-sdk/react';

async function foo() {
  const result = await GT({
    model: 'gpt-4',
    messages: [],
    stopWhen: isStepCount(5)
  });

  const maxSteps = 5;

  await GT({
    model: 'gpt-4',
    messages: [],
    stopWhen: isStepCount(maxSteps)
  });

  await GT({
    model: 'gpt-4',
    messages: [],
    stopWhen: isStepCount(5 + 5)
  });

  await GT({
    model: 'gpt-4',
    messages: [],
    stopWhen: isStepCount(maxSteps + 5)
  });

  const obj = {
    model: 'gpt-4',
    messages: [],
    stopWhen: isStepCount(maxSteps + 5)
  }

  await GT(obj);

  const obj2 = {
    model: 'gpt-4',
    messages: [],
    maxSteps: maxSteps + 5,
  }

  return result;
}

export function ChatComponent() {
  UC({
    model: 'gpt-4',
    /* FIXME(@ai-sdk-upgrade-v5): The maxSteps parameter has been removed from useChat. You should now use server-side `stopWhen` conditions for multi-step tool execution control. https://ai-sdk.dev/docs/migration-guides/migration-guide-5-0#maxsteps-removal */
    maxSteps: 7,
  });
}

const config = {
  maxSteps: 10,
  foo: 'bar',
};
