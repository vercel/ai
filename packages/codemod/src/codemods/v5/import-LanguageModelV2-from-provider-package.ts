import { createTransformer } from '../lib/create-transformer';

const ImportMappings: Record<string, string> = {
  LanguageModelV1: 'LanguageModelV2',
  LanguageModelV2: 'LanguageModelV2',
  LanguageModelV1Middleware: 'LanguageModelV2Middleware',
  LanguageModelV2Middleware: 'LanguageModelV2Middleware',
};

export default createTransformer((fileInfo, api, options, context) => {
  const { j, root } = context;

  // Find all import declarations
  root.find(j.ImportDeclaration).forEach(importPath => {
    const node = importPath.node;

    // Check if the source value is exactly '@ai-sdk/provider'
    if (node.source.value !== '@ai-sdk/provider') return;

    // Check if the named import includes 'LanguageModelV1' or 'LanguageModelV2'
    const specifiers =
      node.specifiers?.filter(
        s =>
          j.ImportSpecifier.check(s) &&
          Object.keys(ImportMappings).includes(s.imported.name),
      ) ?? [];

    // Rename LanguageModelV1 to LanguageModelV2 if present
    for (const specifier of specifiers) {
      if (
        specifier.type === 'ImportSpecifier' &&
        ImportMappings[specifier.imported.name]
      ) {
        specifier.imported.name = ImportMappings[specifier.imported.name];
      }
    }

    // Set hasChanges to true since we will modify the AST
    context.hasChanges = true;

    // Change the module source from '@ai-sdk/provider' to 'ai'
    node.source.value = 'ai';

    context.messages.push(`Updated import from '@ai-sdk/provider' to 'ai'`);
  });
});
