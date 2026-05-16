export function tokenize(input: string): string[] {
  const normalised = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!normalised) return [];
  return normalised.split(/\s+/);
}
