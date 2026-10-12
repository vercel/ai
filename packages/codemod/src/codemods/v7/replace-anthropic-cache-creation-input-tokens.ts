import { createTransformer } from '../lib/create-transformer';

function getPropertyName(node: any): string | undefined {
  if (node?.type === 'Identifier') return node.name;
  if (node?.type === 'Literal' || node?.type === 'StringLiteral') {
    return typeof node.value === 'string' ? node.value : undefined;
  }
}

function isMemberExpression(node: any): boolean {
  return (
    node?.type === 'MemberExpression' ||
    node?.type === 'OptionalMemberExpression'
  );
}

function createReplacementMemberExpression({
  j,
  object,
  property,
  original,
}: {
  j: any;
  object: any;
  property: string;
  original: any;
}) {
  return original.type === 'OptionalMemberExpression'
    ? j.optionalMemberExpression(
        object,
        j.identifier(property),
        false,
        original.optional,
      )
    : j.memberExpression(object, j.identifier(property));
}

export default createTransformer((fileInfo, api, options, context) => {
  const { j, root } = context;

  root
    .find(j.Identifier, { name: 'cacheCreationInputTokens' })
    .forEach(path => {
      const memberExpression = path.parent?.node;
      if (
        memberExpression?.type !== 'MemberExpression' &&
        memberExpression?.type !== 'OptionalMemberExpression'
      ) {
        return;
      }

      if (memberExpression.property !== path.node) return;

      const anthropicAccess = memberExpression.object;
      if (
        !isMemberExpression(anthropicAccess) ||
        getPropertyName(anthropicAccess.property) !== 'anthropic'
      ) {
        return;
      }

      const providerMetadataAccess = anthropicAccess.object;
      if (
        !isMemberExpression(providerMetadataAccess) ||
        getPropertyName(providerMetadataAccess.property) !== 'providerMetadata'
      ) {
        return;
      }

      j(path.parent).replaceWith(
        createReplacementMemberExpression({
          j,
          object: createReplacementMemberExpression({
            j,
            object: createReplacementMemberExpression({
              j,
              object: providerMetadataAccess.object,
              property: 'usage',
              original: providerMetadataAccess,
            }),
            property: 'inputTokenDetails',
            original: anthropicAccess,
          }),
          property: 'cacheWriteTokens',
          original: memberExpression,
        }),
      );
      context.hasChanges = true;
    });
});
