import type { ReactNode } from "react";

export const metadata = { title: "Chowk", description: "Multiplayer city exploration (foundation build)" };
export default function RootLayout({ children }: { children: ReactNode }) {
  return (<html lang="en"><body>{children}</body></html>);
}
