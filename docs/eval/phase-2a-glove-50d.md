Engine: glove-50d  Library: small  Generated: 2026-05-16
─────────────────────────────────────────────────────────────────────
Category              n     acc@1     acc@3
trivial               10    100%      100%
modified-family        8    100%      100%
literal-name           5     80%      100%
css-literal            5    100%      100%
object-rooted         12     58%       75%
cultural               4     50%       50%
compound               6     33%       67%
te-reo                 8      0%       13%
weather                6      0%        0%
open-vocab            10     10%       20%
poetic                 3    100%      100%
─────────────────────────────────────────────────────────────────────
overall               77     55%       64%

Failures (acc@3):
  "ice"                     → expected white, got: teal, teal
  "fire"                    → expected orange, got: red
  "leaf"                    → expected green, got: olive, olive
  "minecraft creeper pants" → expected green, got: yellow, blue, orange
  "mario hat"               → expected red, got: magenta, magenta, magenta
  "dusty rose"              → expected pink, got: red, red, red
  "autumn leaves"           → expected orange, got: purple, gray, pink
  "whero"                   → expected red, got: (no results)
  "kākāriki"                → expected green, got: (no results)
  "kōwhai"                  → expected yellow, got: green, green, magenta
  "māwhero"                 → expected pink, got: (no results)
  "mangu"                   → expected black, got: olive, green, green
  "kiwikiwi"                → expected gray, got: (no results)
  "waiporoporo"             → expected purple, got: (no results)
  "cloud"                   → expected white, got: blue, blue, blue
  "cloudy"                  → expected gray, got: blue
  "rain"                    → expected gray, got: blue, red, orange
  "rainy"                   → expected gray, got: blue, blue, teal
  "lightning"               → expected yellow, got: red, teal, red
  "puddle"                  → expected brown, got: teal, pink, blue
  "rainbow trout"           → expected pink, got: green, olive, red
  "ender dragon"            → expected purple, got: blue, gray, blue
  "caterpillar"             → expected green, got: olive, magenta, gray
  "salamander"              → expected orange, got: gray, magenta, gray
  "octopus"                 → expected pink, got: brown, green, olive
  "charizard"               → expected orange, got: magenta, olive, magenta
  "kirby"                   → expected pink, got: gray, gray, olive
  "lego car"                → expected red, got: magenta, olive, olive

Inspection-only (poetic):
  "melancholy"    → brown, chocolate, dark fuchsia
  "joy"           → deep pink, bubblegum, barbie pink
  "ocean at dawn" → ocean, ocean green, ocean blue

