/**
 * Type tests for McpToolSet compatibility with ToolSet from 'ai' package.
 * 
 * This file verifies that:
 * 1. McpToolSet<'automatic'> is assignable to ToolSet
 * 2. The tools returned from mcpClient.tools() can be passed to streamText/generateText
 * 
 * See: https://github.com/vercel/ai/issues/XXXX
 */
import { describe, expectTypeOf, it } from 'vitest';
import { Tool } from '@ai-sdk/provider-utils';
import { McpToolSet, CallToolResult } from './types';

// Simulate the ToolSet type from 'ai' package to avoid circular dependency
// This matches the definition in packages/ai/src/generate-text/tool-set.ts
type ToolSet = Record<
  string,
  (Tool<never, never> | Tool<any, any> | Tool<any, never> | Tool<never, any>) &
    Pick<
      Tool<any, any>,
      | 'execute'
      | 'onInputAvailable'
      | 'onInputStart'
      | 'onInputDelta'
      | 'needsApproval'
    >
>;

// This is the type returned by mcpClient.tools() when no schemas are provided
type McpToolSetAutomatic = McpToolSet<'automatic'>;

describe('McpToolSet type compatibility', () => {
  it('McpToolSet<automatic> should be assignable to ToolSet', () => {
    // This test ensures that the tools returned from mcpClient.tools()
    // can be used with streamText/generateText without type casting
    expectTypeOf<McpToolSetAutomatic>().toMatchTypeOf<ToolSet>();
  });

  it('individual McpToolBase should be compatible with ToolSet values', () => {
    // McpToolBase<unknown> is what each tool in McpToolSet<'automatic'> is typed as
    type McpToolBase = McpToolSetAutomatic[string];
    type ToolSetValue = ToolSet[string];
    
    expectTypeOf<McpToolBase>().toMatchTypeOf<ToolSetValue>();
  });

  it('Tool<unknown, CallToolResult> should be assignable to Tool<any, any>', () => {
    // This is the fundamental compatibility requirement
    type UnknownTool = Tool<unknown, CallToolResult>;
    type AnyTool = Tool<any, any>;
    
    expectTypeOf<UnknownTool>().toMatchTypeOf<AnyTool>();
  });
});
