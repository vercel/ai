import { createTransformer } from '../lib/create-transformer';

export default createTransformer((fileInfo, api, options, context) => {
  const { j, root } = context;

  // Find and replace import specifiers from 'ai'
  root
    .find(j.ImportDeclaration)
    .filter(path => path.node.source.value === 'ai')
    .forEach(path => {
      j(path)
        .find(j.ImportSpecifier)
        .filter(specifierPath => specifierPath.node.imported.name === 'nanoid')
        .forEach(specifierPath => {
          context.hasChanges = true;
          // Preserve the local binding so calls, callbacks, and exports keep
          // referring to the imported function without renaming shadowed names.
          const localName =
            specifierPath.node.local?.name ?? specifierPath.node.imported.name;
          const replacement = j.importSpecifier(
            j.identifier('generateId'),
            j.identifier(localName),
          );
          replacement.comments = specifierPath.node.comments;
          if ('importKind' in specifierPath.node) {
            Object.assign(replacement, {
              importKind: specifierPath.node.importKind,
            });
          }
          specifierPath.replace(replacement);
        });
    });
});
