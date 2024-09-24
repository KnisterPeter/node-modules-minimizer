import { globSync } from "glob";
import Fs from "node:fs";
import Path from "node:path";
import ts from "typescript";
import type { File } from "./file.js";
import { resolveModule } from "./resolver.js";
import { createScanner } from "./scanner.js";

/**
 * @internal
 */
export const languageOptions: ts.CreateSourceFileOptions = {
  languageVersion: ts.ScriptTarget.ESNext,
  impliedNodeFormat: ts.ModuleKind.ESNext,
};

export function getImportedFiles(...entrypoints: string[]): string[] {
  const filesToScan = entrypoints.flatMap((entrypoint) =>
    resolveModule(entrypoint, Path.join(process.cwd(), "package.json"), Fs),
  );

  const scannedFiles = new Set<string>();
  const importedFiles = new Set<string>();

  let file: File | undefined;
  while ((file = filesToScan.shift())) {
    if (scannedFiles.has(file.path)) continue;

    scannedFiles.add(file.path);
    importedFiles.add(file.path);

    if (!file.isFile) continue;

    const source = ts.createSourceFile(
      file.path,
      Fs.readFileSync(file.path, "utf8"),
      languageOptions,
      /* setParentNodes: */ true,
      ts.ScriptKind.TS,
    );

    const scanner = createScanner(source);
    scanner.run();
    filesToScan.push(...scanner.files);

    for (const diagnostic of scanner.diagnostics) {
      console.warn(`${diagnostic.file}: ${diagnostic.message}`);
    }
  }

  return Array.from(importedFiles);
}

export function findUnusedFilesInNodeModules(...files: string[]) {
  return globSync("**/node_modules/**", {
    absolute: true,
    dot: true,
    ignore: {
      ignored: (path) => files.some((file) => file.startsWith(path.fullpath())),
    },
  });
}
