import { createTransformer } from './lib/create-transformer';

export default createTransformer((fileInfo, api, options, context) => {
  const { j, root } = context;

  // Find all import declarations
  root.find(j.ImportDeclaration).forEach(importPath => {
    const node = importPath.node;

    // Check if the source value is exactly 'ai'
    if (node.source.value === 'ai') {
      // Check if the named import includes 'LanguageModelV2'
      const specifier = node.specifiers?.find(
        s =>
          j.ImportSpecifier.check(s) && s.imported.name === 'LanguageModelV2',
      );

      if (!specifier) return;
      // Set hasChanges to true since we will modify the AST
      context.hasChanges = true;

      // Change the module source from 'ai' to '@ai-sdk/provider'
      node.source = j.stringLiteral('@ai-sdk/provider');

      context.messages.push(
        `Updated import of LanguageModelV2 from 'ai' to '@ai-sdk/provider'`,
      );
    }
  });
});
