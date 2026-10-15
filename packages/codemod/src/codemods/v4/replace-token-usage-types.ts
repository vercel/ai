import { createTransformer } from '../lib/create-transformer';

export default createTransformer((fileInfo, api, options, context) => {
  const { j, root } = context;
  const renameMap = new Map([
    ['TokenUsage', 'LanguageModelUsage'],
    ['CompletionTokenUsage', 'LanguageModelUsage'],
    ['EmbeddingTokenUsage', 'EmbeddingModelUsage'],
  ]);

  root
    .find(j.ImportDeclaration)
    .filter(path => path.node.source.value === 'ai')
    .forEach(path => {
      path.node.specifiers = path.node.specifiers?.map(spec => {
        if (spec.type !== 'ImportSpecifier') {
          return spec;
        }

        const newName = renameMap.get(spec.imported.name);
        if (!newName) {
          return spec;
        }

        context.hasChanges = true;
        const replacement = j.importSpecifier(
          j.identifier(newName),
          spec.local ?? j.identifier(spec.imported.name),
        );
        replacement.comments = spec.comments;
        if ('importKind' in spec) {
          Object.assign(replacement, { importKind: spec.importKind });
        }
        return replacement;
      });
    });
});
