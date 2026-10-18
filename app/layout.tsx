import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "TUH Quality Fair Conference Management",
  description: "TUH Quality Fair Conference Management",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
