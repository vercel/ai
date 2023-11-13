import { createChunkDecoder, getStreamString } from './utils';
import { getStreamStringTypeAndValue } from './utils';

describe('utils', () => {
  describe('createChunkDecoder', () => {
    it('should correctly decode text chunk in complex mode', () => {
      const decoder = createChunkDecoder(true);

      const encoder = new TextEncoder();
      const chunk = encoder.encode(getStreamString('text', 'Hello, world!'));
      const values = decoder(chunk);

      expect(values).toStrictEqual([{ type: 'text', value: 'Hello, world!' }]);
    });

    it('should correctly decode function chunk in complex mode', () => {
      const functionCall = {
        name: 'get_current_weather',
        arguments:
          '{\n"location": "Charlottesville, Virginia",\n"format": "celsius"\n}',
      };

      const decoder = createChunkDecoder(true);

      const encoder = new TextEncoder();
      const chunk = encoder.encode(
        getStreamString('function_call', functionCall),
      );
      const values = decoder(chunk);

      expect(values).toStrictEqual([
        { type: 'function_call', value: functionCall },
      ]);
    });

    it('should correctly decode data chunk in complex mode', () => {
      const data = { test: 'value' };

      const decoder = createChunkDecoder(true);

      const encoder = new TextEncoder();
      const chunk = encoder.encode(getStreamString('data', data));
      const values = decoder(chunk);

      expect(values).toStrictEqual([{ type: 'data', value: data }]);
    });

    it('should correctly decode streamed utf8 chunks in complex mode', () => {
      const normalDecode = createChunkDecoder();
      const complexDecode = createChunkDecoder(true);

      const encoder = new TextEncoder();

      // Original data chunks
      const chunk1 = new Uint8Array([226, 153]);
      const chunk2 = new Uint8Array([165]);

      const enqueuedChunks = [];
      enqueuedChunks.push(
        encoder.encode(getStreamString('text', normalDecode(chunk1))),
      );
      enqueuedChunks.push(
        encoder.encode(getStreamString('text', normalDecode(chunk2))),
      );

      let fullDecodedString = '';
      for (const chunk of enqueuedChunks) {
        const lines = complexDecode(chunk);
        for (const line of lines) {
          if (line.type !== 'text') {
            throw new Error('Expected line to be text');
          }
          fullDecodedString += line.value;
        }
      }

      expect(fullDecodedString).toBe('♥');
    });

    it('should correctly decode streamed utf8 chunks in simple mode', () => {
      const decoder = createChunkDecoder(false);

      const chunk1 = new Uint8Array([226, 153]);
      const chunk2 = new Uint8Array([165]);
      const values = decoder(chunk1);
      const secondValues = decoder(chunk2);
      if (typeof values !== 'string' || typeof secondValues !== 'string') {
        throw new Error('Expected values to be strings, not objects');
      }

      expect(values + secondValues).toBe('♥');
    });
  });

  describe('getStreamStringTypeAndValue', () => {
    it('should correctly parse a text stream string', () => {
      const input = '0:Hello, world!';

      expect(getStreamStringTypeAndValue(input)).toEqual({
        type: 'text',
        value: 'Hello, world!',
      });
    });

    it('should correctly parse a function call stream string', () => {
      const input =
        '1:{"name":"get_current_weather","arguments":"{\\"location\\": \\"Charlottesville, Virginia\\",\\"format\\": \\"celsius\\"}"}';

      expect(getStreamStringTypeAndValue(input)).toEqual({
        type: 'function_call',
        value: {
          name: 'get_current_weather',
          arguments:
            '{"location": "Charlottesville, Virginia","format": "celsius"}',
        },
      });
    });

    it('should correctly parse a data stream string', () => {
      const input = '2:{"test":"value"}';
      const expectedOutput = { type: 'data', value: { test: 'value' } };
      expect(getStreamStringTypeAndValue(input)).toEqual(expectedOutput);
    });

    it('should throw an error if the input is not a valid stream string', () => {
      const input = 'invalid stream string';
      expect(() => getStreamStringTypeAndValue(input)).toThrow();
    });
  });
});
