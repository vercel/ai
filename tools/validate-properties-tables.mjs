#!/usr/bin/env node

// Validates <PropertiesTable> usage in content/**/*.mdx.
//
// The docs are rendered downstream, where every parameter name is converted
// to kebab case. A parameter object without a string `name` crashes that
// render, so validate the source metadata before it reaches the docs build.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const contentRoot = resolve(repoRoot, 'content');
const files = collectMdxFiles(contentRoot).sort();
const errors = [];

for (const absolutePath of files) {
  const relativePath = relative(repoRoot, absolutePath);
  const source = readFileSync(absolutePath, 'utf8');

  for (const { code, offset } of extractPropertiesTableContents(source)) {
    const wrapped = `const __x = ${code};`;
    const sourceFile = ts.createSourceFile(
      'snippet.ts',
      wrapped,
      ts.ScriptTarget.Latest,
      true,
    );
    const wrapPrefixLength = 'const __x = '.length;
    const declaration = sourceFile.statements[0];
    const arrayLiteral =
      declaration?.declarationList?.declarations?.[0]?.initializer;

    if (!arrayLiteral || !ts.isArrayLiteralExpression(arrayLiteral)) {
      continue;
    }

    validateParameterList(arrayLiteral, ({ position, message }) => {
      const sourcePosition = position - wrapPrefixLength + offset;
      const { line, column } = lineAndColumnAt(source, sourcePosition);
      errors.push({
        file: relativePath,
        line,
        column,
        message,
      });
    });
  }
}

if (errors.length > 0) {
  console.error(
    `\nFound ${errors.length} invalid <PropertiesTable> parameter(s):\n`,
  );

  for (const error of errors) {
    console.error(
      `  ${error.file}:${error.line}:${error.column} - ${error.message}`,
    );
  }

  console.error(
    '\nEvery parameter object in a <PropertiesTable> `content` or nested ' +
      '`parameters` array must declare a string `name`.\n',
  );
  process.exit(1);
}

console.log(
  `Validated <PropertiesTable> usage in ${files.length} MDX file(s).`,
);

function collectMdxFiles(directory) {
  const files = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectMdxFiles(path));
    } else if (entry.isFile() && entry.name.endsWith('.mdx')) {
      files.push(path);
    }
  }

  return files;
}

function extractPropertiesTableContents(source) {
  const results = [];
  const tagPattern = /<PropertiesTable\b/g;
  let match;

  while ((match = tagPattern.exec(source)) !== null) {
    const attributeIndex = source.indexOf('content', match.index);
    if (attributeIndex === -1) {
      continue;
    }

    const equalsIndex = source.indexOf('=', attributeIndex);
    const braceIndex = source.indexOf('{', equalsIndex);
    if (braceIndex === -1) {
      continue;
    }

    const end = matchBalanced(source, braceIndex, '{', '}');
    if (end === -1) {
      continue;
    }

    results.push({
      code: source.slice(braceIndex + 1, end),
      offset: braceIndex + 1,
    });
  }

  return results;
}

function matchBalanced(source, start, open, close) {
  let depth = 0;

  for (let index = start; index < source.length; index++) {
    const character = source[index];

    if (character === open) {
      depth++;
    } else if (character === close) {
      depth--;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function validateParameterList(arrayLiteral, report) {
  for (const element of arrayLiteral.elements) {
    if (!ts.isObjectLiteralExpression(element)) {
      continue;
    }

    const name = getProperty(element, 'name');
    if (!name || !ts.isStringLiteralLike(name.initializer)) {
      report({
        position: element.getStart(),
        message: 'parameter object is missing a string `name`',
      });
    }

    const properties = getProperty(element, 'properties');
    if (
      !properties ||
      !ts.isArrayLiteralExpression(properties.initializer)
    ) {
      continue;
    }

    for (const group of properties.initializer.elements) {
      if (!ts.isObjectLiteralExpression(group)) {
        continue;
      }

      const parameters = getProperty(group, 'parameters');
      if (
        parameters &&
        ts.isArrayLiteralExpression(parameters.initializer)
      ) {
        validateParameterList(parameters.initializer, report);
      }
    }
  }
}

function getProperty(objectLiteral, name) {
  return objectLiteral.properties.find(
    property =>
      ts.isPropertyAssignment(property) &&
      (ts.isIdentifier(property.name) ||
        ts.isStringLiteral(property.name)) &&
      property.name.text === name,
  );
}

function lineAndColumnAt(source, position) {
  let line = 1;
  let lastNewline = -1;

  for (let index = 0; index < position && index < source.length; index++) {
    if (source[index] === '\n') {
      line++;
      lastNewline = index;
    }
  }

  return {
    line,
    column: position - lastNewline,
  };
}
