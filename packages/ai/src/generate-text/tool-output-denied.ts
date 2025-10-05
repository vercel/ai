import { ValueOf } from '../util/value-of';
import { ToolSet } from './tool-set';

export type StaticToolOutputDenied<TOOLS extends ToolSet> = ValueOf<{
  [NAME in keyof TOOLS]: {
    type: 'tool-output-denied';
    toolCallId: string;
    toolName: NAME & string;
    providerExecuted?: boolean;
    dynamic?: false | undefined;
  };
}>;

export type TypedToolOutputDenied<TOOLS extends ToolSet> =
  StaticToolOutputDenied<TOOLS>;
