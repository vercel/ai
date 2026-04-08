import { describe, it, expect } from 'vitest';
import { GoogleJSONAccumulator } from './google-json-accumulator';

describe('GoogleJSONAccumulator', () => {
  describe('flat paths', () => {
    it('should accumulate a simple string arg with willContinue', () => {
      const accumulator = new GoogleJSONAccumulator();
      const result = accumulator.processPartialArgs([
        { jsonPath: '$.location', stringValue: 'Boston', willContinue: true },
      ]);

      expect(result.textDelta).toBe('{"location":"Boston');
      expect(result.currentJSON).toEqual({ location: 'Boston' });
    });

    it('should continue a string arg across multiple chunks', () => {
      const accumulator = new GoogleJSONAccumulator();

      accumulator.processPartialArgs([
        { jsonPath: '$.location', stringValue: 'Boston', willContinue: true },
      ]);

      const continuationResult = accumulator.processPartialArgs([
        { jsonPath: '$.location', stringValue: ', MA' },
      ]);

      expect(continuationResult.textDelta).toBe(', MA');
      expect(continuationResult.currentJSON).toEqual({
        location: 'Boston, MA',
      });
    });

    it('should accumulate a complete string arg (no willContinue)', () => {
      const accumulator = new GoogleJSONAccumulator();
      const result = accumulator.processPartialArgs([
        { jsonPath: '$.location', stringValue: 'Boston' },
      ]);

      expect(result.textDelta).toBe('{"location":"Boston"');
      expect(result.currentJSON).toEqual({ location: 'Boston' });
    });

    it('should accumulate a number arg', () => {
      const accumulator = new GoogleJSONAccumulator();
      const result = accumulator.processPartialArgs([
        { jsonPath: '$.brightness', numberValue: 50 },
      ]);

      expect(result.textDelta).toBe('{"brightness":50');
      expect(result.currentJSON).toEqual({ brightness: 50 });
    });

    it('should accumulate a boolean arg', () => {
      const accumulator = new GoogleJSONAccumulator();
      const result = accumulator.processPartialArgs([
        { jsonPath: '$.enabled', boolValue: true },
      ]);

      expect(result.textDelta).toBe('{"enabled":true');
      expect(result.currentJSON).toEqual({ enabled: true });
    });

    it('should accumulate a null arg', () => {
      const accumulator = new GoogleJSONAccumulator();
      const result = accumulator.processPartialArgs([
        { jsonPath: '$.nickname', nullValue: {} },
      ]);

      expect(result.textDelta).toBe('{"nickname":null');
      expect(result.currentJSON).toEqual({ nickname: null });
    });

    it('should accumulate multiple args with commas between them', () => {
      const accumulator = new GoogleJSONAccumulator();

      const firstResult = accumulator.processPartialArgs([
        { jsonPath: '$.brightness', numberValue: 50 },
      ]);
      expect(firstResult.textDelta).toBe('{"brightness":50');

      const secondResult = accumulator.processPartialArgs([
        { jsonPath: '$.enabled', boolValue: true },
      ]);
      expect(secondResult.textDelta).toBe(',"enabled":true');

      expect(secondResult.currentJSON).toEqual({
        brightness: 50,
        enabled: true,
      });
    });

    it('should accumulate multiple args in a single call', () => {
      const accumulator = new GoogleJSONAccumulator();
      const result = accumulator.processPartialArgs([
        { jsonPath: '$.brightness', numberValue: 50 },
        { jsonPath: '$.enabled', boolValue: false },
        { jsonPath: '$.nickname', nullValue: {} },
      ]);

      expect(result.textDelta).toBe(
        '{"brightness":50,"enabled":false,"nickname":null',
      );
      expect(result.currentJSON).toEqual({
        brightness: 50,
        enabled: false,
        nickname: null,
      });
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

      expect(continuationResult.textDelta).toBe('gan\\"');
      expect(continuationResult.currentJSON).toEqual({
        query: 'Boston "Logan"',
      });
    });

    it('should skip args with empty jsonPath after stripping $. prefix', () => {
      const accumulator = new GoogleJSONAccumulator();
      const result = accumulator.processPartialArgs([
        { jsonPath: '$.', stringValue: 'ignored' },
      ]);

      expect(result.textDelta).toBe('');
      expect(result.currentJSON).toEqual({});
    });

    it('should skip args with no resolvable value', () => {
      const accumulator = new GoogleJSONAccumulator();
      const result = accumulator.processPartialArgs([
        { jsonPath: '$.something' },
      ]);

      expect(result.textDelta).toBe('');
      expect(result.currentJSON).toEqual({});
    });

    it('should return empty textDelta for empty partialArgs array', () => {
      const accumulator = new GoogleJSONAccumulator();
      const result = accumulator.processPartialArgs([]);

      expect(result.textDelta).toBe('');
      expect(result.currentJSON).toEqual({});
    });
  });

  describe('nested paths', () => {
    it('should build nested object from dotted jsonPath', () => {
      const accumulator = new GoogleJSONAccumulator();
      const result = accumulator.processPartialArgs([
        { jsonPath: '$.recipe.name', stringValue: 'Lasagna' },
      ]);

      expect(result.textDelta).toBe('{"recipe":{"name":"Lasagna"');
      expect(result.currentJSON).toEqual({ recipe: { name: 'Lasagna' } });
    });

    it('should build nested object with array from indexed jsonPath', () => {
      const accumulator = new GoogleJSONAccumulator();
      const amountResult = accumulator.processPartialArgs([
        {
          jsonPath: '$.recipe.ingredients[0].amount',
          stringValue: '16 oz',
        },
      ]);
      expect(amountResult.textDelta).toBe(
        '{"recipe":{"ingredients":[{"amount":"16 oz"',
      );

      const nameResult = accumulator.processPartialArgs([
        {
          jsonPath: '$.recipe.ingredients[0].name',
          stringValue: 'Lasagna noodles',
        },
      ]);
      expect(nameResult.textDelta).toBe(',"name":"Lasagna noodles"');

      expect(nameResult.currentJSON).toEqual({
        recipe: {
          ingredients: [{ amount: '16 oz', name: 'Lasagna noodles' }],
        },
      });
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
      expect(result.textDelta).toBe('},{"amount":"1 lb"');

      result = accumulator.processPartialArgs([
        {
          jsonPath: '$.recipe.ingredients[1].name',
          stringValue: 'Beef',
        },
      ]);
      deltas.push(result.textDelta);
      expect(result.textDelta).toBe(',"name":"Beef"');

      expect(result.currentJSON).toEqual({
        recipe: {
          ingredients: [
            { amount: '16 oz', name: 'Noodles' },
            { amount: '1 lb', name: 'Beef' },
          ],
        },
      });

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
      expect(startResult.textDelta).toBe('{"recipe":{"steps":["Preheat oven');

      const continuationResult = accumulator.processPartialArgs([
        { jsonPath: '$.recipe.steps[0]', stringValue: ' to 375°F.' },
      ]);
      expect(continuationResult.textDelta).toBe(' to 375°F.');

      expect(continuationResult.currentJSON).toEqual({
        recipe: { steps: ['Preheat oven to 375°F.'] },
      });
    });

    it('should handle mixed nested and flat paths', () => {
      const accumulator = new GoogleJSONAccumulator();
      const locationResult = accumulator.processPartialArgs([
        { jsonPath: '$.location', stringValue: 'Boston' },
      ]);
      expect(locationResult.textDelta).toBe('{"location":"Boston"');

      const detailsResult = accumulator.processPartialArgs([
        { jsonPath: '$.details.zip', stringValue: '02101' },
      ]);
      expect(detailsResult.textDelta).toBe(',"details":{"zip":"02101"');

      expect(detailsResult.currentJSON).toEqual({
        location: 'Boston',
        details: { zip: '02101' },
      });

      const { finalJSON, closingDelta } = accumulator.finalize();
      expect(closingDelta).toBe('}}');
      expect(finalJSON).toBe('{"location":"Boston","details":{"zip":"02101"}}');
    });

    it('should handle array elements that are direct string values', () => {
      const accumulator = new GoogleJSONAccumulator();
      const firstStep = accumulator.processPartialArgs([
        { jsonPath: '$.steps[0]', stringValue: 'Step one' },
      ]);
      expect(firstStep.textDelta).toBe('{"steps":["Step one"');

      const secondStep = accumulator.processPartialArgs([
        { jsonPath: '$.steps[1]', stringValue: 'Step two' },
      ]);
      expect(secondStep.textDelta).toBe(',"Step two"');

      expect(secondStep.currentJSON).toEqual({
        steps: ['Step one', 'Step two'],
      });
    });

    it('should handle deeply nested paths', () => {
      const accumulator = new GoogleJSONAccumulator();
      const result = accumulator.processPartialArgs([
        { jsonPath: '$.a.b.c.d', stringValue: 'deep' },
      ]);

      expect(result.textDelta).toBe('{"a":{"b":{"c":{"d":"deep"');
      expect(result.currentJSON).toEqual({
        a: { b: { c: { d: 'deep' } } },
      });

      const { finalJSON, closingDelta } = accumulator.finalize();
      expect(closingDelta).toBe('}}}}');
      expect(finalJSON).toBe('{"a":{"b":{"c":{"d":"deep"}}}}');
    });
  });

  describe('finalize', () => {
    it('should produce closing delta for a continued string', () => {
      const accumulator = new GoogleJSONAccumulator();
      accumulator.processPartialArgs([
        { jsonPath: '$.location', stringValue: 'Boston', willContinue: true },
      ]);

      const { finalJSON, closingDelta } = accumulator.finalize();
      expect(closingDelta).toBe('"}');
      expect(finalJSON).toBe('{"location":"Boston"}');
    });

    it('should produce closing delta for a complete string', () => {
      const accumulator = new GoogleJSONAccumulator();
      accumulator.processPartialArgs([
        { jsonPath: '$.location', stringValue: 'Boston' },
      ]);

      const { finalJSON, closingDelta } = accumulator.finalize();
      expect(closingDelta).toBe('}');
      expect(finalJSON).toBe('{"location":"Boston"}');
    });

    it('should produce closing delta for multiple args', () => {
      const accumulator = new GoogleJSONAccumulator();
      accumulator.processPartialArgs([
        { jsonPath: '$.brightness', numberValue: 50 },
        { jsonPath: '$.enabled', boolValue: true },
      ]);

      const { finalJSON, closingDelta } = accumulator.finalize();
      expect(closingDelta).toBe('}');
      expect(finalJSON).toBe('{"brightness":50,"enabled":true}');
    });

    it('should produce closing delta for continued string with continuation', () => {
      const accumulator = new GoogleJSONAccumulator();
      accumulator.processPartialArgs([
        { jsonPath: '$.location', stringValue: 'Boston', willContinue: true },
      ]);
      accumulator.processPartialArgs([
        { jsonPath: '$.location', stringValue: ', MA' },
      ]);

      const { finalJSON, closingDelta } = accumulator.finalize();
      expect(closingDelta).toBe('"}');
      expect(finalJSON).toBe('{"location":"Boston, MA"}');
    });

    it('should handle empty accumulator', () => {
      const accumulator = new GoogleJSONAccumulator();
      const { finalJSON, closingDelta } = accumulator.finalize();
      expect(closingDelta).toBe('{}');
      expect(finalJSON).toBe('{}');
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
      expect(JSON.parse(finalJSON)).toEqual({
        recipe: {
          ingredients: [{ name: 'Noodles' }],
          name: 'Lasagna',
        },
      });
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
      expect(JSON.parse(finalJSON)).toEqual({
        recipe: { steps: ['Preheat oven.', 'Cook.'] },
      });
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
      expect(JSON.parse(finalJSON)).toEqual({
        brightness: 50,
        enabled: true,
        name: 'test',
      });
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
      expect(JSON.parse(finalJSON)).toEqual({
        recipe: {
          ingredients: [
            { amount: '16 oz', name: 'Noodles' },
            { amount: '1 lb', name: 'Beef' },
          ],
          name: 'Lasagna',
          steps: ['Preheat oven.', 'Cook.'],
        },
      });
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
