import { createTransformer } from './lib/create-transformer';

export default createTransformer((fileInfo, api, options, context) => {
  const { j, root } = context;

  // Replace imports at ImportDeclaration level
  root
    .find(j.ImportDeclaration)
    .filter(path => path.node.source.value === 'ai')
    .forEach(path => {
      const newSpecifiers = path.node.specifiers?.map(spec => {
        if (spec.type !== 'ImportSpecifier') return spec;

        const oldName = spec.imported.name;
        if (
          ![
            'TokenUsage',
            'CompletionTokenUsage',
            'EmbeddingTokenUsage',
          ].includes(oldName)
        ) {
          return spec;
        }

        context.hasChanges = true;
        const newName =
          oldName === 'EmbeddingTokenUsage'
            ? 'EmbeddingModelUsage'
            : 'LanguageModelUsage';

        return j.importSpecifier(j.identifier(newName));
      });

      if (newSpecifiers !== path.node.specifiers) {
        context.hasChanges = true;
        path.node.specifiers = newSpecifiers;
      }
    });

  // Replace type references
  root
    .find(j.TSTypeReference)
    .filter(
      path =>
        path.node.typeName.type === 'Identifier' &&
        ['TokenUsage', 'CompletionTokenUsage', 'EmbeddingTokenUsage'].includes(
          path.node.typeName.name,
        ),
    )
    .forEach(path => {
      if (path.node.typeName.type === 'Identifier') {
        context.hasChanges = true;
        const oldName = path.node.typeName.name;
        const newName =
          oldName === 'EmbeddingTokenUsage'
            ? 'EmbeddingModelUsage'
            : 'LanguageModelUsage';

        path.node.typeName = j.identifier(newName);
      }
    });
});
