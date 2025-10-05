import { ValueOf } from '../util/value-of';
import { ToolSet } from './tool-set';

export type StaticToolExecutionDenial<TOOLS extends ToolSet> = ValueOf<{
  [NAME in keyof TOOLS]: {
    type: 'tool-execution-denial';
    toolCallId: string;
    toolName: NAME & string;
    dynamic?: false | undefined;
  };
}>;
