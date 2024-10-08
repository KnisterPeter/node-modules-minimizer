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

export class ResolutionError extends Error {}
export class OptionalResolutionError extends Error {}

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

    const [, pkg] = readPackageJson(path, this.fs);
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
    throw new ResolutionError(
      `Cannot find package '${this.moduleId}' from '${this.source}'`,
    );
  }

  private optionalResolutionError(): never {
    throw new ResolutionError(
      `Cannot find package '${this.moduleId}' from '${this.source}'. But it's not listed in dependencies or peerDependencies`,
    );
  }

  private resolvePackage(): File[] {
    const files: File[] = [];

    const findInNodeModules = (moduleId: string, dir: string): string => {
      let path = Path.join(dir, "node_modules", moduleId);
      while (true) {
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
        path = parent;
      }
    };

    const moduleMatches = this.moduleId.match(
      /^(?<package>(?:@[^/]+\/[^/]+|[^/]+))(?:\/(?<path>.*))?/,
    );
    if (!moduleMatches?.groups?.package) this.resolutionError();
    const importPackageName = moduleMatches.groups.package;
    const importPackageSubpath: string | undefined = moduleMatches.groups.path;
    const importPackagePath = findInNodeModules(
      importPackageName,
      Path.dirname(this.source),
    );

    let file: File | undefined;

    let [path, packageJson] = readPackageJson(importPackagePath, this.fs);
    if (path && packageJson && typeof packageJson == "object") {
      files.push({ path, isFile: false });

      if (hasKey(packageJson, "exports")) {
        file = this.resolveExportMap(
          importPackagePath,
          packageJson.exports,
          importPackageSubpath,
        );
        if (file) {
          files.push(file);
          return files;
        }
      } else if (importPackageSubpath) {
        path = Path.join(importPackagePath, importPackageSubpath);
      } else if (
        hasKey(packageJson, "module") &&
        typeof packageJson.module === "string"
      ) {
        path = Path.join(importPackagePath, packageJson.module);
      } else if (
        hasKey(packageJson, "main") &&
        typeof packageJson.main === "string"
      ) {
        path = Path.join(importPackagePath, packageJson.main);
      } else {
        path = Path.join(importPackagePath, "index.js");
      }

      if (path) {
        file = this.resolveFile(path, importPackagePath);
        if (file) {
          files.push(file);
          return files;
        }
      }
    }

    const [, sourcePackage] = readPackageJson(this.source, this.fs);
    if (sourcePackage) {
      const isRequiredDependency =
        hasKey(sourcePackage, "dependencies") &&
        hasKey(sourcePackage.dependencies, importPackageName);
      const isPeerDependency =
        hasKey(sourcePackage, "peerDependencies") &&
        hasKey(sourcePackage.peerDependencies, importPackageName);

      if (!isRequiredDependency && !isPeerDependency) {
        this.optionalResolutionError();
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

function readPackageJson(
  path: string,
  fs: FileSystem,
): [path: string | undefined, packageJson: unknown] {
  let directory = path;
  let stat = statPath(directory, fs);
  if (stat?.isFile()) directory = Path.dirname(directory);

  while (true) {
    const packageJsonPath = Path.join(directory, "package.json");
    if (hasFile(packageJsonPath, fs)) {
      return [
        packageJsonPath,
        JSON.parse(fs.readFileSync(packageJsonPath, "utf8")),
      ];
    }
    const parent = Path.dirname(directory);
    if (parent === directory) return [undefined, undefined];
    directory = parent;
  }
}

function hasKey<Key extends string>(
  obj: unknown,
  key: Key,
): obj is Record<string, unknown> & Record<Key, unknown> {
  return Boolean(typeof obj === "object" && obj && key in obj);
}
