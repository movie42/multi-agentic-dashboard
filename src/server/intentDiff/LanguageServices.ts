import "server-only";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { LRUCache } from "lru-cache";
import ts from "typescript";
import type { SymbolLocation, SymbolLookup } from "@/common/intentDiff/types";

const REFERENCE_LIMIT = 200;
const SNIPPET_AROUND = 3;
const SNIPPET_MAX_LINES = 120;
const SERVICE_MAX = 8;

interface ProjectConfig {
  configPath: string | null;
  configMtimeMs: number;
  fileNames: string[];
  options: ts.CompilerOptions;
}

interface ServiceEntry {
  service: ts.LanguageService;
  state: { config: ProjectConfig };
}

function mtimeOf(file: string): number {
  return statSync(file, { throwIfNoEntry: false })?.mtimeMs ?? 0;
}

function findConfig(root: string): string | null {
  const configPath = ts.findConfigFile(root, ts.sys.fileExists, "tsconfig.json");
  return configPath && configPath.startsWith(root) ? configPath : null;
}

function readConfig(root: string): ProjectConfig {
  const configPath = findConfig(root);
  if (!configPath) {
    return {
      configPath: null,
      configMtimeMs: 0,
      fileNames: [],
      options: { allowJs: true, jsx: ts.JsxEmit.Preserve, target: ts.ScriptTarget.Latest },
    };
  }
  const { config } = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config, ts.sys, path.dirname(configPath));
  return { configPath, configMtimeMs: mtimeOf(configPath), fileNames: parsed.fileNames, options: parsed.options };
}

/** Callbacks and local statements are skipped so a reference shows the function it sits in, not one line of it. */
function isReadableUnit(node: ts.Node): boolean {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isEnumDeclaration(node) ||
    (ts.isVariableStatement(node) && ts.isSourceFile(node.parent))
  );
}

/** 0-based first and last line of the innermost declaration around `position`, or a few lines around it. */
function snippetRange(sourceFile: ts.SourceFile, position: number, line: number, lineCount: number): [number, number] {
  const innermost = (node: ts.Node, outer: ts.Node | null): ts.Node | null => {
    if (position < node.getStart(sourceFile) || position >= node.getEnd()) return null;
    const self = isReadableUnit(node) ? node : outer;
    return ts.forEachChild(node, (child) => innermost(child, self) ?? undefined) ?? self;
  };
  const found = ts.forEachChild(sourceFile, (child) => innermost(child, null) ?? undefined) ?? null;
  const around: [number, number] = [Math.max(0, line - SNIPPET_AROUND), Math.min(lineCount - 1, line + SNIPPET_AROUND)];
  if (!found) return around;
  const first = sourceFile.getLineAndCharacterOfPosition(found.getStart(sourceFile)).line;
  const last = sourceFile.getLineAndCharacterOfPosition(found.getEnd()).line;
  if (last - first + 1 <= SNIPPET_MAX_LINES) return [first, last];
  const half = Math.floor(SNIPPET_MAX_LINES / 2);
  const from = Math.max(first, Math.min(line - half, last - SNIPPET_MAX_LINES + 1));
  return [from, from + SNIPPET_MAX_LINES - 1];
}

