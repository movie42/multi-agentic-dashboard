import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import type { SymbolLocation, SymbolLookup } from "./types";

const CONFIG_TTL_MS = 10_000;
const REFERENCE_LIMIT = 200;
const SNIPPET_AROUND = 3;

interface ServiceEntry {
  service: ts.LanguageService;
  fileNames: string[];
  options: ts.CompilerOptions;
  configReadAt: number;
}

const globalCache = globalThis as typeof globalThis & { __intentDiffServices?: Map<string, ServiceEntry> };
globalCache.__intentDiffServices ??= new Map();
const services = globalCache.__intentDiffServices;

function readConfig(root: string): { fileNames: string[]; options: ts.CompilerOptions } {
  const configPath = ts.findConfigFile(root, ts.sys.fileExists, "tsconfig.json");
  if (!configPath || !configPath.startsWith(root)) {
    return { fileNames: [], options: { allowJs: true, jsx: ts.JsxEmit.Preserve, target: ts.ScriptTarget.Latest } };
  }
  const { config } = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config, ts.sys, path.dirname(configPath));
  return { fileNames: parsed.fileNames, options: parsed.options };
}

/**
 * One TypeScript language service per checkout, reading files from disk with their mtime as the
 * version, so edits show up on the next lookup. The project file list is re-read every few
 * seconds to pick up new files.
 */
function serviceFor(root: string): ts.LanguageService {
  let entry = services.get(root);
  if (entry && Date.now() - entry.configReadAt < CONFIG_TTL_MS) return entry.service;
  const { fileNames, options } = readConfig(root);
  if (entry) {
    entry.fileNames = fileNames;
    entry.options = options;
    entry.configReadAt = Date.now();
    return entry.service;
  }
  const state: ServiceEntry = { fileNames, options, configReadAt: Date.now(), service: undefined as unknown as ts.LanguageService };
  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => state.fileNames,
    getScriptVersion: (file) => {
      try {
        return String(statSync(file).mtimeMs);
      } catch {
        return "0";
      }
    },
    getScriptSnapshot: (file) => (existsSync(file) ? ts.ScriptSnapshot.fromString(readFileSync(file, "utf8")) : undefined),
    getCurrentDirectory: () => root,
    getCompilationSettings: () => state.options,
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
  };
  state.service = ts.createLanguageService(host, ts.createDocumentRegistry());
  services.set(root, state);
  entry = state;
  return entry.service;
}

function locationOf(program: ts.Program, root: string, fileName: string, start: number): SymbolLocation | null {
  const sourceFile = program.getSourceFile(fileName);
  if (!sourceFile) return null;
  const { line } = sourceFile.getLineAndCharacterOfPosition(start);
  const lines = sourceFile.text.split("\n");
  const from = Math.max(0, line - SNIPPET_AROUND);
  const relative = path.relative(root, fileName).split(path.sep).join("/");
  const external = relative.startsWith("..") || relative.includes("node_modules/");
  return {
    file: external ? fileName.replace(/^.*node_modules\//, "") : relative,
    external,
    line: line + 1,
    text: lines[line]?.trim() ?? "",
    snippet: { startLine: from + 1, lines: lines.slice(from, line + SNIPPET_AROUND + 1) },
  };
}

function identifierAt(text: string, position: number): string {
  let start = position;
  while (start > 0 && /[\w$]/.test(text[start - 1])) start--;
  return text.slice(start).match(/^[\w$]+/)?.[0] ?? "";
}

/**
 * The service reads the files on disk. When the page shows a past commit, the clicked line is
 * found again on disk by its text, nearest to its old number.
 */
function lineOnDisk(diskLines: string[], line: number, shownText: string | null): number | null {
  if (shownText === null) return line <= diskLines.length ? line : null;
  let best: number | null = null;
  diskLines.forEach((text, index) => {
    if (text === shownText && (best === null || Math.abs(index + 1 - line) < Math.abs(best - line))) best = index + 1;
  });
  return best;
}

/**
 * Definition, signature and references of the identifier at a 1-based line and 0-based column.
 * `shownText` is the clicked line as the page shows it, given when that differs from disk.
 */
export function lookupSymbol(root: string, file: string, line: number, column: number, shownText: string | null): SymbolLookup {
  const service = serviceFor(root);
  const fileName = path.join(root, file);
  const program = service.getProgram();
  const sourceFile = program?.getSourceFile(fileName);
  if (!program || !sourceFile) throw new Error(`TypeScript 프로젝트에 없는 파일이에요: ${file}`);
  const diskLines = sourceFile.text.split("\n");
  const diskLine = lineOnDisk(diskLines, line, shownText);
  if (diskLine === null) throw new Error("이 줄은 지금 파일에 없어요. 그 뒤에 바뀌었거나 지워졌어요.");
  const position = sourceFile.getPositionOfLineAndCharacter(diskLine - 1, Math.min(column, diskLines[diskLine - 1].length));

  const info = service.getQuickInfoAtPosition(fileName, position);
  const definitions = (service.getDefinitionAtPosition(fileName, position) ?? [])
    .map((definition) => locationOf(program, root, definition.fileName, definition.textSpan.start))
    .filter((location): location is SymbolLocation => location !== null);

  const definitionKeys = new Set(definitions.map((location) => `${location.file}:${location.line}`));
  const references: SymbolLocation[] = [];
  let truncated = false;
  for (const group of service.findReferences(fileName, position) ?? []) {
    for (const reference of group.references) {
      if (reference.fileName.includes("node_modules")) continue;
      const location = locationOf(program, root, reference.fileName, reference.textSpan.start);
      if (!location || definitionKeys.has(`${location.file}:${location.line}`)) continue;
      if (references.length >= REFERENCE_LIMIT) {
        truncated = true;
        break;
      }
      references.push(location);
    }
  }
  references.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

  return {
    name: identifierAt(sourceFile.text, position),
    signature: info ? ts.displayPartsToString(info.displayParts) : null,
    definitions,
    references,
    truncated,
  };
}
