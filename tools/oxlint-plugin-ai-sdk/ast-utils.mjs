/**
 * Resolves the statically known name of a property key or member property.
 *
 * Handles non-computed identifiers, string literals (computed or not), and
 * computed template literals without expressions. Returns `undefined` for
 * anything whose name cannot be determined statically, including private
 * identifiers.
 */
export function getStaticPropertyName({ key, computed }) {
  if (key == null) return undefined;

  if (key.type === 'Identifier' && !computed) {
    return key.name;
  }

  if (key.type === 'Literal' && typeof key.value === 'string') {
    return key.value;
  }

  if (
    key.type === 'TemplateLiteral' &&
    computed &&
    key.expressions.length === 0
  ) {
    return key.quasis[0]?.value.cooked ?? undefined;
  }

  return undefined;
}

/**
 * Checks whether `node` is `objectName.propertyName` (or the computed
 * string-literal equivalent `objectName['propertyName']`).
 */
export function isMemberAccess({ node, objectName, propertyName }) {
  return (
    node != null &&
    node.type === 'MemberExpression' &&
    node.object.type === 'Identifier' &&
    node.object.name === objectName &&
    getStaticPropertyName({ key: node.property, computed: node.computed }) ===
      propertyName
  );
}

export function isEmptyObjectExpression(node) {
  return (
    node != null &&
    node.type === 'ObjectExpression' &&
    node.properties.length === 0
  );
}
