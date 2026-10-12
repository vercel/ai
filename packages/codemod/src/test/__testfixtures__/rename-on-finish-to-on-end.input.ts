import {
  type Agent,
  generateText,
  streamObject,
  streamText as stream,
  type Telemetry,
  ToolLoopAgent as AgentImplementation,
} from 'ai';

declare const model: any;
declare const callback: () => void;
declare const customAgent: Agent;
declare function useChat(options: any): void;
declare function useObject(options: any): void;

await generateText({
  model,
  prompt: 'Hello',
  onFinish: callback,
});

await stream({
  model,
  prompt: 'Hello',
  onFinish: callback,
});

const agent = new AgentImplementation({
  model,
  onFinish: callback,
});

await agent.generate({
  prompt: 'Hello',
  onFinish: callback,
});

await customAgent.stream({
  prompt: 'Hello',
  onFinish: callback,
});

function callUnrelatedAgent(agent: any) {
  return agent.generate({
    onFinish: callback,
  });
}

const telemetry: Telemetry = {
  onFinish() {},
} as any;

await streamObject({
  model,
  schema: {} as any,
  prompt: 'Hello',
  onFinish: callback,
});

useChat({
  onFinish: callback,
});

useObject({
  api: '/api/object',
  schema: {} as any,
  onFinish: callback,
});

const unrelatedOptions = {
  onFinish: callback,
};
