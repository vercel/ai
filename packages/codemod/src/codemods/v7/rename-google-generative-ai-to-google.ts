import { createTransformer } from '../lib/create-transformer';

function renameGoogleGenerativeAI(name: string) {
  return name.replace(/GoogleGenerativeAI/g, 'Google');
}

export default createTransformer((fileInfo, api, options, context) => {
  const { j, root } = context;
  const localRenames = new Map<
    string,
    { newName: string; bindingScope: unknown }
  >();

  root.find(j.ImportDeclaration).forEach(path => {
    if (path.node.source.value !== '@ai-sdk/google') return;

    path.node.specifiers?.forEach(specifier => {
      if (
        specifier.type !== 'ImportSpecifier' ||
        specifier.imported.type !== 'Identifier' ||
        !specifier.imported.name.includes('GoogleGenerativeAI')
      ) {
        return;
      }

      const importedName = specifier.imported.name;
      const newName = renameGoogleGenerativeAI(importedName);
      const localName = specifier.local?.name ?? importedName;
      const bindingScope = path.scope.lookup(localName);
      specifier.imported.name = newName;
      if (!specifier.local || specifier.local.name === importedName) {
        specifier.local = null;
        localRenames.set(localName, { newName, bindingScope });
      }
      context.hasChanges = true;
    });
  });

  localRenames.forEach(({ newName, bindingScope }, oldName) => {
    root.find(j.Identifier, { name: oldName }).forEach(path => {
      if (path.parent?.node.type === 'ImportSpecifier') return;
      if (path.scope.lookup(oldName) !== bindingScope) return;

      path.node.name = newName;
      context.hasChanges = true;
    });
  });
});
