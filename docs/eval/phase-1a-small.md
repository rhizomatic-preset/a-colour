Engine: literal  Library: small  Generated: 2026-05-16
─────────────────────────────────────────────────────────────────────
Category              n     acc@1     acc@3
trivial               10    100%      100%
modified-family        8    100%      100%
literal-name           5     80%      100%
css-literal            5    100%      100%
object-rooted         12     58%       67%
cultural               4     50%       50%
compound               6     33%       67%
poetic                 3    100%      100%
─────────────────────────────────────────────────────────────────────
overall               53     77%       85%

Failures (acc@3):
  "sunset"                  → expected orange, got: (no results)
  "ice"                     → expected white, got: teal, teal
  "fire"                    → expected orange, got: red
  "leaf"                    → expected green, got: olive, olive
  "minecraft creeper pants" → expected green, got: (no results)
  "mario hat"               → expected red, got: (no results)
  "dusty rose"              → expected pink, got: red, red, red
  "autumn leaves"           → expected orange, got: (no results)

Inspection-only (poetic):
  "melancholy"    → (no results)
  "joy"           → (no results)
  "ocean at dawn" → ocean, ocean green, ocean blue

