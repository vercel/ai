import ts, { createProgram } from 'typescript';
import * as path from 'path';
import { createTransformer } from '../lib/create-transformer';

const sourceFiles = new Map<string, ts.SourceFile>();

const getSourceFile = (filePath: string) => {
  if (sourceFiles.has(filePath)) return sourceFiles.get(filePath)!;

  const sourceFile = ts.createSourceFile(
    filePath,
    ts.sys.readFile(filePath) ?? '',
    ts.ScriptTarget.ESNext,
    true,
  );
  sourceFiles.set(filePath, sourceFile);

  return sourceFile;
};

const typecheckerMap = new Map<string, ts.TypeChecker>();

function getTypeChecker(filePath: string) {
  // Find nearest tsconfig.json
  const configPath = ts.findConfigFile(
    filePath,
    ts.sys.fileExists,
    'tsconfig.json',
  );
  if (!configPath) throw new Error('Could not find tsconfig.json');
  // if (typecheckerMap.has(configPath)) return typecheckerMap.get(configPath)!;

  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(configPath),
  );

  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
  });
  const typechecker = program.getTypeChecker();
  typecheckerMap.set(configPath, typechecker);
  return { typechecker, program };
}

function getTypeAtNode(checker: ts.TypeChecker, node: ts.Node): string {
  const type = checker.getTypeAtLocation(node);
  return checker.typeToString(type);
}

function findTsNodeAtPosition(
  sourceFile: ts.SourceFile,
  start: {
    line: number;
    column: number;
  },
  end: {
    line: number;
    column: number;
  },
): ts.Node | undefined {
  function recur(node: ts.Node): ts.Node | undefined {
    const nodeStart = sourceFile.getLineAndCharacterOfPosition(
      node.getStart(sourceFile),
    );
    const nodeEnd = sourceFile.getLineAndCharacterOfPosition(node.getEnd());

    if (
      nodeStart.line + 1 === start.line &&
      nodeStart.character === start.column &&
      nodeEnd.line + 1 === end.line &&
      nodeEnd.character === end.column
    ) {
      return node;
    }
    return node.forEachChild(recur);
  }
  return recur(sourceFile);
}

export default createTransformer((fileInfo, api, options, context) => {
  const { j, root } = context;

  // Step 1: Find all variables assigned from generateText call
  const generateTextVars = new Set();

  // Variable declarations: const foo = await generateText(...)
  root
    .find(j.VariableDeclarator)
    .filter(path => {
      const init = path.node.init;
      if (!init) return false;

      if (j.AwaitExpression.check(init)) {
        if (
          j.CallExpression.check(init.argument) &&
          j.Identifier.check(init.argument.callee) &&
          init.argument.callee.name === 'generateText'
        ) {
          return true;
        }
      }

      return false;
    })
    .forEach(path => {
      if (j.Identifier.check(path.node.id)) {
        generateTextVars.add(path.node.id.name);
      }
    });

  // Assignment expressions: foo = await generateText(...)
  root
    .find(j.AssignmentExpression)
    .filter(path => {
      const right = path.node.right;
      if (!right) return false;
      if (j.AwaitExpression.check(right)) {
        if (
          j.CallExpression.check(right.argument) &&
          j.Identifier.check(right.argument.callee) &&
          right.argument.callee.name === 'generateText'
        ) {
          return true;
        }
      }

      return false;
    })
    .forEach(path => {
      if (j.Identifier.check(path.node.left)) {
        generateTextVars.add(path.node.left.name);
      }
    });

  // Step 2: Find .text usage on those variables
  root
    .find(j.MemberExpression)
    .filter(path => {
      const node = path.node;
      // Must be accessing a property called 'text'
      if (!j.Identifier.check(node.property) || node.property.name !== 'text') {
        return false;
      }
      // The object must be a simple identifier (not a member expression)
      if (!j.Identifier.check(node.object)) {
        return false;
      }
      // Ensure .text is not being called as a function (i.e., not result.text(...))
      if (
        path.parentPath &&
        j.CallExpression.check(path.parentPath.node) &&
        path.parentPath.node.callee === node
      ) {
        return false;
      }
      const isFromGenerateText = generateTextVars.has(node.object.name);
      if (!isFromGenerateText) return false;

      const { start, end } = node.loc!;
      const filePath =
        '/Users/imranhussain/Documents/open-source/ai/packages/codemod/src/test/__testfixtures__/replace-generatetext-text-property.input.ts';
      const { typechecker, program } = getTypeChecker(filePath);
      const programSourceFile = program.getSourceFile(filePath);
      if (!programSourceFile) return false;
      const tsNode = findTsNodeAtPosition(programSourceFile, start, end);
      if (!tsNode) return false;
      const typeAtNode = getTypeAtNode(typechecker, tsNode);
      console.log({ typeAtNode });
      const diagnostics = ts.getPreEmitDiagnostics(program);

      process.exit(1);
      if (!typeAtNode.includes('GenerateTextResult')) return false;

      return true;
    })
    .forEach(path => {
      // Transform result.text to result.text.text by creating a new member expression
      // and setting the object to be the current member expression
      const newMemberExpression = j.memberExpression(
        path.node,
        j.identifier('text'),
      );

      // Replace the entire member expression with the new nested one
      path.replace(newMemberExpression);
      context.hasChanges = true;
    });
});
