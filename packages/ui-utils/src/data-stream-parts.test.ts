import { ToolCall, ToolResult } from '@ai-sdk/provider-utils';
import { formatDataStreamPart, parseDataStreamPart } from './data-stream-parts';

describe('data-stream-parts', () => {
  describe('formatDataStreamPart', () => {
    it('should escape newlines in text', () => {
      expect(formatDataStreamPart('text', 'value\nvalue')).toEqual(
        '0:"value\\nvalue"\n',
      );
    });

    it('should escape newlines in data objects', () => {
      expect(formatDataStreamPart('data', [{ test: 'value\nvalue' }])).toEqual(
        '2:[{"test":"value\\nvalue"}]\n',
      );
    });
  });

  describe('parseStreamPart', () => {
    it('should parse a text line', () => {
      const input = '0:"Hello, world!"';

      expect(parseDataStreamPart(input)).toEqual({
        type: 'text',
        value: 'Hello, world!',
      });
    });

    it('should parse a data line', () => {
      const input = '2:[{"test":"value"}]';
      const expectedOutput = { type: 'data', value: [{ test: 'value' }] };
      expect(parseDataStreamPart(input)).toEqual(expectedOutput);
    });

    it('should parse a message data line', () => {
      const input = '8:[{"test":"value"}]';
      const expectedOutput = {
        type: 'message_annotations',
        value: [{ test: 'value' }],
      };
      expect(parseDataStreamPart(input)).toEqual(expectedOutput);
    });

    it('should throw an error if the input does not contain a colon separator', () => {
      const input = 'invalid stream string';
      expect(() => parseDataStreamPart(input)).toThrow();
    });

    it('should throw an error if the input contains an invalid type', () => {
      const input = '55:test';
      expect(() => parseDataStreamPart(input)).toThrow();
    });

    it("should throw error if the input's JSON is invalid", () => {
      const input = '0:{"test":"value"';
      expect(() => parseDataStreamPart(input)).toThrow();
    });
  });
});

describe('tool_call stream part', () => {
  it('should format a tool_call stream part', () => {
    const toolCall: ToolCall<string, any> = {
      toolCallId: 'tc_0',
      toolName: 'example_tool',
      args: { test: 'value' },
    };

    expect(formatDataStreamPart('tool_call', toolCall)).toEqual(
      `9:${JSON.stringify(toolCall)}\n`,
    );
  });

  it('should parse a tool_call stream part', () => {
    const toolCall: ToolCall<string, any> = {
      toolCallId: 'tc_0',
      toolName: 'example_tool',
      args: { test: 'value' },
    };

    const input = `9:${JSON.stringify(toolCall)}`;

    expect(parseDataStreamPart(input)).toEqual({
      type: 'tool_call',
      value: toolCall,
    });
  });
});

describe('tool_result stream part', () => {
  it('should format a tool_result stream part', () => {
    const toolResult: Omit<
      ToolResult<string, any, any>,
      'args' | 'toolName'
    > = {
      toolCallId: 'tc_0',
      result: 'result',
    };

    expect(formatDataStreamPart('tool_result', toolResult)).toEqual(
      `a:${JSON.stringify(toolResult)}\n`,
    );
  });

  it('should parse a tool_result stream part', () => {
    const toolResult = {
      toolCallId: 'tc_0',
      result: 'result',
    };

    const input = `a:${JSON.stringify(toolResult)}`;

    expect(parseDataStreamPart(input)).toEqual({
      type: 'tool_result',
      value: toolResult,
    });
  });
});

describe('tool_call_streaming_start stream part', () => {
  it('should format a tool_call_streaming_start stream part', () => {
    expect(
      formatDataStreamPart('tool_call_streaming_start', {
        toolCallId: 'tc_0',
        toolName: 'example_tool',
      }),
    ).toEqual(`b:{"toolCallId":"tc_0","toolName":"example_tool"}\n`);
  });

  it('should parse a tool_call_streaming_start stream part', () => {
    const input = `b:{"toolCallId":"tc_0","toolName":"example_tool"}`;

    expect(parseDataStreamPart(input)).toEqual({
      type: 'tool_call_streaming_start',
      value: { toolCallId: 'tc_0', toolName: 'example_tool' },
    });
  });
});

