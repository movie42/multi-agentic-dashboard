"use client";

import { useEffect } from "react";
import { fileLabel } from "@/client/features/view-doc";
import { FileView } from "@/client/widgets/doc-panel";

interface FileWindowProps {
  file: string;
}

export function FileWindow({ file }: FileWindowProps) {
  useEffect(() => {
    document.title = fileLabel(file);
  }, [file]);
  return (
    <div className="flex h-screen flex-col">
      <FileView file={file} active root={null} className="min-h-0 flex-1" />
    </div>
  );
}
