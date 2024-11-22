import { JSONValue } from '@ai-sdk/provider';

export type RunState = {
  runId: string;
  state: string;
  agent: string;
  context: JSONValue;
  createdAt: number;
  step: number;
};
