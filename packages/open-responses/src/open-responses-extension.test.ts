import { describe, expect, it } from 'vitest';
import {
  createOpenResponsesExtensionRegistry,
  type OpenResponsesExtension,
} from './open-responses-extension';

function createExtension(
  overrides: Partial<OpenResponsesExtension> = {},
): OpenResponsesExtension {
  return {
    id: 'acme.search',
    toolType: 'acme:search',
    itemTypes: ['acme:search_call'],
    encodeTool: () => ({}),
    decodeItem: () => undefined,
    ...overrides,
  };
}

describe('createOpenResponsesExtensionRegistry', () => {
  it('should index registered extension semantics', () => {
    const extension = createExtension({
      eventTypes: ['acme:search_delta'],
      decodeEvent: () => undefined,
    });
    const registry = createOpenResponsesExtensionRegistry([extension]);

    expect(registry.byExtensionId.get('acme.search')).toBe(extension);
    expect(registry.byProviderToolId.get('acme.search')).toBe(extension);
    expect(registry.byToolType.get('acme:search')).toBe(extension);
    expect(registry.byItemType.get('acme:search_call')).toBe(extension);
    expect(registry.byEventType.get('acme:search_delta')).toBe(extension);
  });

  it('should register tool, item, and event capabilities independently', () => {
    const toolExtension = createExtension({
      itemTypes: undefined,
      decodeItem: undefined,
    });
    const itemExtension: OpenResponsesExtension = {
      id: 'acme.receipts',
      itemTypes: ['acme:receipt'],
      decodeItem: () => undefined,
    };
    const eventExtension: OpenResponsesExtension = {
      id: 'acme.progress',
      eventTypes: ['acme:progress_delta'],
      decodeEvent: () => undefined,
    };

    const registry = createOpenResponsesExtensionRegistry([
      toolExtension,
      itemExtension,
      eventExtension,
    ]);

    expect(registry.byProviderToolId.get('acme.search')).toBe(toolExtension);
    expect(registry.byItemType.get('acme:receipt')).toBe(itemExtension);
    expect(registry.byEventType.get('acme:progress_delta')).toBe(
      eventExtension,
    );
  });

  it('should reject incomplete capabilities', () => {
    expect(() =>
      createOpenResponsesExtensionRegistry([
        {
          id: 'acme.search',
          toolType: 'acme:search',
        },
      ]),
    ).toThrow('must provide toolType and encodeTool together');
  });

  it('should reject wire types outside the provider-tool namespace', () => {
    expect(() =>
      createOpenResponsesExtensionRegistry([
        createExtension({ toolType: 'other:search' }),
      ]),
    ).toThrow('Extension wire types must use the acme: namespace.');
  });

  it('should reject duplicate item registrations', () => {
    expect(() =>
      createOpenResponsesExtensionRegistry([
        createExtension(),
        createExtension({
          id: 'acme.other_search',
          toolType: 'acme:other_search',
        }),
      ]),
    ).toThrow(
      'item type acme:search_call because it is already registered by acme.search',
    );
  });
});
