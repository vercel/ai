import { createTransformer } from '../lib/create-transformer';

export default createTransformer((fileInfo, api, options, context) => {
  const { j, root } = context;

  root
    .find(j.ImportDeclaration, {
      source: {
        type: 'StringLiteral',
        value: 'zod',
      },
    })
    .forEach(path => {
      const importDeclaration = path.node;
      const defaultSpecifier = importDeclaration.specifiers?.find(
        spec => spec.type === 'ImportDefaultSpecifier'
      );

      if (defaultSpecifier && defaultSpecifier.type === 'ImportDefaultSpecifier') {
        const localName = defaultSpecifier.local?.name;
        
        if (localName === 'z') {
          const newImport = j.importDeclaration(
            [j.importSpecifier(j.identifier('z'))],
            j.stringLiteral('zod/v3')
          );
          
          newImport.comments = importDeclaration.comments;
          
          j(path).replaceWith(newImport);
          context.hasChanges = true;
        }
      }
    });
});
