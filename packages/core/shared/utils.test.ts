import { describe, expect, it } from 'vitest';
import { formatStreamPart } from './stream-parts';
import { createChunkDecoder } from './utils';

describe('utils', () => {
  describe('createChunkDecoder', () => {
    it('should correctly decode text chunk in complex mode', () => {
      const decoder = createChunkDecoder(true);

      const encoder = new TextEncoder();
      const chunk = encoder.encode(formatStreamPart('text', 'Hello, world!'));
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
        formatStreamPart('function_call', {
          function_call: functionCall,
        }),
      );
      const values = decoder(chunk);

      expect(values).toStrictEqual([
        {
          type: 'function_call',
          value: {
            function_call: functionCall,
          },
        },
      ]);
    });

    it('should correctly decode data chunk in complex mode', () => {
      const data = [{ test: 'value' }];

      const decoder = createChunkDecoder(true);

      const encoder = new TextEncoder();
      const chunk = encoder.encode(formatStreamPart('data', data));
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
        encoder.encode(formatStreamPart('text', normalDecode(chunk1))),
      );
      enqueuedChunks.push(
        encoder.encode(formatStreamPart('text', normalDecode(chunk2))),
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
});
