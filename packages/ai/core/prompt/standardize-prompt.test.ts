import { InvalidPromptError } from '@ai-sdk/provider';
import { standardizePrompt } from './standardize-prompt';

describe('message prompt', () => {
  it('should throw InvalidPromptError when system message has parts', () => {
    expect(() => {
      standardizePrompt({
        prompt: {
          messages: [
            {
              role: 'system',
              content: [{ type: 'text', text: 'test' }] as any,
            },
          ],
        },
        tools: undefined,
      });
    }).toThrowErrorMatchingInlineSnapshot(`
      [AI_InvalidPromptError: Invalid prompt: messages must be an array of CoreMessage or UIMessage
      Validation error: Type validation failed: Value: [{"role":"system","content":[{"type":"text","text":"test"}]}].
      Error message: [
        {
          "code": "invalid_union",
          "unionErrors": [
            {
              "issues": [
                {
                  "code": "invalid_type",
                  "expected": "string",
                  "received": "array",
                  "path": [
                    0,
                    "content"
                  ],
                  "message": "Expected string, received array"
                }
              ],
              "name": "ZodError"
            },
            {
              "issues": [
                {
                  "received": "system",
                  "code": "invalid_literal",
                  "expected": "user",
                  "path": [
                    0,
                    "role"
                  ],
                  "message": "Invalid literal value, expected \\"user\\""
                }
              ],
              "name": "ZodError"
            },
            {
              "issues": [
                {
                  "received": "system",
                  "code": "invalid_literal",
                  "expected": "assistant",
                  "path": [
                    0,
                    "role"
                  ],
                  "message": "Invalid literal value, expected \\"assistant\\""
                }
              ],
              "name": "ZodError"
            },
            {
              "issues": [
                {
                  "received": "system",
                  "code": "invalid_literal",
                  "expected": "tool",
                  "path": [
                    0,
                    "role"
                  ],
                  "message": "Invalid literal value, expected \\"tool\\""
                },
                {
                  "received": "text",
                  "code": "invalid_literal",
                  "expected": "tool-result",
                  "path": [
                    0,
                    "content",
                    0,
                    "type"
                  ],
                  "message": "Invalid literal value, expected \\"tool-result\\""
                },
                {
                  "code": "invalid_type",
                  "expected": "string",
                  "received": "undefined",
                  "path": [
                    0,
                    "content",
                    0,
                    "toolCallId"
                  ],
                  "message": "Required"
                },
                {
                  "code": "invalid_type",
                  "expected": "string",
                  "received": "undefined",
                  "path": [
                    0,
                    "content",
                    0,
                    "toolName"
                  ],
                  "message": "Required"
                }
              ],
              "name": "ZodError"
            }
          ],
          "path": [
            0
          ],
          "message": "Invalid input"
        }
      ]]
    `);
  });

  it('should throw InvalidPromptError when messages array is empty', () => {
    expect(() => {
      standardizePrompt({
        prompt: {
          messages: [],
        },
        tools: undefined,
      });
    }).toThrowErrorMatchingInlineSnapshot(
      `[AI_InvalidPromptError: Invalid prompt: messages must not be empty]`,
    );
  });
});
