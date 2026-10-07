import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep browser-test output separate from an already running local dev server.
  distDir: process.env.BLOGHUB_TEST_BUILD === "1" ? ".next-test" : ".next",
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
