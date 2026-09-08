import { NextResponse, type NextRequest } from "next/server";

// Kept server-only (no NEXT_PUBLIC_ prefix) so the actual endpoint — and any
// access token in it, e.g. a personal PublicNode token — never ships to the
// browser. Client-side code (app/wagmi.ts, lib/protocols/*.ts) always points
// at this same-origin route instead, via BASE_RPC_URL in lib/config.ts.
const UPSTREAM_BASE_RPC_URL = process.env.UPSTREAM_BASE_RPC_URL || "https://base-rpc.publicnode.com";

// Plain pass-through: forwards the raw JSON-RPC request body (single or
// batched) to the real upstream and returns its response body verbatim, so
// this never needs to know or care about which JSON-RPC method was called.
export async function POST(request: NextRequest) {
  const body = await request.text();

  const upstreamResponse = await fetch(UPSTREAM_BASE_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  const responseBody = await upstreamResponse.text();
  return new NextResponse(responseBody, {
    status: upstreamResponse.status,
    headers: { "Content-Type": "application/json" },
  });
}
