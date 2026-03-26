import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["stockfish"],
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb"
    }
  }
};

export default nextConfig;
