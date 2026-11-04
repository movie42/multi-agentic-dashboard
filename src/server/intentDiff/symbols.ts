import path from "node:path";
import ts from "typescript";
import type { FileText } from "@/server/intentDiff/Highlighter";
import { resolveImport } from "@/server/intentDiff/order";
import type { DiffLine, FileDiff, SymbolKind } from "@/common/intentDiff/types";

const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const API_PATH = /\/api\/[\w\-./[\]]+/g;

export interface CodeSymbol {
  id: string;
  name: string;
  kind: SymbolKind;
  file: string;
  isDefault: boolean;
  startLine: number;
  endLine: number;
  /** End-side line numbers inside this symbol that were added, plus anchors of removed lines. */
  changedLines: number[];
  node: ts.Node;
  sourceFile: ts.SourceFile;
}

export interface CallEdge {
  from: string;
  to: string;
  line: number;
  text: string;
}

function scriptKind(file: string): ts.ScriptKind {
  if (file.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (file.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (/\.(js|mjs|cjs)$/.test(file)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function lineOf(sourceFile: ts.SourceFile, position: number): number {
  return sourceFile.getLineAndCharacterOfPosition(position).line + 1;
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === kind);
}

function callableKind(name: string, file: string): SymbolKind {
  return /^[A-Z]/.test(name) && /\.[jt]sx$/.test(file) ? "component" : "function";
}

/** End-side lines a file's diff touched: added lines, and the line each removed run sits before. */
export function changedLinesOf(diff: FileDiff): Set<number> {
  const changed = new Set<number>();
  for (const hunk of diff.hunks) {
    let pendingDelete = false;
    let lastNew = hunk.newStart - 1;
    for (const line of hunk.lines) {
      if (line.kind === "del") {
        pendingDelete = true;
        continue;
      }
      if (line.newNo !== null) {
        if (line.kind === "add" || pendingDelete) changed.add(line.newNo);
        lastNew = line.newNo;
      }
      pendingDelete = false;
    }
    if (pendingDelete) changed.add(lastNew + 1);
  }
  return changed;
}

function declarationsOf(sourceFile: ts.SourceFile, file: string): Omit<CodeSymbol, "id" | "changedLines">[] {
  const found: Omit<CodeSymbol, "id" | "changedLines">[] = [];
  const add = (name: string, kind: SymbolKind, node: ts.Node, isDefault: boolean) =>
    found.push({
      name,
      kind,
      file,
      isDefault,
      node,
      sourceFile,
      startLine: lineOf(sourceFile, node.getStart(sourceFile, true)),
      endLine: lineOf(sourceFile, node.getEnd()),
    });
  for (const statement of sourceFile.statements) {
    const isDefault = hasModifier(statement, ts.SyntaxKind.DefaultKeyword);
    if (ts.isFunctionDeclaration(statement)) {
      const name = statement.name?.text ?? "default";
      add(name, callableKind(name, file), statement, isDefault);
    } else if (ts.isClassDeclaration(statement)) {
      add(statement.name?.text ?? "default", "function", statement, isDefault);
    } else if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement) || ts.isEnumDeclaration(statement)) {
      add(statement.name.text, "type", statement, false);
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) continue;
        const name = declaration.name.text;
        const init = declaration.initializer;
        const callable = init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init));
        add(name, callable ? callableKind(name, file) : "value", statement.declarationList.declarations.length === 1 ? statement : declaration, false);
      }
    } else if (ts.isExportAssignment(statement)) {
      add("default", "value", statement, true);
    }
  }
  return found;
}

export interface SymbolIndex {
  symbols: CodeSymbol[];
  edges: CallEdge[];
}

/**
 * Top-level declarations of the changed source files that the diff touched, and the links
 * between them: a call, a JSX tag or any other reference by name, resolved through the file's
 * own declarations and its imports, plus `"/api/…"` strings that name a changed route handler.
 */
