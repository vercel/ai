import { JSONValue } from '@ai-sdk/provider';
import { CoreMessage } from 'ai';

export type RunState = {
  runId: string;
  task: string;
  workflow: string;
  context: JSONValue;
  messages: CoreMessage[];
  createdAt: number;
  step: number;
};
