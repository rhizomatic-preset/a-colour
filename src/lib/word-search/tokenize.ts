export function tokenize(input: string): string[] {
  // NFD decomposes "ā" → "a" + combining macron, then the diacritic strip leaves
  // "a". This is what lets Te Reo Māori words ("kākāriki") and other accented
  // text fold onto their ASCII-bare keys in the expansion dictionary.
  const normalised = input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!normalised) return [];
  return normalised.split(/\s+/);
}
