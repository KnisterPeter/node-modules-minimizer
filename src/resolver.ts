import Path from "node:path";
import type { File } from "./file.js";

interface FileSystem {
  lstatSync(path: string): {
    isSymbolicLink(): boolean;
    isFile(): boolean;
    isDirectory(): boolean;
  };
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

  private calculateResolverMode(path: string): "module" | "commonjs" {
    const isModule = [".mjs", ".mts"].some((ext) => path.endsWith(ext));
    if (isModule) return "module";
    const isCommonJs = [".cjs", ".cts"].some((ext) => path.endsWith(ext));
    if (isCommonJs) return "commonjs";

    const pkg = readPackageJson(path, this.fs);
    return pkg &&
      typeof pkg === "object" &&
      "type" in pkg &&
      pkg?.type === "module"
      ? "module"
      : "commonjs";
  }

  public run(): File[] {
    const requiredFiles: File[] = [];

    if (this.moduleId.startsWith(".") || this.moduleId.startsWith("/")) {
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
        if (stat) return path;
      }

      const parent = Path.dirname(dir);
      if (parent === dir) this.resolutionError();
      return findInNodeModules(moduleId, parent);
    };

    const moduleMatches = this.moduleId.match(
      /^(?<package>(?:@[^/]+\/[^/]+|[^/]+))(?:\/(?<path>.*))?/,
    );
    if (!moduleMatches?.groups?.package) this.resolutionError();
    const packageImportName = moduleMatches.groups.package;
    const packageImportPath: string | undefined = moduleMatches.groups.path;
    const packagePath = findInNodeModules(
      packageImportName,
      Path.dirname(this.source),
    );

    let file: File | undefined;

    let path = Path.join(packagePath, "package.json");
    if (hasFile(path, this.fs)) {
      files.push({ path, isFile: false });
      const packageJson = JSON.parse(
        this.fs.readFileSync(path, "utf8"),
      ) as unknown;

      if (!packageJson || typeof packageJson !== "object")
        this.resolutionError();

      if ("exports" in packageJson) {
        file = this.resolveExportMap(
          packagePath,
          packageJson.exports,
          packageImportPath,
        );
        if (file) {
          files.push(file);
          return files;
        }
      } else if (packageImportPath) {
        path = Path.join(packagePath, packageImportPath);
      } else if (
        "module" in packageJson &&
        typeof packageJson.module === "string"
      ) {
        path = Path.join(packagePath, packageJson.module);
      } else if (
        "main" in packageJson &&
        typeof packageJson.main === "string"
      ) {
        path = Path.join(packagePath, packageJson.main);
      } else {
        path = Path.join(packagePath, "index.js");
      }

      if (path) {
        file = this.resolveFile(path, packagePath);
        if (file) {
          files.push(file);
          return files;
        }
      }
    }

    this.resolutionError();
  }

  private resolveExportMap(
    packagePath: string,
    exportMap: unknown,
    packageImportPath: string | undefined,
  ): File | undefined {
    let toResolve: unknown = exportMap;

    if (typeof toResolve === "object" && toResolve) {
      const importPath = packageImportPath ? `./${packageImportPath}` : ".";
      if (importPath in toResolve) {
        toResolve = (toResolve as Record<string, unknown>)[importPath];
      }
    }

    if (typeof toResolve === "object" && toResolve) {
      for (const [k, v] of Object.entries(
        toResolve as Record<string, unknown>,
      )) {
        if (k === "default") {
          toResolve = (toResolve as Record<string, unknown>)["default"];
          break;
        } else if (k === "import") {
          toResolve = (toResolve as Record<string, unknown>)["import"];
          break;
        }
      }
    }

    if (typeof toResolve === "string") {
      return this.resolveFile(toResolve, packagePath);
    }
  }

  private resolveModule(): File {
    const file = this.resolveFile(this.moduleId, Path.dirname(this.source));
    if (file) return file;
    this.resolutionError();
  }

  private resolveFile(moduleId: string, base: string): File | undefined {
    let path = moduleId.startsWith("/") ? moduleId : Path.join(base, moduleId);
    for (const ext of ["", ".js"]) {
      let testPath = path + ext;
      const stat = statPath(testPath, this.fs);
      if (stat?.isFile()) {
        return {
          path: this.fs.realpathSync(Path.resolve(testPath)),
          isFile: true,
        };
      } else if (stat?.isDirectory()) {
        testPath = Path.join(testPath, "index.js");
        if (hasFile(testPath, this.fs)) {
          return {
            path: this.fs.realpathSync(Path.resolve(testPath)),
            isFile: true,
          };
        }
      }
    }

    if (this.source.endsWith(".ts")) {
      const tsModuleId = moduleId.replace(/\.js$/, ".ts");
      path = tsModuleId.startsWith("/")
        ? tsModuleId
        : Path.join(base, tsModuleId);
      if (hasFile(path, this.fs)) {
        return { path: this.fs.realpathSync(Path.resolve(path)), isFile: true };
      }
    }
  }
}

function statPath(path: string, fs: FileSystem) {
  try {
    return fs.lstatSync(path);
  } catch {
    return;
  }
}

function hasFile(path: string, fs: FileSystem) {
  return Boolean(statPath(path, fs));
}

function readPackageJson(path: string, fs: FileSystem): unknown {
  let directory = path;
  let stat = statPath(directory, fs);
  if (stat?.isFile()) {
    directory = Path.dirname(directory);
  }
  while (true) {
    const packageJsonPath = Path.join(directory, "package.json");
    if (hasFile(packageJsonPath, fs)) {
      return JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    }
    const parent = Path.dirname(directory);
    if (parent === directory) return;
    directory = parent;
  }
}
