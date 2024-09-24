import Fs from "node:fs";
import Path from "node:path";
import NodeUrl from "node:url";
import ts from "typescript";
import { createScanner } from "./scanner.js";

/**
 * @internal
 */
export const languageOptions: ts.CreateSourceFileOptions = {
  languageVersion: ts.ScriptTarget.ESNext,
  impliedNodeFormat: ts.ModuleKind.ESNext,
};

if (NodeUrl.fileURLToPath(import.meta.url) === import.meta.filename) {
  console.log(
    getImportedFiles(...process.argv.slice(2))
      .map((file) => Path.relative(process.cwd(), file))
      .join("\n"),
  );
}

export function getImportedFiles(...files: string[]): string[] {
  const filesToScan = [...files];
  const scannedFiles: string[] = [];
  const importedFiles = [];

  let file: string | undefined;
  while ((file = filesToScan.shift())) {
    file = Path.resolve(file);
    if (scannedFiles.includes(file)) continue;
    scannedFiles.push(file);
    importedFiles.push(file);

    const source = ts.createSourceFile(
      file,
      Fs.readFileSync(file, "utf8"),
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

  return importedFiles;
}

function filterNodeModules(...files: string[]) {
  return files.filter((file) => file.includes("node_modules"));
}
