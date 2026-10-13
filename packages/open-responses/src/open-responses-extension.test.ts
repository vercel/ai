import { describe, expect, it } from 'vitest';
import {
  createOpenResponsesExtensionRegistry,
  type OpenResponsesBareExtension,
  type OpenResponsesExtension,
  type OpenResponsesExtensionRegistration,
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

  it('should index explicitly registered bare extension semantics', () => {
    const extension: OpenResponsesBareExtension = {
      id: 'acme.search',
      allowBareTypes: true,
      bareToolType: 'web_search',
      bareItemTypes: ['web_search_call'],
      bareEventTypes: ['response.web_search_call.completed'],
      encodeTool: () => ({}),
      decodeItem: () => undefined,
      decodeEvent: () => undefined,
    };
    const registry = createOpenResponsesExtensionRegistry([extension]);

    expect(registry.byProviderToolId.get('acme.search')).toBe(extension);
    expect(registry.byToolType.get('web_search')).toBe(extension);
    expect(registry.byItemType.get('web_search_call')).toBe(extension);
    expect(registry.byEventType.get('response.web_search_call.completed')).toBe(
      extension,
    );
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

  it('should reject bare wire types in namespaced fields', () => {
    expect(() =>
      createOpenResponsesExtensionRegistry([
        createExtension({
          toolType: 'web_search' as `${string}:${string}`,
        }),
      ]),
    ).toThrow('Extension wire types must use the acme: namespace.');
  });

  it('should reject namespaced wire types in bare fields', () => {
    expect(() =>
      createOpenResponsesExtensionRegistry([
        {
          id: 'acme.search',
          allowBareTypes: true,
          bareToolType: 'acme:web_search',
          encodeTool: () => ({}),
        },
      ]),
    ).toThrow(
      'Bare extension wire types must be non-empty and must not contain a colon.',
    );
  });

  it('should require an explicit bare type opt-in', () => {
    expect(() =>
      createOpenResponsesExtensionRegistry([
        {
          id: 'acme.search',
          bareToolType: 'web_search',
          encodeTool: () => ({}),
        } as unknown as OpenResponsesExtensionRegistration,
      ]),
    ).toThrow(
      'must set allowBareTypes to true exactly when registering bare types',
    );

    expect(() =>
      createOpenResponsesExtensionRegistry([
        {
          id: 'acme.search',
          allowBareTypes: true,
          toolType: 'acme:search',
          encodeTool: () => ({}),
        } as unknown as OpenResponsesExtensionRegistration,
      ]),
    ).toThrow(
      'must set allowBareTypes to true exactly when registering bare types',
    );
  });

  it('should reject core wire types in bare fields', () => {
    expect(() =>
      createOpenResponsesExtensionRegistry([
        {
          id: 'acme.search',
          allowBareTypes: true,
          bareToolType: 'function',
          encodeTool: () => ({}),
        },
      ]),
    ).toThrow('cannot register core bareToolType value function');

    expect(() =>
      createOpenResponsesExtensionRegistry([
        {
          id: 'acme.search',
          allowBareTypes: true,
          bareItemTypes: ['function_call'],
          decodeItem: () => undefined,
        },
      ]),
    ).toThrow('cannot register core bareItemTypes value function_call');

    expect(() =>
      createOpenResponsesExtensionRegistry([
        {
          id: 'acme.search',
          allowBareTypes: true,
          bareEventTypes: ['response.output_text.delta'],
          decodeEvent: () => undefined,
        },
      ]),
    ).toThrow(
      'cannot register core bareEventTypes value response.output_text.delta',
    );
  });

  it('should reject ambiguous tool type registration', () => {
    expect(() =>
      createOpenResponsesExtensionRegistry([
        {
          ...createExtension(),
          allowBareTypes: true,
          bareToolType: 'web_search',
        } as unknown as OpenResponsesExtensionRegistration,
      ]),
    ).toThrow('cannot provide toolType and bareToolType together');
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

  it('should reject duplicate bare registrations', () => {
    expect(() =>
      createOpenResponsesExtensionRegistry([
        {
          id: 'acme.search',
          allowBareTypes: true,
          bareItemTypes: ['web_search_call'],
          decodeItem: () => undefined,
        },
        {
          id: 'other.search',
          allowBareTypes: true,
          bareItemTypes: ['web_search_call'],
          decodeItem: () => undefined,
        },
      ]),
    ).toThrow(
      'item type web_search_call because it is already registered by acme.search',
    );
  });
});
