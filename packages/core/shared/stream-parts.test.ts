import { parseStreamPart } from './stream-parts';

describe('stream-parts', () => {
  describe('parseStreamPart', () => {
    it('should parse a text line', () => {
      const input = '0:"Hello, world!"';

      expect(parseStreamPart(input)).toEqual({
        type: 'text',
        value: 'Hello, world!',
      });
    });

    it('should parse a function call line', () => {
      const input =
        '1:{"name":"get_current_weather","arguments":"{\\"location\\": \\"Charlottesville, Virginia\\",\\"format\\": \\"celsius\\"}"}';

      expect(parseStreamPart(input)).toEqual({
        type: 'function_call',
        value: {
          name: 'get_current_weather',
          arguments:
            '{"location": "Charlottesville, Virginia","format": "celsius"}',
        },
      });
    });

    it('should parse a data line', () => {
      const input = '2:{"test":"value"}';
      const expectedOutput = { type: 'data', value: { test: 'value' } };
      expect(parseStreamPart(input)).toEqual(expectedOutput);
    });

    it('should throw an error if the input does not contain a colon separator', () => {
      const input = 'invalid stream string';
      expect(() => parseStreamPart(input)).toThrow();
    });

    it('should throw an error if the input contains an invalid type', () => {
      const input = '55:test';
      expect(() => parseStreamPart(input)).toThrow();
    });

    it("should throw error if the input's JSON is invalid", () => {
      const input = '0:{"test":"value"';
      expect(() => parseStreamPart(input)).toThrow();
    });
  });
});
