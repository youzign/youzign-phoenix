// Legacy Youzign font-name -> Google Fonts family mapping.
//
// Legacy designstrings carry the font as a collapsed CamelCase (or otherwise
// mangled) name, e.g. `FrederickatheGreat` for "Fredericka the Great". This
// table maps the exact legacy strings we've observed in the real corpus to
// their real Google Fonts family name, so `apps/editor/src/library/legacyFonts.ts`
// can rewrite `item.font` to something the existing Google Fonts loader
// (`ensureGoogleFonts` in `apps/editor/src/fonts.ts`) can actually resolve.
//
// Built 2026-07-16 from the real legacy corpus (dez73 extract, 5 accounts,
// `marketing`/`user-1`/`user-44389`/`user-7750`/`user-47220`): every distinct
// `font=` value on a `fontType="External Font"` text item was extracted, a
// literal-name + humanized-CamelCase candidate was generated for each, and
// each candidate was verified with a live GET against
// `https://fonts.googleapis.com/css2?family=<candidate>` (200 = real family).
// 25 of 77 distinct External-Font names resolved this way (~30% of the
// 24,142 External-Font item occurrences in that corpus). The remainder are
// mostly non-Google shareware/commercial faces (Coolvetica, SteinemRoman,
// Decker, ChunkFive, FreeSans, ...) with no Google Fonts equivalent — they
// keep the current sans-serif fallback.
//
// Keys are matched case-sensitively first, then case-insensitively with
// whitespace collapsed (see `legacyFonts.ts`), so both "BebasNeue" and
// "Bebas Neue" (already-correct spacing seen on some rows) resolve.
export const LEGACY_FONT_MAP: Record<string, string> = {
  AlexBrush: "Alex Brush",
  AmaticSC: "Amatic SC",
  "Arial Black": "Arial Black",
  Arvo: "Arvo",
  AveriaSansLibre: "Averia Libre",
  Baumans: "Baumans",
  "Bebas Neue": "Bebas Neue",
  BebasNeue: "Bebas Neue",
  CabinSketch: "Cabin Sketch",
  Calibri: "Calibri",
  Candara: "Candara",
  Caveat: "Caveat",
  Chewy: "Chewy",
  Cinzel: "Cinzel",
  "Comic Sans MS": "Comic Sans MS",
  Constantia: "Constantia",
  Creepster: "Creepster",
  DroidSerif: "Droid Serif",
  "Fredoka One": "Fredoka",
  Garamond: "Garamond",
  Georgia: "Georgia",
  GreatVibes: "Great Vibes",
  Helvetica: "Helvetica",
  "Helvetica Neue": "Helvetica Neue",
  HomemadeApple: "Homemade Apple",
  HoneyScript: "Homemade Apple",
  Lato: "Lato",
  LeagueGothic: "League Gothic",
  LeagueSpartan: "League Spartan",
  Lobster: "Lobster",
  LuckiestGuy: "Luckiest Guy",
  Montserrat: "Montserrat",
  Nunito: "Nunito",
  "Nunito Sans": "Nunito Sans",
  "Open Sans": "Open Sans",
  "PT Sans Narrow": "PT Sans Narrow",
  Pacifico: "Pacifico",
  PassionOne: "Passion One",
  "Playfair Display SC": "Playfair Display SC",
  Pompiere: "Pompiere",
  Poppins: "Poppins",
  Qwigley: "Qwigley",
  RockSalt: "Rock Salt",
  Rockwell: "Rockwell",
  "Source Sans Pro": "Source Sans Pro",
  WalterTurncoat: "Walter Turncoat",
  WorkSans: "Work Sans",
  Yanone: "Yanone Kaffeesatz",
  YanoneKaffeesatz: "Yanone Kaffeesatz",
  FrederickatheGreat: "Fredericka the Great",
  Yellowtail: "Yellowtail",
};

/**
 * Legacy font names observed in the real corpus with NO Google Fonts
 * equivalent (verified: the humanized-CamelCase candidate 400'd against the
 * Google Fonts CSS2 endpoint). Mostly shareware/commercial dafont-style faces
 * (Coolvetica, SteinemRoman, Decker, ChunkFive, ...) or non-Google system
 * fonts (FreeSans, TimesNewRoman, Impact). Kept here only for documentation /
 * the inventory report — the loader doesn't need this list at runtime, it
 * just leaves unmapped names alone (current fallback, logged once).
 */
export const KNOWN_UNMAPPABLE_LEGACY_FONTS: readonly string[] = [
  "FreeSans",
  "Coolvetica",
  "Decker",
  "SteinemRoman",
  "ChunkFive",
  "Christopherhand",
  "Enigmatic",
  "PassingNotes",
  "FaceBLF",
  "CREW36",
  "KGAlways",
  "SchuboiseHandwrite",
  "Aldo",
  "TOSCA",
  "AlphaEcho",
  "Adventure",
  "CodeLight",
  "Bangle",
  "Riven",
  "FORQUE",
  "Furore",
  "Blackout",
  "Eraser",
  "SoulMission",
  "CaptureIt",
  "Yesterdaysmeal",
  "Faktos",
  "SketchBlock",
  "Age",
  "BBPetieBoy",
  "Soopafresh",
  "Idolwild",
  "Punchline",
  "Canadian",
  "TimesNewRoman",
  "Airstream",
  "Blokletters",
  "AlwaysHere",
  "LivingHell",
  "Malgecito",
  "FluxArchitect",
  "Hursheys",
  "JuneBug",
  "VintageOne",
  "If",
  "ACIDL",
  "District",
  "SFArcheryBlack",
  "Clementine",
  "Whoa",
  "Impact",
];

