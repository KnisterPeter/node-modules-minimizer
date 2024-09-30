import type { readFileSync as readFileSyncNode } from "node:fs";
import Path from "node:path";
import type { File } from "./file.js";

interface FileSystem {
  lstatSync(path: string): { isSymbolicLink(): boolean };
  realpathSync(path: string): string;
  readFileSync(path: string, encoding: "utf8"): string;
}

export function resolveModule(
  moduleId: string,
  source: string,
  fs: FileSystem,
): File[] {
  const resolved = new ResolverImpl(moduleId, Path.resolve(source), fs).run();
  return resolved;
}

interface Resolver {
  run(): File[];
}

class ResolverImpl implements Resolver {
  private moduleId: string;
  private source: string;

  private fs: FileSystem;

  constructor(moduleId: string, source: string, fs: FileSystem) {
    this.moduleId = moduleId;
    this.source = source;
    this.fs = fs;
  }

  public run(): File[] {
    const requiredFiles: File[] = [];

    if (this.moduleId.startsWith(".")) {
      requiredFiles.push(this.resolveModule());
    } else {
      requiredFiles.push(...this.resolvePackage());
    }

    if (requiredFiles.length === 0) this.resolutionError();
    return requiredFiles;
  }

  private resolutionError(): never {
    throw new Error(
      `Cannot find package '${this.moduleId}' from '${this.source}'`,
    );
  }

  private resolvePackage(): File[] {
    const files: File[] = [];

    const findInNodeModules = (moduleId: string, dir: string) => {
      let path = Path.join(dir, "node_modules", moduleId);
      let stat = statPath(path, this.fs);
      if (stat) {
        if (stat.isSymbolicLink()) {
          files.push({ path, isFile: false });
          path = this.fs.realpathSync(path);
          stat = statPath(path, this.fs);
        }
        if (stat) {
          return path;
        }
      }

      const parent = Path.dirname(dir);
      if (parent === dir) this.resolutionError();
      return findInNodeModules(moduleId, parent);
    };

    const moduleMatches = this.moduleId.match(
      /^(?<package>(?:@[^/]+\/[^/]+|[^/]+))(?:\/(?<path>.*))?/,
    );
    if (!moduleMatches?.groups?.package) this.resolutionError();
    const packagePath = findInNodeModules(
      moduleMatches?.groups?.package,
      Path.dirname(this.source),
    );

    let path = Path.join(packagePath, "index.js");
    let stat = statPath(path, this.fs);
    if (stat) {
      files.push({ path, isFile: true });
      return files;
    }

    path = Path.join(packagePath, "package.json");
    stat = statPath(path, this.fs);
    if (stat) {
      files.push({ path, isFile: false });
      const packageJson = JSON.parse(this.fs.readFileSync(path, "utf8"));

      if (packageJson.exports) {
        let importSubpath: string;
        if (moduleMatches.groups?.path) {
          importSubpath = `./${moduleMatches.groups.path}`;
        } else {
          importSubpath = ".";
        }

        const exports = packageJson.exports[importSubpath];
        if (typeof exports === "string") {
          path = Path.join(packagePath, exports);
        } else {
          path = Path.join(packagePath, exports.import.default);
        }
        files.push({ path, isFile: true });
        return files;
      }

      if (packageJson.main) {
        path = Path.join(packagePath, packageJson.main);
        files.push({ path, isFile: true });
        return files;
      }
    }

    this.resolutionError();
  }

  private resolveModule(): File {
    const base = Path.dirname(this.source);

    let path = Path.join(base, this.moduleId);
    let stat = statPath(path, this.fs);
    if (stat) {
      return {
        path: Path.resolve(path),
        isFile: true,
      };
    }

    if (this.source.endsWith(".ts")) {
      path = Path.join(base, `${Path.basename(this.moduleId, ".js")}.ts`);
      stat = statPath(path, this.fs);
      if (stat) {
        return { path: Path.resolve(path), isFile: true };
      }
    }

    this.resolutionError();
  }
}

function statPath(path: string, fs: FileSystem) {
  try {
    return fs.lstatSync(path);
  } catch {
    return;
  }
}
