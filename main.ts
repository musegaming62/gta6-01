// Solmar — a top-down open-world crime game built for the make.fun gta6-01 bounty.
// The game itself is plain static files under game/ (index.html and ES modules) that a
// desktop browser loads offline, with no build step and no network request. This file
// is the entrypoint the grader runs: it copies game/ and screenshots/ into the output
// directory and writes dossier.json there using the vendored make.fun library.
//
// Play the game locally with `node serve.ts`, then open http://localhost:8080.
// To run this entrypoint by hand outside the grader, point it at a folder with
// the MAKEFUN_OUTPUT_DIR environment variable, e.g.:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-game.ts";

const repoRoot = fileURLToPath(new URL(".", import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";

// Refuse to hand in a repository whose game never landed.
if (!existsSync(join(repoRoot, "game", "index.html"))) {
  throw new Error("game/index.html is missing: build the game before handing it in");
}

mkdirSync(outputDir, { recursive: true });
cpSync(join(repoRoot, "game"), join(outputDir, "game"), { recursive: true });
mkdirSync(join(outputDir, "screenshots"), { recursive: true });
if (existsSync(join(repoRoot, "screenshots"))) {
  cpSync(join(repoRoot, "screenshots"), join(outputDir, "screenshots"), { recursive: true });
}

// The scorer's caps, from the competition gate: the dossier text holds at most
// 163840 bytes, at most 4 screenshots of at most 262144 bytes each, and game/ holds
// at most 993 entries and 50331648 bytes with no path longer than 1000 bytes.
writeFileSync(
  join(outputDir, "dossier.json"),
  buildDossier(outputDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
