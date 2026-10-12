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
  onEnd: callback,
});

await stream({
  model,
  prompt: 'Hello',
  onEnd: callback,
});

const agent = new AgentImplementation({
  model,
  onEnd: callback,
});

await agent.generate({
  prompt: 'Hello',
  onEnd: callback,
});

await customAgent.stream({
  prompt: 'Hello',
  onEnd: callback,
});

function callUnrelatedAgent(agent: any) {
  return agent.generate({
    onFinish: callback,
  });
}

const telemetry: Telemetry = {
  onEnd() {},
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
