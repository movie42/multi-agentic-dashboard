import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agent Control",
  description: "Orca agent control board",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="min-h-full font-sans text-base leading-[1.75]">{children}</body>
    </html>
  );
}
