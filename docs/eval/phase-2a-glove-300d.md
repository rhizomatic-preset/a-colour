Engine: glove-300d  Library: small  Generated: 2026-05-16
─────────────────────────────────────────────────────────────────────
Category              n     acc@1     acc@3
trivial               10    100%      100%
modified-family        8    100%      100%
literal-name           5     80%      100%
css-literal            5    100%      100%
object-rooted         12     58%       75%
cultural               4     50%       75%
compound               6     33%       67%
te-reo                 8      0%        0%
weather                6      0%       17%
open-vocab            10     20%       40%
poetic                 3    100%      100%
─────────────────────────────────────────────────────────────────────
overall               77     56%       68%

Failures (acc@3):
  "ice"                     → expected white, got: teal, teal
  "fire"                    → expected orange, got: red
  "leaf"                    → expected green, got: olive, olive
  "minecraft creeper pants" → expected green, got: magenta, yellow, blue
  "dusty rose"              → expected pink, got: red, red, red
  "autumn leaves"           → expected orange, got: purple, pink, magenta
  "whero"                   → expected red, got: (no results)
  "kākāriki"                → expected green, got: (no results)
  "kōwhai"                  → expected yellow, got: green, blue, magenta
  "kahurangi"               → expected blue, got: green, orange, magenta
  "māwhero"                 → expected pink, got: (no results)
  "mangu"                   → expected black, got: magenta, magenta, magenta
  "kiwikiwi"                → expected gray, got: (no results)
  "waiporoporo"             → expected purple, got: (no results)
  "cloudy"                  → expected gray, got: blue
  "rain"                    → expected gray, got: blue, blue, orange
  "rainy"                   → expected gray, got: blue, blue, blue
  "lightning"               → expected yellow, got: red, teal, blue
  "puddle"                  → expected brown, got: orange, green, orange
  "rainbow trout"           → expected pink, got: olive, orange, red
  "caterpillar"             → expected green, got: teal, red, olive
  "salamander"              → expected orange, got: red, green, green
  "octopus"                 → expected pink, got: brown, teal, purple
  "charizard"               → expected orange, got: green, blue, magenta
  "kirby"                   → expected pink, got: green, green, green

Inspection-only (poetic):
  "melancholy"    → velvet, chestnut, merlot
  "joy"           → deep pink, deep rose, barbie pink
  "ocean at dawn" → ocean, ocean green, ocean blue