export function indexSymbols(files: FileDiff[], texts: Map<string, FileText>): SymbolIndex {
  const changedFiles = new Set(files.map((file) => file.file));
  const parsed = new Map<string, ts.SourceFile>();
  const symbols: CodeSymbol[] = [];

  for (const diff of files) {
    const text = texts.get(diff.file);
    if (!SOURCE.test(diff.file) || !text) continue;
    const sourceFile = ts.createSourceFile(diff.file, text.lines.join("\n"), ts.ScriptTarget.Latest, true, scriptKind(diff.file));
    parsed.set(diff.file, sourceFile);
    const changed = changedLinesOf(diff);
    for (const declaration of declarationsOf(sourceFile, diff.file)) {
      const lines = [...changed].filter((line) => line >= declaration.startLine && line <= declaration.endLine);
      if (lines.length === 0) continue;
      symbols.push({ ...declaration, id: `${diff.file}#${declaration.name}@${declaration.startLine}`, changedLines: lines.sort((a, b) => a - b) });
    }
  }

  const byFile = new Map<string, CodeSymbol[]>();
  for (const symbol of symbols) byFile.set(symbol.file, [...(byFile.get(symbol.file) ?? []), symbol]);

  const edges: CallEdge[] = [];
  for (const [file, sourceFile] of parsed) {
    const imported = new Map<string, { file: string; name: string }>();
    for (const statement of sourceFile.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const target = resolveImport(file, statement.moduleSpecifier.text, changedFiles);
      const clause = statement.importClause;
      if (!target || !clause) continue;
      if (clause.name) imported.set(clause.name.text, { file: target, name: "default" });
      if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const element of clause.namedBindings.elements) {
          imported.set(element.name.text, { file: target, name: (element.propertyName ?? element.name).text });
        }
      }
    }

    const resolveName = (name: string): CodeSymbol | undefined => {
      const local = byFile.get(file)?.find((symbol) => symbol.name === name);
      if (local) return local;
      const source = imported.get(name);
      if (!source) return undefined;
      return byFile.get(source.file)?.find((symbol) => (source.name === "default" ? symbol.isDefault : symbol.name === source.name));
    };

    for (const from of byFile.get(file) ?? []) {
      if (from.kind === "type") continue;
      const seen = new Set<string>();
      const link = (to: CodeSymbol, position: number) => {
        if (to.id === from.id || to.kind === "type" || seen.has(to.id)) return;
        seen.add(to.id);
        const line = lineOf(sourceFile, position);
        edges.push({ from: from.id, to: to.id, line, text: sourceFile.text.split("\n")[line - 1]?.trim() ?? "" });
      };
      const visit = (node: ts.Node) => {
        if (ts.isIdentifier(node)) {
          const parent = node.parent;
          const isPropertyName = ts.isPropertyAccessExpression(parent) && parent.name === node;
          const isDeclarationName = (ts.isVariableDeclaration(parent) || ts.isFunctionDeclaration(parent) || ts.isParameter(parent)) && parent.name === node;
          const target = !isPropertyName && !isDeclarationName ? resolveName(node.text) : undefined;
          if (target) link(target, node.getStart(sourceFile));
        } else if (ts.isStringLiteralLike(node)) {
          for (const match of node.text.matchAll(API_PATH)) {
            const route = [...changedFiles].find((candidate) =>
              new RegExp(`(^|/)app${match[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/route\\.[jt]s$`).test(candidate),
            );
            for (const handler of (route ? byFile.get(route) : undefined) ?? []) {
              if (handler.kind !== "type") link(handler, node.getStart(sourceFile));
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      ts.forEachChild(from.node, visit);
    }
  }
  return { symbols, edges };
}

/** The symbol's end-side code with removed lines put back where they were, for reading in place. */
export function symbolLines(symbol: CodeSymbol, diff: FileDiff, text: FileText): DiffLine[] {
  const added = new Set<number>();
  const removedBefore = new Map<number, DiffLine[]>();
  for (const hunk of diff.hunks) {
    let pending: DiffLine[] = [];
    let lastNew = hunk.newStart - 1;
    for (const line of hunk.lines) {
      if (line.kind === "del") {
        pending.push(line);
        continue;
      }
      if (line.newNo !== null) {
        if (line.kind === "add") added.add(line.newNo);
        if (pending.length > 0) removedBefore.set(line.newNo, pending);
        lastNew = line.newNo;
      }
      pending = [];
    }
    if (pending.length > 0) removedBefore.set(lastNew + 1, pending);
  }
  const lines: DiffLine[] = [];
  for (let newNo = symbol.startLine; newNo <= symbol.endLine; newNo++) {
    lines.push(...(removedBefore.get(newNo) ?? []));
    lines.push({
      kind: added.has(newNo) ? "add" : "ctx",
      text: text.lines[newNo - 1] ?? "",
      oldNo: null,
      newNo,
      html: text.html[newNo - 1],
    });
  }
  return lines;
}

export function baseName(file: string): string {
  return path.posix.basename(file);
}
