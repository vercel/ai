import { getStaticPropertyName } from '../ast-utils.mjs';

/**
 * Requires `AbortSignal` and `AbortController` typed properties in type
 * members to be named `abortSignal` / `abortController`, or with a more
 * specific `*AbortSignal` / `*AbortController` suffix. Vague names like
 * `signal` or `controller` obscure what the property represents.
 *
 * Only properties of interfaces and type literals are checked. A property
 * qualifies when its type is a plain reference to the type, or a union that
 * directly contains one. Computed keys are skipped because their name is not
 * statically known.
 */

const abortTypes = [
  {
    typeName: 'AbortSignal',
    messageId: 'abortSignal',
    namePattern: /^(?:abortSignal|.+AbortSignal)$/,
  },
  {
    typeName: 'AbortController',
    messageId: 'abortController',
    namePattern: /^(?:abortController|.+AbortController)$/,
  },
];

function getReferencedTypeNames(type) {
  if (type == null) return [];

  const candidates = type.type === 'TSUnionType' ? type.types : [type];

  return candidates
    .filter(
      candidate =>
        candidate.type === 'TSTypeReference' &&
        candidate.typeName.type === 'Identifier',
    )
    .map(candidate => candidate.typeName.name);
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require explicit `abortSignal` / `abortController` names for abort-related properties.',
    },
    messages: {
      abortSignal:
        'Name `AbortSignal` properties `abortSignal` or with a more specific `*AbortSignal` name. Vague names like `signal` obscure what the property represents.',
      abortController:
        'Name `AbortController` properties `abortController` or with a more specific `*AbortController` name. Vague names like `controller` obscure what the property represents.',
    },
  },
  create(context) {
    return {
      TSPropertySignature(node) {
        if (node.computed) return;

        const name = getStaticPropertyName({
          key: node.key,
          computed: node.computed,
        });
        if (name === undefined) return;

        const typeNames = getReferencedTypeNames(
          node.typeAnnotation?.typeAnnotation,
        );

        for (const { typeName, messageId, namePattern } of abortTypes) {
          if (typeNames.includes(typeName) && !namePattern.test(name)) {
            context.report({ node, messageId });
          }
        }
      },
    };
  },
};
