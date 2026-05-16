import { type ColorReference, getPrimaryColorName } from "@/lib/color-matcher";
import { searchByWord } from "@/lib/word-search";
import { type Embedder, NullEmbedder } from "@/lib/word-search/embedder";
import type { EvalCase } from "@/lib/word-search/eval/queries";
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
  generatedAt: string;
  cases: CaseResult[];
};

export async function runEval(input: {
  cases: EvalCase[];
  library: ColorReference[];
  tfidf: TfidfIndex;
  embedder?: Embedder;
  libraryId: string;
}): Promise<RunResult> {
  const embedder = input.embedder ?? NullEmbedder;
  const caseResults: CaseResult[] = [];

  for (const evalCase of input.cases) {
    const hits = await searchByWord(evalCase.query, input.library, input.tfidf, embedder, {
      topN: 3,
    });

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
    engine: embedder.id,
    generatedAt: new Date().toISOString(),
    cases: caseResults,
  };
}
