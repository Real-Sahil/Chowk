import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const config: NextConfig = {
  // Monorepo: trace server files from the repo root so workspace packages are bundled correctly on Vercel.
  outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
  // Workspace packages are consumed as TypeScript source.
  transpilePackages: ["@chowk/contracts", "@chowk/db", "@chowk/ports"],
  serverExternalPackages: ["pg", "@neondatabase/serverless"],
  poweredByHeader: false,
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
      ],
    }];
  },
};
export default config;
