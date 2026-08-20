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
    providerExecuted: true,
    encodeTool: () => ({}),
    decodeItem: () => undefined,
    ...overrides,
  };
}

describe('createOpenResponsesExtensionRegistry', () => {
  it('should index registered extension semantics', () => {
    const extension = createExtension({
      eventTypes: ['acme:search_delta'],
    });
    const registry = createOpenResponsesExtensionRegistry([extension]);

    expect(registry.byId.get('acme.search')).toBe(extension);
    expect(registry.byToolType.get('acme:search')).toBe(extension);
    expect(registry.byItemType.get('acme:search_call')).toBe(extension);
    expect(registry.byEventType.get('acme:search_delta')).toBe(extension);
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
