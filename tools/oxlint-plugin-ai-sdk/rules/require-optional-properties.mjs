/**
 * Disallows `null` or `undefined` in a type member's property type to
 * represent absence. Absence should be expressed with optional property syntax
 * while the property's value type stays non-nullish.
 *
 * Only unions that directly contain `null` or `undefined` are flagged, and this
 * applies to optional properties too (`code?: number | null`). Nullish types
 * nested elsewhere, such as in a function property's return type, are not
 * checked.
 */

const nullishTypes = new Set(['TSNullKeyword', 'TSUndefinedKeyword']);

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require optional property syntax instead of `null` or `undefined` in property types.',
    },
    messages: {
      nullishPropertyType:
        "Do not include `null` or `undefined` in a property type to represent absence. Use optional property syntax and keep the property's value type non-nullish.",
    },
  },
  create(context) {
    return {
      TSPropertySignature(node) {
        const type = node.typeAnnotation?.typeAnnotation;
        if (
          type?.type === 'TSUnionType' &&
          type.types.some(member => nullishTypes.has(member.type))
        ) {
          context.report({ node, messageId: 'nullishPropertyType' });
        }
      },
    };
  },
};