describe('tool_call_delta stream part', () => {
  it('should format a tool_call_delta stream part', () => {
    expect(
      formatDataStreamPart('tool_call_delta', {
        toolCallId: 'tc_0',
        argsTextDelta: 'delta',
      }),
    ).toEqual(`c:{"toolCallId":"tc_0","argsTextDelta":"delta"}\n`);
  });

  it('should parse a tool_call_delta stream part', () => {
    const input = `c:{"toolCallId":"tc_0","argsTextDelta":"delta"}`;
    expect(parseDataStreamPart(input)).toEqual({
      type: 'tool_call_delta',
      value: { toolCallId: 'tc_0', argsTextDelta: 'delta' },
    });
  });
});

describe('finish_message stream part', () => {
  it('should format a finish_message stream part', () => {
    expect(
      formatDataStreamPart('finish_message', {
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 20 },
      }),
    ).toEqual(
      `d:{"finishReason":"stop","usage":{"promptTokens":10,"completionTokens":20}}\n`,
    );
  });

  it('should format a finish_message stream part without usage information', () => {
    expect(
      formatDataStreamPart('finish_message', {
        finishReason: 'stop',
      }),
    ).toEqual(`d:{"finishReason":"stop"}\n`);
  });

  it('should parse a finish_message stream part', () => {
    const input = `d:{"finishReason":"stop","usage":{"promptTokens":10,"completionTokens":20}}`;
    expect(parseDataStreamPart(input)).toEqual({
      type: 'finish_message',
      value: {
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 20 },
      },
    });
  });

  it('should parse a finish_message with null completion and prompt tokens', () => {
    const input = `d:{"finishReason":"stop","usage":{"promptTokens":null,"completionTokens":null}}`;
    expect(parseDataStreamPart(input)).toEqual({
      type: 'finish_message',
      value: {
        finishReason: 'stop',
        usage: { promptTokens: NaN, completionTokens: NaN },
      },
    });
  });

  it('should parse a finish_message without usage information', () => {
    const input = `d:{"finishReason":"stop"}`;
    expect(parseDataStreamPart(input)).toEqual({
      type: 'finish_message',
      value: {
        finishReason: 'stop',
      },
    });
  });
});

describe('finish_step stream part', () => {
  it('should format a finish_step stream part', () => {
    expect(
      formatDataStreamPart('finish_step', {
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 20 },
        isContinued: false,
      }),
    ).toEqual(
      `e:{"finishReason":"stop","usage":{"promptTokens":10,"completionTokens":20},"isContinued":false}\n`,
    );
  });

  it('should format a finish_step stream part without usage or continue information ', () => {
    expect(
      formatDataStreamPart('finish_step', {
        finishReason: 'stop',
        isContinued: false,
      }),
    ).toEqual(`e:{"finishReason":"stop","isContinued":false}\n`);
  });

  it('should parse a finish_step stream part', () => {
    const input = `e:{"finishReason":"stop","usage":{"promptTokens":10,"completionTokens":20},"isContinued":true}`;
    expect(parseDataStreamPart(input)).toEqual({
      type: 'finish_step',
      value: {
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 20 },
        isContinued: true,
      },
    });
  });

  it('should parse a finish_step with null completion and prompt tokens', () => {
    const input = `e:{"finishReason":"stop","usage":{"promptTokens":null,"completionTokens":null}}`;
    expect(parseDataStreamPart(input)).toEqual({
      type: 'finish_step',
      value: {
        finishReason: 'stop',
        usage: { promptTokens: NaN, completionTokens: NaN },
        isContinued: false,
      },
    });
  });

  it('should parse a finish_step without usage information', () => {
    const input = `e:{"finishReason":"stop","usage":null}`;
    expect(parseDataStreamPart(input)).toEqual({
      type: 'finish_step',
      value: {
        finishReason: 'stop',
        isContinued: false,
      },
    });
  });
});

describe('start_step stream part', () => {
  it('should format a start_step stream part', () => {
    expect(
      formatDataStreamPart('start_step', { messageId: 'step_123' }),
    ).toEqual('f:{"messageId":"step_123"}\n');
  });

  it('should parse a start_step stream part', () => {
    const input = 'f:{"messageId":"step_123"}';
    expect(parseDataStreamPart(input)).toEqual({
      type: 'start_step',
      value: { messageId: 'step_123' },
    });
  });

  it('should throw an error if missing the id property', () => {
    const input = 'f:{}';
    expect(() => parseDataStreamPart(input)).toThrow();
  });

  it('should throw an error if the messageId property is not a string', () => {
    const input = 'f:{"messageId":123}';
    expect(() => parseDataStreamPart(input)).toThrow();
  });
});

