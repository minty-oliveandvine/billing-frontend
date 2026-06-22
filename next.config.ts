import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** Slightly smaller responses; security-through-obscurity only. */
  poweredByHeader: false,
};

export default nextConfig;
