import type { ReactNode } from "react";

export const metadata = { title: "Chowk", description: "Multiplayer city exploration (foundation build)" };
export const viewport = { width: "device-width", initialScale: 1, themeColor: "#c2410c" };
export default function RootLayout({ children }: { children: ReactNode }) {
  return (<html lang="en"><body style={{ margin: 0, fontFamily: "system-ui, sans-serif" }}>{children}</body></html>);
}
