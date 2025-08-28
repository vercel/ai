import { Project, SyntaxKind } from 'ts-morph';

const project = new Project({
  tsConfigFilePath: './tsconfig.json',
});

const sourceFile = project.getSourceFileOrThrow(
  'src/test/__testfixtures__/replace-generatetext-text-property.input.ts',
);

const propertyAccesses = sourceFile.getDescendantsOfKind(
  SyntaxKind.PropertyAccessExpression,
);

for (const access of propertyAccesses) {
  if (access.getName() !== 'text') continue;

  const parent = access.getParentIfKind(SyntaxKind.PropertyAccessExpression);
  if (parent && parent.getName() === 'text') continue;

  const expression = access.getExpression();
  if (
    !expression.wasForgotten() &&
    expression.getKind() === SyntaxKind.Identifier
  ) {
    const symbol = expression.getSymbol();
    if (!symbol) continue;

    const declarations = symbol.getDeclarations();
    if (declarations.length === 0) continue;
    const declType = declarations[0].getType();
    console.log('declType:', declType.getText());

    if (declType.getText().includes('GenerateTextResult')) {
      access.replaceWithText(`${access.getText()}.text`);
    }
  }
}

sourceFile.saveSync();
