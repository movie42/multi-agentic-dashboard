export function relativeTo(root: string, file: string): string {
  if (file === root) return ".";
  return file.startsWith(root + "/") ? file.slice(root.length + 1) : file;
}

export function parentOf(file: string): string {
  return file.slice(0, file.lastIndexOf("/")) || "/";
}

export function baseName(file: string): string {
  return file.slice(file.lastIndexOf("/") + 1) || file;
}
