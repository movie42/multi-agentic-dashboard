interface GlyphProps {
  children: React.ReactNode;
  className?: string;
}

function Glyph({ children, className = "text-muted" }: GlyphProps) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className={`size-4 shrink-0 fill-none stroke-current ${className}`} strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

const PAGE = "M4 1.5h5L12.5 5v8.5a1 1 0 0 1-1 1h-7.5a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1z";

const CODE: ReadonlySet<string> = new Set(["ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "go", "rs", "java", "kt", "swift", "rb", "php", "c", "h", "cpp", "sh", "zsh", "css", "scss", "html"]);
const DATA: ReadonlySet<string> = new Set(["json", "yaml", "yml", "toml", "lock", "xml", "csv", "env"]);
const IMAGE: ReadonlySet<string> = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "avif"]);
const TEXT: ReadonlySet<string> = new Set(["md", "markdown", "txt", "log", "mdx"]);

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? (name.startsWith(".") ? name.slice(1).toLowerCase() : "") : name.slice(dot + 1).toLowerCase();
}

interface FolderIconProps {
  open: boolean;
}

export function FolderIcon({ open }: FolderIconProps) {
  return (
    <Glyph className="text-fg">
      {open ? (
        <path d="M1.5 4a1 1 0 0 1 1-1H6l1.3 1.5H12a1 1 0 0 1 1 1V7M1.5 4v8.5h10.3l2.7-5.5H4.2L1.5 12.5" />
      ) : (
        <path d="M1.5 4a1 1 0 0 1 1-1H6l1.3 1.5h6.2a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z" />
      )}
    </Glyph>
  );
}

interface FileIconProps {
  name: string;
}

/** One glyph per kind of file — code, data, image, text — like the explorer in VS Code. */
export function FileIcon({ name }: FileIconProps) {
  const extension = extensionOf(name);
  if (IMAGE.has(extension)) {
    return (
      <Glyph>
        <rect x="2" y="2.5" width="12" height="11" rx="1" />
        <circle cx="5.5" cy="6" r="1.2" />
        <path d="m2.5 12 3.5-3.5 2.5 2.5 2-2 3 3" />
      </Glyph>
    );
  }
  if (CODE.has(extension)) {
    return (
      <Glyph className="text-now">
        <path d="M5.5 4.5 2 8l3.5 3.5M10.5 4.5 14 8l-3.5 3.5" />
      </Glyph>
    );
  }
  if (DATA.has(extension) || name.startsWith(".")) {
    return (
      <Glyph className="text-ask">
        <path d="M6 2.5c-1.5 0-2 .7-2 2v1.6c0 .9-.5 1.4-1.5 1.9 1 .5 1.5 1 1.5 1.9v1.6c0 1.3.5 2 2 2M10 2.5c1.5 0 2 .7 2 2v1.6c0 .9.5 1.4 1.5 1.9-1 .5-1.5 1-1.5 1.9v1.6c0 1.3-.5 2-2 2" />
      </Glyph>
    );
  }
  return (
    <Glyph>
      <path d={PAGE} />
      {TEXT.has(extension) && <path d="M5.5 8h5M5.5 10.5h3.5" />}
    </Glyph>
  );
}
