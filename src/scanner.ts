import Module from "node:module";
import NodeUrl from "node:url";
import ts from "typescript";

export function createScanner(source: ts.SourceFile): Scanner {
  return new ScannerImpl(source);
}

interface DiagnosticEntry {
  file: string;
  message: string;
}

interface Scanner {
  files: readonly string[];
  diagnostics: readonly DiagnosticEntry[];
  run(): void;
}

export class ScannerImpl implements Scanner {
  #source: ts.SourceFile;
  #imported: Set<string> = new Set<string>();
  #diagnostics: DiagnosticEntry[] = [];

  public get diagnostics(): readonly DiagnosticEntry[] {
    return [...this.#diagnostics];
  }

  public get files(): readonly string[] {
    return Array.from(this.#imported);
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
    for (let i = 0, l = node.arguments.length; i < l; i++) {
      const argument = node.arguments[i];
      this.addModuleToScan(node, argument);
    }
  }

  private addModuleToScan(node: ts.Node, expression: ts.Expression) {
    if (!ts.isLiteralExpression(expression)) {
      if (
        !this.#diagnostics.some(({ file }) => file === this.#source.fileName)
      ) {
        this.#diagnostics.push({
          file: this.#source.fileName,
          message: `Ignoring import of '${node.getText()}'. Only static import paths are supported.`,
        });
      }
      return;
    }

    // skipping build in modules
    if (Module.isBuiltin(expression.text)) return;

    const moduleUrl = import.meta.resolve(
      expression.text,
      NodeUrl.pathToFileURL(this.#source.fileName).toString(),
    );
    const file = NodeUrl.fileURLToPath(moduleUrl);
    this.#imported.add(file);
  }
}
