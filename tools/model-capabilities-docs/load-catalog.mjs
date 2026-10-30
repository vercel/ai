import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export async function loadCatalog(entryUrl) {
  const compiled = new Map();
  const sourceRoot = new URL('./', entryUrl);

  // Load the local TypeScript graph in memory. This works before package builds
  // and on the repository's minimum Node.js version without a custom TS loader.
  async function compile(url, ancestors = []) {
    if (ancestors.includes(url.href)) {
      throw new Error(`Circular catalog dependency: ${fileURLToPath(url)}`);
    }
    if (compiled.has(url.href)) return compiled.get(url.href);
    const source = await readFile(url, 'utf8');
    const { outputText, diagnostics } = ts.transpileModule(source, {
      fileName: fileURLToPath(url),
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
      reportDiagnostics: true,
    });
    const errors =
      diagnostics?.filter(
        diagnostic => diagnostic.category === ts.DiagnosticCategory.Error,
      ) ?? [];
    if (errors.length > 0) {
      const messages = errors.map(error =>
        ts.flattenDiagnosticMessageText(error.messageText, '\n'),
      );
      throw new Error(
        `Cannot load ${fileURLToPath(url)}: ${messages.join('\n')}`,
      );
    }

    const module = ts.createSourceFile(
      fileURLToPath(url),
      outputText,
      ts.ScriptTarget.Latest,
      true,
    );
    const replacements = [];
    for (const statement of module.statements) {
      if (
        !ts.isImportDeclaration(statement) &&
        !ts.isExportDeclaration(statement)
      )
        continue;
      const specifier = statement.moduleSpecifier;
      if (specifier == null) continue;
      const name = specifier.text;
      if (!name.startsWith('./') && !name.startsWith('../')) {
        throw new Error(`Catalog runtime imports must be local: ${name}`);
      }
      const dependency = new URL(name, url);
      if (!dependency.pathname.endsWith('.ts')) {
        dependency.pathname = dependency.pathname.endsWith('.js')
          ? dependency.pathname.slice(0, -3) + '.ts'
          : dependency.pathname + '.ts';
      }
      if (!dependency.href.startsWith(sourceRoot.href)) {
        throw new Error(
          `Catalog dependency is outside provider sources: ${name}`,
        );
      }
      const dependencyUrl = await compile(dependency, [...ancestors, url.href]);
      replacements.push({
        start: specifier.getStart(module),
        end: specifier.getEnd(),
        value: JSON.stringify(dependencyUrl),
      });
    }
    rejectDynamicImports(module);
    let output = outputText;
    for (const { start, end, value } of replacements.reverse()) {
      output = output.slice(0, start) + value + output.slice(end);
    }
    const moduleUrl = `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;
    compiled.set(url.href, moduleUrl);
    return moduleUrl;
  }

  return import(await compile(entryUrl));
}

function rejectDynamicImports(node) {
  if (
    ts.isCallExpression(node) &&
    node.expression.kind === ts.SyntaxKind.ImportKeyword
  ) {
    throw new Error('Catalog modules must use static imports.');
  }
  ts.forEachChild(node, rejectDynamicImports);
}
