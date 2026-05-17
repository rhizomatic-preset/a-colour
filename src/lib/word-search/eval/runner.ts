import { type ColorReference, getPrimaryColorName } from "@/lib/color-matcher";
import { searchByWord, type WordSearchResult } from "@/lib/word-search";
import type { DistillationLookup } from "@/lib/word-search/distillation/lookup";
import { type Embedder, NullEmbedder } from "@/lib/word-search/embedder";
import type { EvalCase } from "@/lib/word-search/eval/queries";
import { NoopExpander, type QueryExpander } from "@/lib/word-search/expander";
import type { TfidfIndex } from "@/lib/word-search/tfidf-index";

export type CaseResult = {
  case: EvalCase;
  results: Array<{
    name: string;
    hex: string;
    family: string;
    score: number;
  }>;
  pass: { at1: boolean; at3: boolean };
};

export type RunResult = {
  library: string;
  engine: string;
  expander: string;
  generatedAt: string;
  cases: CaseResult[];
};

/**
 * Pluggable per-case searcher. Phase 0/1 wires the standard literal
 * `searchByWord`; Phase 2A bake-off scripts inject a candidate-specific
 * hybrid searcher without touching the runtime path.
 */
export type CaseSearcher = (query: string) => Promise<WordSearchResult[]>;

export async function runEval(input: {
  cases: EvalCase[];
  library: ColorReference[];
  tfidf: TfidfIndex;
  embedder?: Embedder;
  expander?: QueryExpander;
  libraryId: string;
  /** Bake-off override; defaults to the literal-path searchByWord. */
  searcher?: CaseSearcher;
  /** Optional override for the `engine` field in the resulting RunResult. */
  engineLabel?: string;
  /** Build-time-distilled common-noun lookup. When present, the distillation
   * layer fires before TF-IDF for matching queries. */
  distillation?: DistillationLookup;
}): Promise<RunResult> {
  const embedder = input.embedder ?? NullEmbedder;
  const expander = input.expander ?? NoopExpander;
  const engineLabel = input.engineLabel ?? embedder.id;
  const searcher: CaseSearcher =
    input.searcher ??
    ((query: string) =>
      searchByWord(query, input.library, input.tfidf, embedder, {
        topN: 3,
        expander,
        distillation: input.distillation,
      }));
  const caseResults: CaseResult[] = [];

  for (const evalCase of input.cases) {
    const hits = await searcher(evalCase.query);

    const results = hits.map((hit) => ({
      name: hit.name,
      hex: hit.hex,
      family: getPrimaryColorName(hit.hex),
      score: hit.score,
    }));

    const passAt = (k: number): boolean => {
      const head = results.slice(0, k);
      if (evalCase.expectedFamily) {
        return head.some((r) => r.family === evalCase.expectedFamily);
      }
      if (evalCase.expectedName) {
        const expected = evalCase.expectedName.toLowerCase();
        return head.some((r) => r.name.toLowerCase() === expected);
      }
      // Inspection-only cases (poetic) are recorded but always "pass".
      return true;
    };

    caseResults.push({
      case: evalCase,
      results,
      pass: { at1: passAt(1), at3: passAt(3) },
    });
  }

  return {
    library: input.libraryId,
    engine: engineLabel,
    expander: expander.id,
    generatedAt: new Date().toISOString(),
    cases: caseResults,
  };
}
