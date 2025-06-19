import { ValueOf } from '../../src/util/value-of';
import { Tool } from '../tool';
import { ToToolsWithDefinedExecute } from './tool-result';
import { ToolSet } from './tool-set';

type ToToolErrorObject<TOOLS extends ToolSet> = ValueOf<{
  [NAME in keyof TOOLS]: {
    type: 'tool-error';
    toolCallId: string;
    toolName: NAME & string;
    input: TOOLS[NAME] extends Tool<infer P> ? P : never;
    error: unknown;
  };
}>;

export type ToolErrorUnion<TOOLS extends ToolSet> = ToToolErrorObject<
  ToToolsWithDefinedExecute<TOOLS>
>;

export type ToolErrorArray<TOOLS extends ToolSet> = Array<
  ToolErrorUnion<TOOLS>
>;
