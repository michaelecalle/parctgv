/* scripts/validate_tgv.ts */
import fs from "node:fs";
import path from "node:path";

type Row = {
  rame: string;
  motriceA: string;
  motriceB: string;
  confidence: string;

  // présent dans le JSON généré (selon versions)
  serie?: string;
  wikiGroup?: string;
};

function readJson(): Row[] {
  const p = path.join(process.cwd(), "public", "data", "tgv_map.json");
  const raw = fs.readFileSync(p, "utf-8");
  return JSON.parse(raw);
}

function main() {
  const rows = readJson();

  const dupRame = new Map<string, number>();
  const motToRames = new Map<string, Set<string>>();

  for (const r of rows) {
    if (!r.rame) continue;

    dupRame.set(r.rame, (dupRame.get(r.rame) ?? 0) + 1);

    for (const m of [r.motriceA, r.motriceB]) {
      if (!m) continue;
      if (!motToRames.has(m)) motToRames.set(m, new Set());
      motToRames.get(m)!.add(r.rame);
    }
  }

  const rameDuplicates = [...dupRame.entries()].filter(([, n]) => n > 1);
  const motAmbiguous = [...motToRames.entries()].filter(([, set]) => set.size > 1);

  console.log(`Rows: ${rows.length}`);
  console.log(`Rames dupliquées: ${rameDuplicates.length}`);
  console.log(`Motrices ambiguës (plusieurs rames): ${motAmbiguous.length}`);

  if (rameDuplicates.length) {
    console.log("Exemples rames dupliquées:", rameDuplicates.slice(0, 10));
  }
  if (motAmbiguous.length) {
    console.log(
      "Exemples motrices ambiguës:",
      motAmbiguous.slice(0, 10).map(([m, set]) => [m, [...set].slice(0, 5)])
    );
  }

  // On ne fail pas automatiquement (historiquement il peut y avoir des cas spéciaux),
  // mais on peut durcir plus tard.

  // Checks "métier" (warnings) : s'assurer qu'on extrait bien les motrices sur certains groupes
  const g600 = rows.filter((r) => (r.wikiGroup ?? "").startsWith("Rames 600"));
  const g4500 = rows.filter((r) => (r.wikiGroup ?? "").startsWith("Rames 4500"));

  const bad600 = g600.filter((r) => !r.motriceA || !r.motriceB);
  const bad4500 = g4500.filter((r) => !r.motriceA || !r.motriceB);

  if (g600.length && bad600.length) {
    console.log(
      `[WARN] Rames 600: ${bad600.length}/${g600.length} lignes sans 2 motrices (colonne possiblement mauvaise).`
    );
    console.log(
      "Exemples:",
      bad600.slice(0, 5).map((r) => [r.rame, r.motriceA, r.motriceB])
    );
  }

  if (g4500.length && bad4500.length) {
    console.log(
      `[WARN] Rames 4500: ${bad4500.length}/${g4500.length} lignes sans 2 motrices (parsing a fiabiliser).`
    );
    console.log(
      "Exemples:",
      bad4500.slice(0, 5).map((r) => [r.rame, r.motriceA, r.motriceB])
    );
  }
}

main();