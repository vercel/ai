import { JSONValue } from '@ai-sdk/provider';

export type RunState = {
  runId: string;
  task: string;
  workflow: string;
  context: JSONValue;
  createdAt: number;
  step: number;
};
