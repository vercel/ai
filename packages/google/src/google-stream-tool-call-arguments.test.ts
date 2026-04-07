import { describe, it, expect } from 'vitest';
import { GoogleJSONAccumulator } from './google-stream-tool-call-arguments';

describe('GoogleJSONAccumulator', () => {
  describe('flat paths', () => {
    it('should accumulate a simple string arg with willContinue', () => {
      const acc = new GoogleJSONAccumulator();
      const r = acc.processPartialArgs([
        { jsonPath: '$.location', stringValue: 'Boston', willContinue: true },
      ]);

      expect(r.textDelta).toBe('{"location":"Boston');
      expect(r.currentJSON).toEqual({ location: 'Boston' });
    });

    it('should continue a string arg across multiple chunks', () => {
      const acc = new GoogleJSONAccumulator();

      acc.processPartialArgs([
        { jsonPath: '$.location', stringValue: 'Boston', willContinue: true },
      ]);

      const r = acc.processPartialArgs([
        { jsonPath: '$.location', stringValue: ', MA' },
      ]);

      expect(r.textDelta).toBe(', MA');
      expect(r.currentJSON).toEqual({ location: 'Boston, MA' });
    });

    it('should accumulate a complete string arg (no willContinue)', () => {
      const acc = new GoogleJSONAccumulator();
      const r = acc.processPartialArgs([
        { jsonPath: '$.location', stringValue: 'Boston' },
      ]);

      expect(r.textDelta).toBe('{"location":"Boston"');
      expect(r.currentJSON).toEqual({ location: 'Boston' });
    });

    it('should accumulate a number arg', () => {
      const acc = new GoogleJSONAccumulator();
      const r = acc.processPartialArgs([
        { jsonPath: '$.brightness', numberValue: 50 },
      ]);

      expect(r.textDelta).toBe('{"brightness":50');
      expect(r.currentJSON).toEqual({ brightness: 50 });
    });

    it('should accumulate a boolean arg', () => {
      const acc = new GoogleJSONAccumulator();
      const r = acc.processPartialArgs([
        { jsonPath: '$.enabled', boolValue: true },
      ]);

      expect(r.textDelta).toBe('{"enabled":true');
      expect(r.currentJSON).toEqual({ enabled: true });
    });

    it('should accumulate a null arg', () => {
      const acc = new GoogleJSONAccumulator();
      const r = acc.processPartialArgs([
        { jsonPath: '$.nickname', nullValue: {} },
      ]);

      expect(r.textDelta).toBe('{"nickname":null');
      expect(r.currentJSON).toEqual({ nickname: null });
    });

    it('should accumulate multiple args with commas between them', () => {
      const acc = new GoogleJSONAccumulator();

      const r1 = acc.processPartialArgs([
        { jsonPath: '$.brightness', numberValue: 50 },
      ]);
      expect(r1.textDelta).toBe('{"brightness":50');

      const r2 = acc.processPartialArgs([
        { jsonPath: '$.enabled', boolValue: true },
      ]);
      expect(r2.textDelta).toBe(',"enabled":true');

      expect(r2.currentJSON).toEqual({ brightness: 50, enabled: true });
    });

    it('should accumulate multiple args in a single call', () => {
      const acc = new GoogleJSONAccumulator();
      const r = acc.processPartialArgs([
        { jsonPath: '$.brightness', numberValue: 50 },
        { jsonPath: '$.enabled', boolValue: false },
        { jsonPath: '$.nickname', nullValue: {} },
      ]);

      expect(r.textDelta).toBe(
        '{"brightness":50,"enabled":false,"nickname":null',
      );
      expect(r.currentJSON).toEqual({
        brightness: 50,
        enabled: false,
        nickname: null,
      });
    });

    it('should escape special characters in continued strings', () => {
      const acc = new GoogleJSONAccumulator();

      acc.processPartialArgs([
        {
          jsonPath: '$.query',
          stringValue: 'Boston "Lo',
          willContinue: true,
        },
      ]);

      const r = acc.processPartialArgs([
        { jsonPath: '$.query', stringValue: 'gan"' },
      ]);

      expect(r.textDelta).toBe('gan\\"');
      expect(r.currentJSON).toEqual({ query: 'Boston "Logan"' });
    });

    it('should skip args with empty jsonPath after stripping $. prefix', () => {
      const acc = new GoogleJSONAccumulator();
      const r = acc.processPartialArgs([
        { jsonPath: '$.', stringValue: 'ignored' },
      ]);

      expect(r.textDelta).toBe('');
      expect(r.currentJSON).toEqual({});
    });

    it('should skip args with no resolvable value', () => {
      const acc = new GoogleJSONAccumulator();
      const r = acc.processPartialArgs([{ jsonPath: '$.something' }]);

      expect(r.textDelta).toBe('');
      expect(r.currentJSON).toEqual({});
    });

    it('should return empty textDelta for empty partialArgs array', () => {
      const acc = new GoogleJSONAccumulator();
      const r = acc.processPartialArgs([]);

      expect(r.textDelta).toBe('');
      expect(r.currentJSON).toEqual({});
    });
  });

  describe('nested paths', () => {
    it('should build nested object from dotted jsonPath', () => {
      const acc = new GoogleJSONAccumulator();
      const r = acc.processPartialArgs([
        { jsonPath: '$.recipe.name', stringValue: 'Lasagna' },
      ]);

      expect(r.currentJSON).toEqual({ recipe: { name: 'Lasagna' } });
    });

    it('should build nested object with array from indexed jsonPath', () => {
      const acc = new GoogleJSONAccumulator();
      acc.processPartialArgs([
        {
          jsonPath: '$.recipe.ingredients[0].amount',
          stringValue: '16 oz',
        },
      ]);
      const r = acc.processPartialArgs([
        {
          jsonPath: '$.recipe.ingredients[0].name',
          stringValue: 'Lasagna noodles',
        },
      ]);

      expect(r.currentJSON).toEqual({
        recipe: {
          ingredients: [{ amount: '16 oz', name: 'Lasagna noodles' }],
        },
      });
    });

    it('should accumulate multiple array elements across chunks', () => {
      const acc = new GoogleJSONAccumulator();
      acc.processPartialArgs([
        {
          jsonPath: '$.recipe.ingredients[0].amount',
          stringValue: '16 oz',
        },
      ]);
      acc.processPartialArgs([
        {
          jsonPath: '$.recipe.ingredients[0].name',
          stringValue: 'Noodles',
        },
      ]);
      acc.processPartialArgs([
        {
          jsonPath: '$.recipe.ingredients[1].amount',
          stringValue: '1 lb',
        },
      ]);
      const r = acc.processPartialArgs([
        {
          jsonPath: '$.recipe.ingredients[1].name',
          stringValue: 'Beef',
        },
      ]);

      expect(r.currentJSON).toEqual({
        recipe: {
          ingredients: [
            { amount: '16 oz', name: 'Noodles' },
            { amount: '1 lb', name: 'Beef' },
          ],
        },
      });
    });

    it('should handle string continuation on nested paths', () => {
      const acc = new GoogleJSONAccumulator();
      acc.processPartialArgs([
        {
          jsonPath: '$.recipe.steps[0]',
          stringValue: 'Preheat oven',
          willContinue: true,
        },
      ]);
      const r = acc.processPartialArgs([
        { jsonPath: '$.recipe.steps[0]', stringValue: ' to 375°F.' },
      ]);

      expect(r.currentJSON).toEqual({
        recipe: { steps: ['Preheat oven to 375°F.'] },
      });
    });

    it('should handle mixed nested and flat paths', () => {
      const acc = new GoogleJSONAccumulator();
      acc.processPartialArgs([
        { jsonPath: '$.location', stringValue: 'Boston' },
      ]);
      const r = acc.processPartialArgs([
        { jsonPath: '$.details.zip', stringValue: '02101' },
      ]);

      expect(r.currentJSON).toEqual({
        location: 'Boston',
        details: { zip: '02101' },
      });
    });

    it('should handle array elements that are direct string values', () => {
      const acc = new GoogleJSONAccumulator();
      acc.processPartialArgs([
        { jsonPath: '$.steps[0]', stringValue: 'Step one' },
      ]);
      const r = acc.processPartialArgs([
        { jsonPath: '$.steps[1]', stringValue: 'Step two' },
      ]);

      expect(r.currentJSON).toEqual({
        steps: ['Step one', 'Step two'],
      });
    });

    it('should handle deeply nested paths', () => {
      const acc = new GoogleJSONAccumulator();
      const r = acc.processPartialArgs([
        { jsonPath: '$.a.b.c.d', stringValue: 'deep' },
      ]);

      expect(r.currentJSON).toEqual({
        a: { b: { c: { d: 'deep' } } },
      });
    });
  });

  describe('finalize', () => {
    it('should produce closing delta for a continued string', () => {
      const acc = new GoogleJSONAccumulator();
      acc.processPartialArgs([
        { jsonPath: '$.location', stringValue: 'Boston', willContinue: true },
      ]);

      const { finalJSON, closingDelta } = acc.finalize();
      expect(closingDelta).toBe('"}');
      expect(finalJSON).toBe('{"location":"Boston"}');
    });

    it('should produce closing delta for a complete string', () => {
      const acc = new GoogleJSONAccumulator();
      acc.processPartialArgs([
        { jsonPath: '$.location', stringValue: 'Boston' },
      ]);

      const { finalJSON, closingDelta } = acc.finalize();
      expect(closingDelta).toBe('}');
      expect(finalJSON).toBe('{"location":"Boston"}');
    });

    it('should produce closing delta for multiple args', () => {
      const acc = new GoogleJSONAccumulator();
      acc.processPartialArgs([
        { jsonPath: '$.brightness', numberValue: 50 },
        { jsonPath: '$.enabled', boolValue: true },
      ]);

      const { finalJSON, closingDelta } = acc.finalize();
      expect(closingDelta).toBe('}');
      expect(finalJSON).toBe('{"brightness":50,"enabled":true}');
    });

    it('should produce closing delta for continued string with continuation', () => {
      const acc = new GoogleJSONAccumulator();
      acc.processPartialArgs([
        { jsonPath: '$.location', stringValue: 'Boston', willContinue: true },
      ]);
      acc.processPartialArgs([{ jsonPath: '$.location', stringValue: ', MA' }]);

      const { finalJSON, closingDelta } = acc.finalize();
      expect(closingDelta).toBe('"}');
      expect(finalJSON).toBe('{"location":"Boston, MA"}');
    });

    it('should handle empty accumulator', () => {
      const acc = new GoogleJSONAccumulator();
      const { finalJSON, closingDelta } = acc.finalize();
      expect(closingDelta).toBe('{}');
      expect(finalJSON).toBe('{}');
    });

    it('should finalize nested structure to proper JSON', () => {
      const acc = new GoogleJSONAccumulator();
      acc.processPartialArgs([
        {
          jsonPath: '$.recipe.ingredients[0].name',
          stringValue: 'Noodles',
        },
      ]);
      acc.processPartialArgs([
        { jsonPath: '$.recipe.name', stringValue: 'Lasagna' },
      ]);

      const { finalJSON } = acc.finalize();
      expect(JSON.parse(finalJSON)).toEqual({
        recipe: {
          ingredients: [{ name: 'Noodles' }],
          name: 'Lasagna',
        },
      });
    });

    it('should finalize nested arrays with string continuation', () => {
      const acc = new GoogleJSONAccumulator();
      acc.processPartialArgs([
        {
          jsonPath: '$.recipe.steps[0]',
          stringValue: 'Preheat',
          willContinue: true,
        },
      ]);
      acc.processPartialArgs([
        { jsonPath: '$.recipe.steps[0]', stringValue: ' oven.' },
      ]);
      acc.processPartialArgs([
        { jsonPath: '$.recipe.steps[1]', stringValue: 'Cook.' },
      ]);

      const { finalJSON } = acc.finalize();
      expect(JSON.parse(finalJSON)).toEqual({
        recipe: { steps: ['Preheat oven.', 'Cook.'] },
      });
    });
  });
});
