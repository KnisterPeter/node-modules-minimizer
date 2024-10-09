import Assert from "node:assert";
import Path from "node:path";
import { describe, it } from "node:test";
import ts from "typescript";
import { createScanner } from "./scanner.js";

describe("Scanner", () => {
  it("should parse files", () => {
    const source = ts.createSourceFile(
      "file.ts",
      `
        console.log("Hello, World!");
      `,
      ts.ScriptTarget.ESNext,
      /* setParentNodes: */ true,
    );

    const scanner = createScanner(source);
    scanner.run();

    Assert.deepEqual(scanner.files, []);
  });

  it("should resolve imports", () => {
    const source = ts.createSourceFile(
      "src/file.ts",
      `
        import './index.ts';
        import type { Something } from './index.ts';
        import * as mod from './index.ts';
        export * from './index.ts';
        export { Something } from './index.ts';

        import('./index.ts');
      `,
      ts.ScriptTarget.ESNext,
      /* setParentNodes: */ true,
    );

    const scanner = createScanner(source);
    scanner.run();

    Assert.deepEqual(
      scanner.files.map((file) => Path.relative(process.cwd(), file.path)),
      ["src/index.ts"],
    );
  });

  it("should resolve commonjs requires", () => {
    const source = ts.createSourceFile(
      "src/file.ts",
      `
        require('./index.ts');
      `,
      ts.ScriptTarget.ESNext,
      /* setParentNodes: */ true,
    );

    const scanner = createScanner(source);
    scanner.run();

    Assert.deepEqual(
      scanner.files.map((file) => Path.relative(process.cwd(), file.path)),
      ["src/index.ts"],
    );
  });

  it("should emit diagnostic information", () => {
    const source = ts.createSourceFile(
      "file.ts",
      `
        const a = '.';
        const b = 'index.ts';
        import(a + '/' + b);
      `,
      ts.ScriptTarget.ESNext,
      /* setParentNodes: */ true,
    );

    const scanner = createScanner(source);
    scanner.run();

    Assert.deepEqual(scanner.diagnostics, [
      {
        file: "file.ts",
        message: `Ignoring import of 'import(a + '/' + b)'. Only static import paths are supported.`,
      },
    ]);
  });

  it("should mark dynamic imports as optional", () => {
    const source = ts.createSourceFile(
      "src/file.ts",
      `
        await import('./not-found.js');
      `,
      ts.ScriptTarget.ESNext,
      /* setParentNodes: */ true,
    );

    const scanner = createScanner(source);
    scanner.run();

    Assert.deepEqual(
      scanner.files.map((file) => Path.relative(process.cwd(), file.path)),
      [],
    );
    Assert.deepEqual(scanner.diagnostics, [
      {
        file: "src/file.ts",
        message: `Ignoring resolution error on dependency 'import('./not-found.js')' which is tagged as optional.`,
      },
    ]);
  });

  it("should mark top-level require as non-optional", () => {
    const source = ts.createSourceFile(
      "src/file.ts",
      `
        require('./not-found.js');
      `,
      ts.ScriptTarget.ESNext,
      /* setParentNodes: */ true,
    );

    const scanner = createScanner(source);
    Assert.throws(
      () => scanner.run(),
      /Cannot find package '.\/not-found.js' from '[^']*'/,
    );
  });

  it("should mark 'dynamic' require as optional", () => {
    const source = ts.createSourceFile(
      "src/file.ts",
      `
      try {
        require('./not-found.js');
      } catch {
      }
      `,
      ts.ScriptTarget.ESNext,
      /* setParentNodes: */ true,
    );

    const scanner = createScanner(source);
    scanner.run();

    Assert.deepEqual(
      scanner.files.map((file) => Path.relative(process.cwd(), file.path)),
      [],
    );
    Assert.deepEqual(scanner.diagnostics, [
      {
        file: "src/file.ts",
        message: `Ignoring resolution error on dependency 'require('./not-found.js')' which is tagged as optional.`,
      },
    ]);
  });
});
