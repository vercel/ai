import { API, FileInfo } from 'jscodeshift';

export default function transformer(file: FileInfo, api: API) {
  const j = api.jscodeshift;
  const root = j(file.source);

  // Track imports from 'ai' package
  const targetImports = new Set<string>();

  // Replace imports
  root
    .find(j.ImportDeclaration)
    .filter(path => path.node.source.value === 'ai')
    .forEach(path => {
      path.node.specifiers = path.node.specifiers?.filter(spec => {
        if (
          spec.type === 'ImportSpecifier' &&
          spec.imported.type === 'Identifier' &&
          spec.imported.name === 'LanguageModelResponseMetadataWithHeaders'
        ) {
          // Track local name
          targetImports.add(spec.local?.name || spec.imported.name);

          // Replace with new type
          spec.imported.name = 'LanguageModelResponseMetadata';
          if (spec.local) {
            spec.local.name = 'LanguageModelResponseMetadata';
          }
          return true;
        }
        return true;
      });
    });

  // Replace type references
  root
    .find(j.TSTypeReference)
    .filter(
      path =>
        path.node.typeName.type === 'Identifier' &&
        targetImports.has(path.node.typeName.name),
    )
    .forEach(path => {
      if (path.node.typeName.type === 'Identifier') {
        path.node.typeName.name = 'LanguageModelResponseMetadata';
      }
    });

  return root.toSource();
}
