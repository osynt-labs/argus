import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"],
  },
};

export default nextConfig;
