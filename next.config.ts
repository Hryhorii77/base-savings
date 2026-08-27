import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @base-org/account's Node build eagerly pulls in @coinbase/cdp-sdk's x402/Solana
  // payment code (a feature we don't use — only wallet connect) which references
  // optional @x402/* sub-packages we don't have installed. Marking these external
  // skips Turbopack's static resolution of that internal module graph; Node only
  // resolves those imports at runtime if that code path is actually invoked, which
  // it isn't here.
  serverExternalPackages: ["@base-org/account", "@coinbase/cdp-sdk"],
};

export default nextConfig;