function locationOf(program: ts.Program, root: string, fileName: string, start: number): SymbolLocation | null {
  const sourceFile = program.getSourceFile(fileName);
  if (!sourceFile) return null;
  const { line } = sourceFile.getLineAndCharacterOfPosition(start);
  const lines = sourceFile.text.split("\n");
  const [from, to] = snippetRange(sourceFile, start, line, lines.length);
  const relative = path.relative(root, fileName).split(path.sep).join("/");
  const external = relative.startsWith("..") || relative.includes("node_modules/");
  return {
    file: external ? fileName.replace(/^.*node_modules\//, "") : relative,
    external,
    line: line + 1,
    text: lines[line]?.trim() ?? "",
    snippet: { startLine: from + 1, lines: lines.slice(from, to + 1) },
  };
}

export function identifierAt(text: string, position: number): string {
  // eslint-disable-next-line no-restricted-syntax -- identifier scan from a position
  let start = position;
  while (start > 0 && /[\w$]/.test(text[start - 1] ?? "")) start--;
  return text.slice(start).match(/^[\w$]+/)?.[0] ?? "";
}

export function lineOnDisk(diskLines: string[], line: number, shownText: string | null): number | null {
  if (shownText === null) return line <= diskLines.length ? line : null;
  return diskLines.reduce<number | null>(
    (best, text, index) =>
      text === shownText && (best === null || Math.abs(index + 1 - line) < Math.abs(best - line)) ? index + 1 : best,
    null,
  );
}

export class LanguageServices {
  private readonly entries: LRUCache<string, ServiceEntry>;

  constructor(max: number = SERVICE_MAX) {
    this.entries = new LRUCache({ max, dispose: (entry) => entry.service.dispose() });
  }

  lookup(root: string, file: string, line: number, column: number, shownText: string | null): SymbolLookup {
    const fileName = path.join(root, file);
    const service = this.serviceFor(root, fileName);
    const program = service.getProgram();
    const sourceFile = program?.getSourceFile(fileName);
    if (!program || !sourceFile) throw new Error(`TypeScript 프로젝트에 없는 파일이에요: ${file}`);
    const diskLines = sourceFile.text.split("\n");
    const diskLine = lineOnDisk(diskLines, line, shownText);
    if (diskLine === null) throw new Error("이 줄은 지금 파일에 없어요. 그 뒤에 바뀌었거나 지워졌어요.");
    const position = sourceFile.getPositionOfLineAndCharacter(diskLine - 1, Math.min(column, diskLines[diskLine - 1]?.length ?? 0));

    const info = service.getQuickInfoAtPosition(fileName, position);
    const definitions = (service.getDefinitionAtPosition(fileName, position) ?? [])
      .map((definition) => locationOf(program, root, definition.fileName, definition.textSpan.start))
      .filter((location): location is SymbolLocation => location !== null);

    const definitionKeys = new Set(definitions.map((location) => `${location.file}:${location.line}`));
    const candidates = (service.findReferences(fileName, position) ?? [])
      .flatMap((group) => group.references)
      .filter((reference) => !reference.fileName.includes("node_modules"))
      .map((reference) => locationOf(program, root, reference.fileName, reference.textSpan.start))
      .filter((location): location is SymbolLocation => location !== null && !definitionKeys.has(`${location.file}:${location.line}`));
    const references = candidates
      .slice(0, REFERENCE_LIMIT)
      .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

    return {
      name: identifierAt(sourceFile.text, position),
      signature: info ? ts.displayPartsToString(info.displayParts) : null,
      definitions,
      references,
      truncated: candidates.length > REFERENCE_LIMIT,
    };
  }

  private serviceFor(root: string, fileName: string): ts.LanguageService {
    const entry = this.entries.get(root);
    if (!entry) return this.create(root);
    const configPath = findConfig(root);
    const { config } = entry.state;
    const configChanged = configPath !== config.configPath || (configPath !== null && mtimeOf(configPath) !== config.configMtimeMs);
    const newFile = !config.fileNames.includes(fileName) && existsSync(fileName);
    if (configChanged || newFile) entry.state.config = readConfig(root);
    return entry.service;
  }

  private create(root: string): ts.LanguageService {
    const state = { config: readConfig(root) };
    const service = ts.createLanguageService(this.host(root, () => state.config), ts.createDocumentRegistry());
    this.entries.set(root, { service, state });
    return service;
  }

  private host(root: string, config: () => ProjectConfig): ts.LanguageServiceHost {
    return {
      getScriptFileNames: () => config().fileNames,
      getScriptVersion: (file) => String(mtimeOf(file)),
      getScriptSnapshot: (file) => (existsSync(file) ? ts.ScriptSnapshot.fromString(readFileSync(file, "utf8")) : undefined),
      getCurrentDirectory: () => root,
      getCompilationSettings: () => config().options,
      getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
      fileExists: ts.sys.fileExists,
      readFile: ts.sys.readFile,
      readDirectory: ts.sys.readDirectory,
      directoryExists: ts.sys.directoryExists,
      getDirectories: ts.sys.getDirectories,
    };
  }
}
