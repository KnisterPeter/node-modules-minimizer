import Fs from "node:fs";
import Module from "node:module";
import ts from "typescript";
import type { File } from "./file.js";
import { resolveModule } from "./resolver.js";

export function createScanner(source: ts.SourceFile): Scanner {
  return new ScannerImpl(source);
}

interface DiagnosticEntry {
  file: string;
  message: string;
}

interface Scanner {
  files: readonly File[];
  diagnostics: readonly DiagnosticEntry[];
  run(): void;
}

export class ScannerImpl implements Scanner {
  #source: ts.SourceFile;

  #files = new Map<string, File>();
  #diagnostics = new Map<string, DiagnosticEntry>();

  public get diagnostics(): readonly DiagnosticEntry[] {
    return Array.from(this.#diagnostics.values());
  }

  public get files(): readonly File[] {
    return Array.from(this.#files.values());
  }

  constructor(source: ts.SourceFile) {
    this.#source = source;
  }

  public run(): void {
    this.visitNodeArray(this.#source.statements);
  }

  private visitNodeArray(nodes: ts.NodeArray<ts.Node>) {
    for (let i = 0, l = nodes.length; i < l; i++) {
      this.visitNode(nodes[i]);
    }
  }

  private visitNode(node: ts.Node) {
    switch (true) {
      case ts.isImportDeclaration(node): {
        this.visitImportDeclaration(node);
        break;
      }
      case ts.isExportDeclaration(node): {
        this.visitExportDeclaration(node);
        break;
      }
      case ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword: {
        this.visitDynamicImport(node);
        break;
      }
      case ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.escapedText === "require": {
        this.visitDynamicImport(node);
        break;
      }
      default:
        node.forEachChild((node) => this.visitNode(node));
        break;
    }
  }

  private visitImportDeclaration(node: ts.ImportDeclaration) {
    if (node.importClause?.isTypeOnly) return;

    this.addModuleToScan(node, node.moduleSpecifier);
  }

  private visitExportDeclaration(node: ts.ExportDeclaration) {
    if (!node.moduleSpecifier) return;

    this.addModuleToScan(node, node.moduleSpecifier);
  }

  private visitDynamicImport(node: ts.CallExpression) {
    this.addModuleToScan(node, node.arguments[0]);
  }

  private addModuleToScan(node: ts.Node, expression: ts.Expression) {
    if (!ts.isLiteralExpression(expression)) {
      // todo: allow more than one diagnostic per file
      if (!this.#diagnostics.has(this.#source.fileName)) {
        this.#diagnostics.set(this.#source.fileName, {
          file: this.#source.fileName,
          message: `Ignoring import of '${node.getText()}'. Only static import paths are supported.`,
        });
      }
      return;
    }

    // skipping build in modules
    if (Module.isBuiltin(expression.text)) return;

    const resolved = resolveModule(expression.text, this.#source.fileName, Fs);
    for (const file of resolved) {
      this.#files.set(file.path, file);
    }
  }
}
