import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      // Set the root directory explicitly to avoid lockfile conflicts
      root: process.cwd()
    }
  }
};

export default nextConfig;
