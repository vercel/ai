import { API, FileInfo, Identifier } from 'jscodeshift';

export default function transformer(file: FileInfo, api: API) {
  const j = api.jscodeshift;
  const root = j(file.source);

  // Type mapping
  const typeMap = {
    ExperimentalMessage: 'CoreMessage',
    ExperimentalUserMessage: 'CoreUserMessage',
    ExperimentalAssistantMessage: 'CoreAssistantMessage',
    ExperimentalToolMessage: 'CoreToolMessage',
  };

  // Replace imports
  root
    .find(j.ImportSpecifier)
    .filter(path => Object.keys(typeMap).includes(path.node.imported.name))
    .forEach(path => {
      const oldName = path.node.imported.name;
      const newName = typeMap[oldName as keyof typeof typeMap];

      j(path).replaceWith(j.importSpecifier(j.identifier(newName)));
    });

  // Replace type references
  root
    .find(j.TSTypeReference)
    .filter(path => {
      const typeName = path.node.typeName;
      return (
        typeName.type === 'Identifier' &&
        Object.prototype.hasOwnProperty.call(typeMap, typeName.name)
      );
    })
    .forEach(path => {
      const typeName = path.node.typeName as Identifier;
      typeName.name = typeMap[typeName.name as keyof typeof typeMap];
    });

  return root.toSource();
}
