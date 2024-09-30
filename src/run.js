// @ts-check

import Fs from "node:fs";
import Path from "node:path";
import sade from "sade";
import pkg from "../package.json" with { type: "json" };
import { findUnusedFilesInNodeModules, getImportedFiles } from "./index.ts";

sade(`${pkg.name} <entrypoints..>`)
  .version(pkg.version)
  .option("--list", "List unused files", false)
  .option("--json", "List unused files as JSON", false)
  .option("--rm", "Delete unused files", false)
  .action(async (entrypoint, opts) => {
    const allEntrypoints = [entrypoint, ...opts._];
    const importedFiles = getImportedFiles(...allEntrypoints);
    const unusedFiles = findUnusedFilesInNodeModules(...importedFiles);

    if (opts.list) {
      for (const file of unusedFiles) {
        console.log("-", Path.relative(process.cwd(), file));
      }
    }
    if (opts.json) {
      console.log(
        JSON.stringify(
          unusedFiles.map((file) => Path.relative(process.cwd(), file)),
        ),
      );
    }
    if (opts.rm) {
      for (const file of unusedFiles) {
        Fs.rmSync(file, { force: true, recursive: true });
      }
    }
  })
  .parse(process.argv);
