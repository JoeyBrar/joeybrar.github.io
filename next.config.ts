import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // GitHub Pages only serves static files, so build to a static `out/`
  // directory instead of running a Next.js server.
  output: "export",
};

export default nextConfig;