describe('reasoning stream part', () => {
  it('should format a reasoning stream part', () => {
    expect(formatDataStreamPart('reasoning', 'test reasoning')).toEqual(
      'g:"test reasoning"\n',
    );
  });

  it('should parse a reasoning stream part', () => {
    const input = 'g:"test reasoning"';
    expect(parseDataStreamPart(input)).toEqual({
      type: 'reasoning',
      value: 'test reasoning',
    });
  });

  it('should throw an error if the value is not a string', () => {
    const input = 'g:{"invalid": "object"}';
    expect(() => parseDataStreamPart(input)).toThrow(
      '"reasoning" parts expect a string value.',
    );
  });
});

describe('source stream part', () => {
  it('should format a source stream part', () => {
    const source = {
      sourceType: 'url',
      id: 'source_1',
      url: 'https://example.com',
      title: 'Example Source',
    } as const;

    expect(formatDataStreamPart('source', source)).toEqual(
      `h:${JSON.stringify(source)}\n`,
    );
  });

  it('should parse a source stream part', () => {
    const source = {
      sourceType: 'url',
      id: 'source_1',
      url: 'https://example.com',
      title: 'Example Source',
    };

    expect(parseDataStreamPart(`h:${JSON.stringify(source)}`)).toEqual({
      type: 'source',
      value: source,
    });
  });

  it('should throw an error if the source value is not an object (e.g., a string)', () => {
    expect(() => parseDataStreamPart(`h:"not an object"`)).toThrow(
      '"source" parts expect a Source object.',
    );
  });

  it('should throw an error if the source value is null', () => {
    expect(() => parseDataStreamPart(`h:null`)).toThrow(
      '"source" parts expect a Source object.',
    );
  });
});

describe('redacted_reasoning stream part', () => {
  it('should format a redacted_reasoning stream part', () => {
    expect(
      formatDataStreamPart('redacted_reasoning', {
        data: 'test redacted reasoning',
      }),
    ).toEqual('i:{"data":"test redacted reasoning"}\n');
  });

  it('should parse a redacted_reasoning stream part', () => {
    const input = 'i:{"data":"test redacted reasoning"}';
    expect(parseDataStreamPart(input)).toEqual({
      type: 'redacted_reasoning',
      value: { data: 'test redacted reasoning' },
    });
  });

  it('should throw an error if the value is not an object with a data property', () => {
    const input = 'i:"invalid string"';
    expect(() => parseDataStreamPart(input)).toThrow(
      '"redacted_reasoning" parts expect an object with a "data" property.',
    );
  });
});

describe('reasoning_signature stream part', () => {
  it('should format a reasoning_signature stream part', () => {
    expect(
      formatDataStreamPart('reasoning_signature', {
        signature: 'test signature',
      }),
    ).toEqual('j:{"signature":"test signature"}\n');
  });

  it('should parse a reasoning_signature stream part', () => {
    const input = 'j:{"signature":"test signature"}';
    expect(parseDataStreamPart(input)).toEqual({
      type: 'reasoning_signature',
      value: { signature: 'test signature' },
    });
  });

  it('should throw an error if the value is not an object with a signature property', () => {
    const input = 'j:"invalid string"';
    expect(() => parseDataStreamPart(input)).toThrow(
      '"reasoning_signature" parts expect an object with a "signature" property.',
    );
  });
});

describe('file stream part', () => {
  it('should format a file stream part', () => {
    const file = {
      data: 'file content',
      mimeType: 'text/plain',
    };

    expect(formatDataStreamPart('file', file)).toEqual(
      `k:${JSON.stringify(file)}\n`,
    );
  });

  it('should parse a file stream part', () => {
    const file = {
      data: 'file content',
      mimeType: 'text/plain',
    };

    const input = `k:${JSON.stringify(file)}`;
    expect(parseDataStreamPart(input)).toEqual({
      type: 'file',
      value: file,
    });
  });

  it('should throw an error if the file value is not an object', () => {
    const input = 'k:"not an object"';
    expect(() => parseDataStreamPart(input)).toThrow(
      '"file" parts expect an object with a "data" and "mimeType" property.',
    );
  });

  it('should throw an error if the file object is missing required properties', () => {
    const invalidFile = { name: 'test.txt' };
    const input = `k:${JSON.stringify(invalidFile)}`;
    expect(() => parseDataStreamPart(input)).toThrow(
      '"file" parts expect an object with a "data" and "mimeType" property.',
    );
  });
});
