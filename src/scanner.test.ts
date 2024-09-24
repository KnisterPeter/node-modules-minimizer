import { describe, it } from "node:test";
import Assert from "node:assert";
import { createScanner } from "./scanner.js";
import ts from "typescript";
import Path from "node:path";

describe("Scanner", () => {
  it("should parse files", () => {
    const source = ts.createSourceFile(
      "file.ts",
      `
        console.log("Hello, World!");
      `,
      ts.ScriptTarget.ESNext,
    );

    const scanner = createScanner(source);
    scanner.run();

    Assert.deepEqual(scanner.files, []);
  });

  it("should resolve imports", () => {
    const source = ts.createSourceFile(
      "file.ts",
      `
        import './index.ts';
        import type { Something } from './index.ts';
        import * as mod from './index.ts';
        export * from './index.ts';
        export { Something } from './index.ts';

        import('./index.ts');
      `,
      ts.ScriptTarget.ESNext,
    );

    const scanner = createScanner(source);
    scanner.run();

    Assert.deepEqual(
      scanner.files.map((file) => Path.relative(process.cwd(), file)),
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
});
