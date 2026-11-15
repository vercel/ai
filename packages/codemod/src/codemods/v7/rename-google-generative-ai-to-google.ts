import { createTransformer } from '../lib/create-transformer';

const renamedExports = new Map([
  ['createGoogleGenerativeAI', 'createGoogle'],
  ['GoogleGenerativeAIProvider', 'GoogleProvider'],
  ['GoogleGenerativeAIProviderSettings', 'GoogleProviderSettings'],
  ['GoogleGenerativeAIProviderMetadata', 'GoogleProviderMetadata'],
  ['GoogleGenerativeAIProviderOptions', 'GoogleLanguageModelOptions'],
  ['GoogleGenerativeAIImageProviderOptions', 'GoogleImageModelOptions'],
  ['GoogleGenerativeAIEmbeddingProviderOptions', 'GoogleEmbeddingModelOptions'],
  ['GoogleGenerativeAIVideoProviderOptions', 'GoogleVideoModelOptions'],
  ['GoogleGenerativeAIVideoModelId', 'GoogleVideoModelId'],
]);

export default createTransformer((fileInfo, api, options, context) => {
  const { j, root } = context;

  root.find(j.ImportDeclaration).forEach(path => {
    if (path.node.source.value !== '@ai-sdk/google') return;

    path.node.specifiers = path.node.specifiers?.map(specifier => {
      if (
        specifier.type !== 'ImportSpecifier' ||
        specifier.imported.type !== 'Identifier'
      ) {
        return specifier;
      }

      const importedName = specifier.imported.name;
      const newName = renamedExports.get(importedName);
      if (newName == null) return specifier;

      // Keep the local binding, including implicit aliases. Renaming references
      // can change public exports/object keys or miss block-scoped bindings.
      context.hasChanges = true;
      return {
        ...specifier,
        original: null,
        imported: j.identifier(newName),
        local: j.identifier(specifier.local?.name ?? importedName),
      };
    });
  });

  root.find(j.ExportNamedDeclaration).forEach(path => {
    if (path.node.source?.value !== '@ai-sdk/google') return;

    path.node.specifiers = path.node.specifiers?.map(specifier => {
      if (
        specifier.type !== 'ExportSpecifier' ||
        specifier.local?.type !== 'Identifier'
      ) {
        return specifier;
      }

      const newName = renamedExports.get(specifier.local.name);
      if (newName == null) return specifier;

      // The outward export name belongs to the application, not the provider.
      context.hasChanges = true;
      return { ...specifier, original: null, local: j.identifier(newName) };
    });
  });
});
