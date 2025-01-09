describe('Tool Calls', () => {
  it('should generate text with tool calls', async () => {
    const result = await generateText({
      model,
      prompt: 'What is 2+2? Use the calculator tool to compute this.',
      tools: {
        calculator: {
          parameters: z.object({
            expression: z
              .string()
              .describe('The mathematical expression to evaluate'),
          }),
          execute: async ({ expression }) => eval(expression).toString(),
        },
      },
    });

    expect(result.toolCalls?.[0]).toMatchObject({
      toolName: 'calculator',
      args: { expression: '2+2' },
    });
    expect(result.toolResults?.[0].result).toBe('4');
    if (!customAssertions.skipUsage) {
      expect(result.usage?.totalTokens).toBeGreaterThan(0);
    }
  });

  it('should handle multiple sequential tool calls', async () => {
    const result = await generateText({
      model,
      prompt:
        'First calculate 2+2, then calculate the result times 3 using the calculator tool.',
      tools: {
        calculator: {
          parameters: z.object({
            expression: z.string(),
          }),
          execute: async ({ expression }) => {
            return String(eval(expression));
          },
        },
      },
    });

    expect(result.text).toContain('12'); // (2+2)*3 = 12
    expect(
      result.toolCalls?.filter(call => call.toolName === 'calculator').length,
    ).toBeGreaterThan(1);
  });

  it('should handle tool execution errors gracefully', async () => {
    const result = await generateText({
      model,
      prompt: 'Calculate 1/0 using the calculator tool.',
      tools: {
        calculator: {
          parameters: z.object({
            expression: z.string(),
          }),
          execute: async ({ expression }) => {
            const result = eval(expression);
            if (!isFinite(result)) throw new Error('Invalid calculation');
            return String(result);
          },
        },
      },
    });

    expect(result.text).toContain('error'); // Model should acknowledge the error
  });

  it('should handle complex tool interactions', async () => {
    const result = await generateText({
      model,
      prompt:
        'Create a shopping list calculator. Add bread ($2.50), milk ($3.75), and eggs ($4.25), then calculate the total.',
      tools: {
        calculator: {
          parameters: z.object({
            expression: z.string(),
          }),
          execute: async ({ expression }) => {
            return String(eval(expression));
          },
        },
        shoppingList: {
          parameters: z.object({
            action: z.enum(['add', 'total']),
            item: z.string().optional(),
            price: z.number().optional(),
          }),
          execute: async ({ action, item, price }) => {
            // Implementation details...
            return action === 'total'
              ? 'Total: $10.50'
              : `Added ${item}: $${price}`;
          },
        },
      },
    });

    expect(result.text).toContain('$10.50');
  });

  it('should validate tool chain results', async () => {
    const results: string[] = [];
    const result = await generateText({
      model,
      prompt: 'Calculate (2+3)*4 step by step using the calculator tool.',
      tools: {
        calculator: {
          parameters: z.object({
            expression: z.string(),
          }),
          execute: async ({ expression }) => {
            const value = String(eval(expression));
            results.push(value);
            return value;
          },
        },
      },
    });

    expect(results).toContain('5'); // 2+3
    expect(results).toContain('20'); // 5*4
    expect(result.text).toContain('20'); // Final result
  });

  it('should validate tool input parameters', async () => {
    const result = await generateText({
      model,
      prompt: 'Calculate the square root of -1 using the calculator tool.',
      tools: {
        calculator: {
          parameters: z.object({
            expression: z.string(),
            allowComplex: z.boolean().default(false),
          }),
          execute: async ({ expression, allowComplex }) => {
            if (!allowComplex && expression.includes('sqrt(-')) {
              throw new Error('Complex numbers not allowed');
            }
            return String(eval(expression));
          },
        },
      },
    });

    expect(result.text).toContain('complex'); // Model should mention complex numbers
  });

  it('should stream text with tool calls', async () => {
    const result = streamText({
      model,
      prompt: 'Calculate 5+7 and 3*4 using the calculator tool.',
      tools: {
        calculator: {
          parameters: z.object({
            expression: z.string(),
          }),
          execute: async ({ expression }) => eval(expression).toString(),
        },
      },
    });

    const parts = [];
    for await (const part of result.fullStream) {
      parts.push(part);
    }

    expect(parts.some(part => part.type === 'tool-call')).toBe(true);
    if (!customAssertions.skipUsage) {
      expect((await result.usage).totalTokens).toBeGreaterThan(0);
    }
  });
});