/**
 * Legacy font names with NO Google Fonts equivalent that we now SELF-HOST from
 * the rescued original font library (`_editor_assets/fonts/`, the exact files
 * the legacy Youzign editor shipped for 10+ years). Maps the exact legacy
 * corpus name -> the CSS family we register it under (same name) and the
 * bundled woff2 filename in `apps/editor/public/legacy-fonts/`. The loader
 * (`legacyFonts.ts`) rewrites matching `item.font` values to `family` and
 * `legacyFontFaces.ts` injects an @font-face pointing at the bundled file.
 * Every name here is drawn from `KNOWN_UNMAPPABLE_LEGACY_FONTS` above and was
 * matched to a real font file in the rescued library (51/51).
 */
export const LEGACY_SELF_HOST_FONTS: Record<string, { family: string; file: string }> = {
  "ACIDL": { family: "ACIDL", file: "acidl.woff2" },
  "Adventure": { family: "Adventure", file: "adventure.woff2" },
  "Age": { family: "Age", file: "age.woff2" },
  "Airstream": { family: "Airstream", file: "airstream.woff2" },
  "Aldo": { family: "Aldo", file: "aldo.woff2" },
  "AlphaEcho": { family: "AlphaEcho", file: "alphaecho.woff2" },
  "AlwaysHere": { family: "AlwaysHere", file: "alwayshere.woff2" },
  "BBPetieBoy": { family: "BBPetieBoy", file: "bbpetieboy.woff2" },
  "Bangle": { family: "Bangle", file: "bangle.woff2" },
  "Blackout": { family: "Blackout", file: "blackout.woff2" },
  "Blokletters": { family: "Blokletters", file: "blokletters.woff2" },
  "CREW36": { family: "CREW36", file: "crew36.woff2" },
  "Canadian": { family: "Canadian", file: "canadian.woff2" },
  "CaptureIt": { family: "CaptureIt", file: "captureit.woff2" },
  "Christopherhand": { family: "Christopherhand", file: "christopherhand.woff2" },
  "ChunkFive": { family: "ChunkFive", file: "chunkfive.woff2" },
  "Clementine": { family: "Clementine", file: "clementine.woff2" },
  "CodeLight": { family: "CodeLight", file: "codelight.woff2" },
  "Coolvetica": { family: "Coolvetica", file: "coolvetica.woff2" },
  "Decker": { family: "Decker", file: "decker.woff2" },
  "District": { family: "District", file: "district.woff2" },
  "Enigmatic": { family: "Enigmatic", file: "enigmatic.woff2" },
  "Eraser": { family: "Eraser", file: "eraser.woff2" },
  "FORQUE": { family: "FORQUE", file: "forque.woff2" },
  "FaceBLF": { family: "FaceBLF", file: "faceblf.woff2" },
  "Faktos": { family: "Faktos", file: "faktos.woff2" },
  "FluxArchitect": { family: "FluxArchitect", file: "fluxarchitect.woff2" },
  "FreeSans": { family: "FreeSans", file: "freesans.woff2" },
  "Furore": { family: "Furore", file: "furore.woff2" },
  "Hursheys": { family: "Hursheys", file: "hursheys.woff2" },
  "Idolwild": { family: "Idolwild", file: "idolwild.woff2" },
  "If": { family: "If", file: "if.woff2" },
  "Impact": { family: "Impact", file: "impact.woff2" },
  "JuneBug": { family: "JuneBug", file: "junebug.woff2" },
  "KGAlways": { family: "KGAlways", file: "kgalways.woff2" },
  "LivingHell": { family: "LivingHell", file: "livinghell.woff2" },
  "Malgecito": { family: "Malgecito", file: "malgecito.woff2" },
  "PassingNotes": { family: "PassingNotes", file: "passingnotes.woff2" },
  "Punchline": { family: "Punchline", file: "punchline.woff2" },
  "Riven": { family: "Riven", file: "riven.woff2" },
  "SFArcheryBlack": { family: "SFArcheryBlack", file: "sfarcheryblack.woff2" },
  "SchuboiseHandwrite": { family: "SchuboiseHandwrite", file: "schuboisehandwrite.woff2" },
  "SketchBlock": { family: "SketchBlock", file: "sketchblock.woff2" },
  "Soopafresh": { family: "Soopafresh", file: "soopafresh.woff2" },
  "SoulMission": { family: "SoulMission", file: "soulmission.woff2" },
  "SteinemRoman": { family: "SteinemRoman", file: "steinemroman.woff2" },
  "TOSCA": { family: "TOSCA", file: "tosca.woff2" },
  "TimesNewRoman": { family: "TimesNewRoman", file: "timesnewroman.woff2" },
  "VintageOne": { family: "VintageOne", file: "vintageone.woff2" },
  "Whoa": { family: "Whoa", file: "whoa.woff2" },
  "Yesterdaysmeal": { family: "Yesterdaysmeal", file: "yesterdaysmeal.woff2" },
};
