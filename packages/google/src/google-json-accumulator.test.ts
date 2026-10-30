import { describe, it, expect } from 'vitest';
import {
  GoogleJSONAccumulator,
  type PartialArg,
} from './google-json-accumulator';

describe('GoogleJSONAccumulator', () => {
  describe('flat paths', () => {
    it('should accumulate a simple string arg with willContinue', () => {
      const accumulator = new GoogleJSONAccumulator();
      const result = accumulator.processPartialArgs([
        { jsonPath: '$.location', stringValue: 'Boston', willContinue: true },
      ]);

      expect(result).toMatchInlineSnapshot(`
        {
          "currentJSON": {
            "location": "Boston",
          },
          "textDelta": "{"location":"Boston",
        }
      `);
    });

    it('should continue a string arg across multiple chunks', () => {
      const accumulator = new GoogleJSONAccumulator();

      accumulator.processPartialArgs([
        { jsonPath: '$.location', stringValue: 'Boston', willContinue: true },
      ]);

      const continuationResult = accumulator.processPartialArgs([
        { jsonPath: '$.location', stringValue: ', MA' },
      ]);

      expect(continuationResult).toMatchInlineSnapshot(`
        {
          "currentJSON": {
            "location": "Boston, MA",
          },
          "textDelta": ", MA"",
        }
      `);
    });

    it('should close a continued string on its final chunk', () => {
      const accumulator = new GoogleJSONAccumulator();

      accumulator.processPartialArgs([
        { jsonPath: '$.location', stringValue: 'Bos', willContinue: true },
      ]);

      const finalChunkResult = accumulator.processPartialArgs([
        { jsonPath: '$.location', stringValue: 'ton' },
      ]);

      expect(finalChunkResult.textDelta).toBe('ton"');
      expect(accumulator.finalize().closingDelta).toBe('}');
    });

    it('should close a continued string on an empty final chunk', () => {
      const accumulator = new GoogleJSONAccumulator();

      accumulator.processPartialArgs([
        { jsonPath: '$.location', stringValue: 'Boston', willContinue: true },
      ]);

      const finalChunkResult = accumulator.processPartialArgs([
        { jsonPath: '$.location', stringValue: '' },
      ]);

      expect(finalChunkResult.textDelta).toBe('"');
      expect(accumulator.finalize().closingDelta).toBe('}');
    });

    it('should accumulate a complete string arg (no willContinue)', () => {
      const accumulator = new GoogleJSONAccumulator();
      const result = accumulator.processPartialArgs([
        { jsonPath: '$.location', stringValue: 'Boston' },
      ]);

      expect(result).toMatchInlineSnapshot(`
        {
          "currentJSON": {
            "location": "Boston",
          },
          "textDelta": "{"location":"Boston"",
        }
      `);
    });

    it('should accumulate a number arg', () => {
      const accumulator = new GoogleJSONAccumulator();
      const result = accumulator.processPartialArgs([
        { jsonPath: '$.brightness', numberValue: 50 },
      ]);

      expect(result).toMatchInlineSnapshot(`
        {
          "currentJSON": {
            "brightness": 50,
          },
          "textDelta": "{"brightness":50",
        }
      `);
    });

    it('should accumulate a boolean arg', () => {
      const accumulator = new GoogleJSONAccumulator();
      const result = accumulator.processPartialArgs([
        { jsonPath: '$.enabled', boolValue: true },
      ]);

      expect(result).toMatchInlineSnapshot(`
        {
          "currentJSON": {
            "enabled": true,
          },
          "textDelta": "{"enabled":true",
        }
      `);
    });

    it('should accumulate a null arg', () => {
      const accumulator = new GoogleJSONAccumulator();
      const result = accumulator.processPartialArgs([
        { jsonPath: '$.nickname', nullValue: {} },
      ]);

      expect(result).toMatchInlineSnapshot(`
        {
          "currentJSON": {
            "nickname": null,
          },
          "textDelta": "{"nickname":null",
        }
      `);
    });

    it('should accumulate multiple args with commas between them', () => {
      const accumulator = new GoogleJSONAccumulator();

      const firstResult = accumulator.processPartialArgs([
        { jsonPath: '$.brightness', numberValue: 50 },
      ]);
      expect(firstResult).toMatchInlineSnapshot(`
        {
          "currentJSON": {
            "brightness": 50,
          },
          "textDelta": "{"brightness":50",
        }
      `);

      const secondResult = accumulator.processPartialArgs([
        { jsonPath: '$.enabled', boolValue: true },
      ]);
      expect(secondResult).toMatchInlineSnapshot(`
        {
          "currentJSON": {
            "brightness": 50,
            "enabled": true,
          },
          "textDelta": ","enabled":true",
        }
      `);
    });

    it('should accumulate multiple args in a single call', () => {
      const accumulator = new GoogleJSONAccumulator();
      const result = accumulator.processPartialArgs([
        { jsonPath: '$.brightness', numberValue: 50 },
        { jsonPath: '$.enabled', boolValue: false },
        { jsonPath: '$.nickname', nullValue: {} },
      ]);

      expect(result).toMatchInlineSnapshot(`
        {
          "currentJSON": {
            "brightness": 50,
            "enabled": false,
            "nickname": null,
          },
          "textDelta": "{"brightness":50,"enabled":false,"nickname":null",
        }
      `);
    });

    it('should escape special characters in continued strings', () => {
      const accumulator = new GoogleJSONAccumulator();

      accumulator.processPartialArgs([
        {
          jsonPath: '$.query',
          stringValue: 'Boston "Lo',
          willContinue: true,
        },
      ]);

      const continuationResult = accumulator.processPartialArgs([
        { jsonPath: '$.query', stringValue: 'gan"' },
      ]);

      expect(continuationResult).toMatchInlineSnapshot(`
        {
          "currentJSON": {
            "query": "Boston "Logan"",
          },
          "textDelta": "gan\\""",
        }
      `);
    });

    it('should skip args with empty jsonPath after stripping $. prefix', () => {
      const accumulator = new GoogleJSONAccumulator();
      const result = accumulator.processPartialArgs([
        { jsonPath: '$.', stringValue: 'ignored' },
      ]);

      expect(result).toMatchInlineSnapshot(`
        {
          "currentJSON": {},
          "textDelta": "",
        }
      `);
    });

    it('should treat a value-less arg for a new path as an empty object', () => {
      const accumulator = new GoogleJSONAccumulator();
      const result = accumulator.processPartialArgs([
        { jsonPath: '$.something' },
      ]);

      expect(result).toMatchInlineSnapshot(`
        {
          "currentJSON": {
            "something": {},
          },
          "textDelta": "{"something":{",
        }
      `);
    });

    it('should return empty textDelta for empty partialArgs array', () => {
      const accumulator = new GoogleJSONAccumulator();
      const result = accumulator.processPartialArgs([]);

      expect(result).toMatchInlineSnapshot(`
        {
          "currentJSON": {},
          "textDelta": "",
        }
      `);
    });
  });

  describe('prototype pollution protection', () => {
    it('should not pollute Object.prototype through __proto__ path segments', () => {
      const pollutedKey = 'pollutedByGoogleAccumulatorTest';
      const objectPrototype = Object.prototype as Record<string, unknown>;
      delete objectPrototype[pollutedKey];

      try {
        const accumulator = new GoogleJSONAccumulator();
        const result = accumulator.processPartialArgs([
          {
            jsonPath: `$.__proto__.${pollutedKey}`,
            stringValue: 'true',
          },
        ]);

        expect(objectPrototype[pollutedKey]).toBeUndefined();
        const protoDescriptor = Object.getOwnPropertyDescriptor(
          result.currentJSON,
          '__proto__',
        );
        expect(protoDescriptor?.value[pollutedKey]).toBe('true');
        expect(result.currentJSON).toMatchInlineSnapshot(`
          {
            "__proto__": {
              "pollutedByGoogleAccumulatorTest": "true",
            },
          }
        `);
      } finally {
        delete objectPrototype[pollutedKey];
      }
    });

    it('should not pollute Object.prototype through constructor.prototype path segments', () => {
      const pollutedKey = 'pollutedByGoogleConstructorTest';
      const objectPrototype = Object.prototype as Record<string, unknown>;
      delete objectPrototype[pollutedKey];

      try {
        const accumulator = new GoogleJSONAccumulator();
        const result = accumulator.processPartialArgs([
          {
            jsonPath: `$.constructor.prototype.${pollutedKey}`,
            stringValue: 'true',
          },
        ]);

        expect(objectPrototype[pollutedKey]).toBeUndefined();
        expect(result.currentJSON).toMatchInlineSnapshot(`
          {
            "constructor": {
              "prototype": {
                "pollutedByGoogleConstructorTest": "true",
              },
            },
          }
        `);
      } finally {
        delete objectPrototype[pollutedKey];
      }
    });
  });

  describe('nested paths', () => {
    it('should build nested object from dotted jsonPath', () => {
      const accumulator = new GoogleJSONAccumulator();
      const result = accumulator.processPartialArgs([
        { jsonPath: '$.recipe.name', stringValue: 'Lasagna' },
      ]);

      expect(result).toMatchInlineSnapshot(`
        {
          "currentJSON": {
            "recipe": {
              "name": "Lasagna",
            },
          },
          "textDelta": "{"recipe":{"name":"Lasagna"",
        }
      `);
    });

    it('should build nested object with array from indexed jsonPath', () => {
      const accumulator = new GoogleJSONAccumulator();
      const amountResult = accumulator.processPartialArgs([
        {
          jsonPath: '$.recipe.ingredients[0].amount',
          stringValue: '16 oz',
        },
      ]);
      expect(amountResult).toMatchInlineSnapshot(`
        {
          "currentJSON": {
            "recipe": {
              "ingredients": [
                {
                  "amount": "16 oz",
                },
              ],
            },
          },
          "textDelta": "{"recipe":{"ingredients":[{"amount":"16 oz"",
        }
      `);

      const nameResult = accumulator.processPartialArgs([
        {
          jsonPath: '$.recipe.ingredients[0].name',
          stringValue: 'Lasagna noodles',
        },
      ]);
      expect(nameResult).toMatchInlineSnapshot(`
        {
          "currentJSON": {
            "recipe": {
              "ingredients": [
                {
                  "amount": "16 oz",
                  "name": "Lasagna noodles",
                },
              ],
            },
          },
          "textDelta": ","name":"Lasagna noodles"",
        }
      `);
    });

    it('should accumulate multiple array elements across chunks', () => {
      const accumulator = new GoogleJSONAccumulator();
      const deltas: string[] = [];

      let result = accumulator.processPartialArgs([
        {
          jsonPath: '$.recipe.ingredients[0].amount',
          stringValue: '16 oz',
        },
      ]);
      deltas.push(result.textDelta);

      result = accumulator.processPartialArgs([
        {
          jsonPath: '$.recipe.ingredients[0].name',
          stringValue: 'Noodles',
        },
      ]);
      deltas.push(result.textDelta);

      result = accumulator.processPartialArgs([
        {
          jsonPath: '$.recipe.ingredients[1].amount',
          stringValue: '1 lb',
        },
      ]);
      deltas.push(result.textDelta);
      expect(result.textDelta).toMatchInlineSnapshot(`"},{"amount":"1 lb""`);

      result = accumulator.processPartialArgs([
        {
          jsonPath: '$.recipe.ingredients[1].name',
          stringValue: 'Beef',
        },
      ]);
      deltas.push(result.textDelta);
      expect(result.textDelta).toMatchInlineSnapshot(`","name":"Beef""`);

      expect(result.currentJSON).toMatchInlineSnapshot(`
        {
          "recipe": {
            "ingredients": [
              {
                "amount": "16 oz",
                "name": "Noodles",
              },
              {
                "amount": "1 lb",
                "name": "Beef",
              },
            ],
          },
        }
      `);

      const { finalJSON, closingDelta } = accumulator.finalize();
      deltas.push(closingDelta);
      expect(deltas.join('')).toBe(finalJSON);
    });

    it('should handle string continuation on nested paths', () => {
      const accumulator = new GoogleJSONAccumulator();
      const startResult = accumulator.processPartialArgs([
        {
          jsonPath: '$.recipe.steps[0]',
          stringValue: 'Preheat oven',
          willContinue: true,
        },
      ]);
      expect(startResult.textDelta).toMatchInlineSnapshot(
        `"{"recipe":{"steps":["Preheat oven"`,
      );

      const continuationResult = accumulator.processPartialArgs([
        { jsonPath: '$.recipe.steps[0]', stringValue: ' to 375°F.' },
      ]);
      expect(continuationResult).toMatchInlineSnapshot(`
        {
          "currentJSON": {
            "recipe": {
              "steps": [
                "Preheat oven to 375°F.",
              ],
            },
          },
          "textDelta": " to 375°F."",
        }
      `);
    });

    it('should handle mixed nested and flat paths', () => {
      const accumulator = new GoogleJSONAccumulator();
      const locationResult = accumulator.processPartialArgs([
        { jsonPath: '$.location', stringValue: 'Boston' },
      ]);
      expect(locationResult.textDelta).toMatchInlineSnapshot(
        `"{"location":"Boston""`,
      );

      const detailsResult = accumulator.processPartialArgs([
        { jsonPath: '$.details.zip', stringValue: '02101' },
      ]);
      expect(detailsResult).toMatchInlineSnapshot(`
        {
          "currentJSON": {
            "details": {
              "zip": "02101",
            },
            "location": "Boston",
          },
          "textDelta": ","details":{"zip":"02101"",
        }
      `);

      const { finalJSON, closingDelta } = accumulator.finalize();
      expect({ finalJSON, closingDelta }).toMatchInlineSnapshot(`
        {
          "closingDelta": "}}",
          "finalJSON": "{"location":"Boston","details":{"zip":"02101"}}",
        }
      `);
    });

    it('should handle array elements that are direct string values', () => {
      const accumulator = new GoogleJSONAccumulator();
      const firstStep = accumulator.processPartialArgs([
        { jsonPath: '$.steps[0]', stringValue: 'Step one' },
      ]);
      expect(firstStep.textDelta).toMatchInlineSnapshot(
        `"{"steps":["Step one""`,
      );

      const secondStep = accumulator.processPartialArgs([
        { jsonPath: '$.steps[1]', stringValue: 'Step two' },
      ]);
      expect(secondStep).toMatchInlineSnapshot(`
        {
          "currentJSON": {
            "steps": [
              "Step one",
              "Step two",
            ],
          },
          "textDelta": ","Step two"",
        }
      `);
    });

    it('should handle deeply nested paths', () => {
      const accumulator = new GoogleJSONAccumulator();
      const result = accumulator.processPartialArgs([
        { jsonPath: '$.a.b.c.d', stringValue: 'deep' },
      ]);

      expect(result).toMatchInlineSnapshot(`
        {
          "currentJSON": {
            "a": {
              "b": {
                "c": {
                  "d": "deep",
                },
              },
            },
          },
          "textDelta": "{"a":{"b":{"c":{"d":"deep"",
        }
      `);

      const { finalJSON, closingDelta } = accumulator.finalize();
      expect({ finalJSON, closingDelta }).toMatchInlineSnapshot(`
        {
          "closingDelta": "}}}}",
          "finalJSON": "{"a":{"b":{"c":{"d":"deep"}}}}",
        }
      `);
    });
  });

  describe('empty containers', () => {
    function accumulate(chunks: PartialArg[][]) {
      const accumulator = new GoogleJSONAccumulator();
      const deltas: string[] = [];
      let currentJSON: Record<string, unknown> = {};
      for (const chunk of chunks) {
        const result = accumulator.processPartialArgs(chunk);
        currentJSON = result.currentJSON;
        deltas.push(result.textDelta);
      }
      const { finalJSON, closingDelta } = accumulator.finalize();
      deltas.push(closingDelta);
      return { currentJSON, text: deltas.join(''), finalJSON };
    }

    it('should keep empty arrays, empty objects, and nested empty arrays', () => {
      const result = accumulate([
        [{ jsonPath: '$.id', stringValue: 'x' }],
        [{ jsonPath: '$.emptyArr[]' }],
        [{ jsonPath: '$.emptyObj' }],
        [{ jsonPath: '$.emptyStr', stringValue: '' }],
        [{ jsonPath: '$.nested.tags[]' }],
        [{ jsonPath: '$.zero', numberValue: 0 }],
        [{ jsonPath: '$.no', boolValue: false }],
      ]);

      expect(result).toMatchInlineSnapshot(`
        {
          "currentJSON": {
            "emptyArr": [],
            "emptyObj": {},
            "emptyStr": "",
            "id": "x",
            "nested": {
              "tags": [],
            },
            "no": false,
            "zero": 0,
          },
          "finalJSON": "{"id":"x","emptyArr":[],"emptyObj":{},"emptyStr":"","nested":{"tags":[]},"zero":0,"no":false}",
          "text": "{"id":"x","emptyArr":[],"emptyObj":{},"emptyStr":"","nested":{"tags":[]},"zero":0,"no":false}",
        }
      `);
    });

    it('should keep an empty container as the last argument', () => {
      const result = accumulate([
        [{ jsonPath: '$.id', stringValue: 'x', willContinue: true }],
        [{ jsonPath: '$.nested.tags[]' }],
      ]);

      expect(result.finalJSON).toBe('{"id":"x","nested":{"tags":[]}}');
      expect(result.text).toBe(result.finalJSON);
    });

    it('should ignore an array terminator after the array elements', () => {
      const result = accumulate([
        [
          {
            jsonPath: '$.tables[0]',
            stringValue: 'orders',
            willContinue: true,
          },
        ],
        [{ jsonPath: '$.tables[0]' }],
        [{ jsonPath: '$.tables[1]', stringValue: 'customers' }],
        [{ jsonPath: '$.tables[]' }],
      ]);

      expect(result.finalJSON).toBe('{"tables":["orders","customers"]}');
      expect(result.text).toBe(result.finalJSON);
    });

    it('should ignore a string terminator', () => {
      const result = accumulate([
        [{ jsonPath: '$.location', stringValue: 'Boston', willContinue: true }],
        [{ jsonPath: '$.location' }],
      ]);

      expect(result.finalJSON).toBe('{"location":"Boston"}');
      expect(result.text).toBe(result.finalJSON);
    });

    it('should close a continued string on a string terminator', () => {
      const accumulator = new GoogleJSONAccumulator();

      accumulator.processPartialArgs([
        { jsonPath: '$.location', stringValue: 'Boston', willContinue: true },
      ]);

      const terminatorResult = accumulator.processPartialArgs([
        { jsonPath: '$.location' },
      ]);

      expect(terminatorResult.textDelta).toBe('"');
      expect(accumulator.finalize().closingDelta).toBe('}');
    });

    it('should continue into an empty container when children follow', () => {
      const result = accumulate([
        [{ jsonPath: '$.recipe' }],
        [{ jsonPath: '$.recipe.name', stringValue: 'Lasagna' }],
        [{ jsonPath: '$.recipe.steps[]' }],
        [{ jsonPath: '$.recipe.steps[0]', stringValue: 'Cook.' }],
      ]);

      expect(result.finalJSON).toBe(
        '{"recipe":{"name":"Lasagna","steps":["Cook."]}}',
      );
      expect(result.text).toBe(result.finalJSON);
    });

    it('should ignore value-less root paths', () => {
      const result = accumulate([
        [{ jsonPath: '$' }],
        [{ jsonPath: '$[]' }],
        [{ jsonPath: '$.id', stringValue: 'x' }],
      ]);

      expect(result.finalJSON).toBe('{"id":"x"}');
      expect(result.text).toBe(result.finalJSON);
    });
  });

  describe('finalize', () => {
    it('should produce closing delta for a continued string', () => {
      const accumulator = new GoogleJSONAccumulator();
      accumulator.processPartialArgs([
        { jsonPath: '$.location', stringValue: 'Boston', willContinue: true },
      ]);

      expect(accumulator.finalize()).toMatchInlineSnapshot(`
        {
          "closingDelta": ""}",
          "finalJSON": "{"location":"Boston"}",
        }
      `);
    });

    it('should produce closing delta for a complete string', () => {
      const accumulator = new GoogleJSONAccumulator();
      accumulator.processPartialArgs([
        { jsonPath: '$.location', stringValue: 'Boston' },
      ]);

      expect(accumulator.finalize()).toMatchInlineSnapshot(`
        {
          "closingDelta": "}",
          "finalJSON": "{"location":"Boston"}",
        }
      `);
    });

    it('should produce closing delta for multiple args', () => {
      const accumulator = new GoogleJSONAccumulator();
      accumulator.processPartialArgs([
        { jsonPath: '$.brightness', numberValue: 50 },
        { jsonPath: '$.enabled', boolValue: true },
      ]);

      expect(accumulator.finalize()).toMatchInlineSnapshot(`
        {
          "closingDelta": "}",
          "finalJSON": "{"brightness":50,"enabled":true}",
        }
      `);
    });

    it('should produce closing delta for continued string with continuation', () => {
      const accumulator = new GoogleJSONAccumulator();
      accumulator.processPartialArgs([
        { jsonPath: '$.location', stringValue: 'Boston', willContinue: true },
      ]);
      accumulator.processPartialArgs([
        { jsonPath: '$.location', stringValue: ', MA' },
      ]);

      expect(accumulator.finalize()).toMatchInlineSnapshot(`
        {
          "closingDelta": "}",
          "finalJSON": "{"location":"Boston, MA"}",
        }
      `);
    });

    it('should handle empty accumulator', () => {
      const accumulator = new GoogleJSONAccumulator();
      expect(accumulator.finalize()).toMatchInlineSnapshot(`
        {
          "closingDelta": "{}",
          "finalJSON": "{}",
        }
      `);
    });

    it('should finalize nested structure to proper JSON', () => {
      const accumulator = new GoogleJSONAccumulator();
      accumulator.processPartialArgs([
        {
          jsonPath: '$.recipe.ingredients[0].name',
          stringValue: 'Noodles',
        },
      ]);
      accumulator.processPartialArgs([
        { jsonPath: '$.recipe.name', stringValue: 'Lasagna' },
      ]);

      const { finalJSON } = accumulator.finalize();
      expect(JSON.parse(finalJSON)).toMatchInlineSnapshot(`
        {
          "recipe": {
            "ingredients": [
              {
                "name": "Noodles",
              },
            ],
            "name": "Lasagna",
          },
        }
      `);
    });

    it('should finalize nested arrays with string continuation', () => {
      const accumulator = new GoogleJSONAccumulator();
      accumulator.processPartialArgs([
        {
          jsonPath: '$.recipe.steps[0]',
          stringValue: 'Preheat',
          willContinue: true,
        },
      ]);
      accumulator.processPartialArgs([
        { jsonPath: '$.recipe.steps[0]', stringValue: ' oven.' },
      ]);
      accumulator.processPartialArgs([
        { jsonPath: '$.recipe.steps[1]', stringValue: 'Cook.' },
      ]);

      const { finalJSON } = accumulator.finalize();
      expect(JSON.parse(finalJSON)).toMatchInlineSnapshot(`
        {
          "recipe": {
            "steps": [
              "Preheat oven.",
              "Cook.",
            ],
          },
        }
      `);
    });
  });

  describe('concatenation invariant', () => {
    it('flat args: concatenated deltas + closingDelta === JSON.stringify', () => {
      const accumulator = new GoogleJSONAccumulator();
      const deltas: string[] = [];

      let result = accumulator.processPartialArgs([
        { jsonPath: '$.brightness', numberValue: 50 },
      ]);
      deltas.push(result.textDelta);

      result = accumulator.processPartialArgs([
        { jsonPath: '$.enabled', boolValue: true },
      ]);
      deltas.push(result.textDelta);

      result = accumulator.processPartialArgs([
        { jsonPath: '$.name', stringValue: 'test' },
      ]);
      deltas.push(result.textDelta);

      const { finalJSON, closingDelta } = accumulator.finalize();
      deltas.push(closingDelta);
      expect(deltas.join('')).toBe(finalJSON);
      expect(JSON.parse(finalJSON)).toMatchInlineSnapshot(`
        {
          "brightness": 50,
          "enabled": true,
          "name": "test",
        }
      `);
    });

    it('nested args: concatenated deltas + closingDelta === JSON.stringify', () => {
      const accumulator = new GoogleJSONAccumulator();
      const deltas: string[] = [];

      let result = accumulator.processPartialArgs([
        {
          jsonPath: '$.recipe.ingredients[0].amount',
          stringValue: '16 oz',
        },
      ]);
      deltas.push(result.textDelta);

      result = accumulator.processPartialArgs([
        {
          jsonPath: '$.recipe.ingredients[0].name',
          stringValue: 'Noodles',
        },
      ]);
      deltas.push(result.textDelta);

      result = accumulator.processPartialArgs([
        {
          jsonPath: '$.recipe.ingredients[1].amount',
          stringValue: '1 lb',
        },
      ]);
      deltas.push(result.textDelta);

      result = accumulator.processPartialArgs([
        {
          jsonPath: '$.recipe.ingredients[1].name',
          stringValue: 'Beef',
        },
      ]);
      deltas.push(result.textDelta);

      result = accumulator.processPartialArgs([
        { jsonPath: '$.recipe.name', stringValue: 'Lasagna' },
      ]);
      deltas.push(result.textDelta);

      result = accumulator.processPartialArgs([
        {
          jsonPath: '$.recipe.steps[0]',
          stringValue: 'Preheat',
          willContinue: true,
        },
      ]);
      deltas.push(result.textDelta);

      result = accumulator.processPartialArgs([
        { jsonPath: '$.recipe.steps[0]', stringValue: ' oven.' },
      ]);
      deltas.push(result.textDelta);

      result = accumulator.processPartialArgs([
        { jsonPath: '$.recipe.steps[1]', stringValue: 'Cook.' },
      ]);
      deltas.push(result.textDelta);

      const { finalJSON, closingDelta } = accumulator.finalize();
      deltas.push(closingDelta);
      expect(deltas.join('')).toBe(finalJSON);
      expect(JSON.parse(finalJSON)).toMatchInlineSnapshot(`
        {
          "recipe": {
            "ingredients": [
              {
                "amount": "16 oz",
                "name": "Noodles",
              },
              {
                "amount": "1 lb",
                "name": "Beef",
              },
            ],
            "name": "Lasagna",
            "steps": [
              "Preheat oven.",
              "Cook.",
            ],
          },
        }
      `);
    });

    it('willContinue strings: concatenated deltas + closingDelta === JSON.stringify', () => {
      const accumulator = new GoogleJSONAccumulator();
      const deltas: string[] = [];

      let result = accumulator.processPartialArgs([
        { jsonPath: '$.location', stringValue: 'Bos', willContinue: true },
      ]);
      deltas.push(result.textDelta);

      result = accumulator.processPartialArgs([
        { jsonPath: '$.location', stringValue: 'ton' },
      ]);
      deltas.push(result.textDelta);

      result = accumulator.processPartialArgs([
        { jsonPath: '$.count', numberValue: 42 },
      ]);
      deltas.push(result.textDelta);

      const { finalJSON, closingDelta } = accumulator.finalize();
      deltas.push(closingDelta);
      expect(deltas.join('')).toBe(finalJSON);
    });
  });
});
