import type { WordModeEngine } from "@/lib/settings";

export type LibraryVariant = "xkcd" | "css" | "small" | "large";

export interface Embedder {
  readonly id: WordModeEngine;
  readonly displayName: string;
  readonly assetBytes: number;
  isReady(): boolean;
  load(onProgress?: (loaded: number, total: number) => void, signal?: AbortSignal): Promise<void>;
  encodeQuery(text: string): Promise<Float32Array>;
  loadColorVectors(library: LibraryVariant): Promise<Float32Array[]>;
}

export const NullEmbedder: Embedder = {
  id: "literal",
  displayName: "Literal only",
  assetBytes: 0,
  isReady: () => true,
  load: async () => {},
  encodeQuery: async () => new Float32Array(),
  loadColorVectors: async () => [],
};
