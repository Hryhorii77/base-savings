import { aaveAdapter } from "./aave";
import { compoundAdapter } from "./compound";
import { moonwellAdapter } from "./moonwell";
import { morphoAdapter } from "./morpho";
import type { ProtocolAdapter } from "./types";

// Single source of truth for which protocols the app supports, in display
// order. Adding a protocol later is one new adapter file + one entry here —
// every hook and component iterates over this list rather than importing
// each adapter by name.
export const PROTOCOL_ADAPTERS: ProtocolAdapter[] = [
  morphoAdapter,
  moonwellAdapter,
  aaveAdapter,
  compoundAdapter,
];
