import type { TgvRow } from "./types";
import { normDigits } from "./normalize";

export type Indexes = {
  byRame: Map<string, TgvRow>;
  byMotrice: Map<string, TgvRow[]>;
};

export function buildIndexes(rows: TgvRow[]): Indexes {
  const byRame = new Map<string, TgvRow>();
  const byMotrice = new Map<string, TgvRow[]>();

  for (const r of rows) {
    const rameKey = normDigits(r.rame) || r.rame.trim();
    if (rameKey && !byRame.has(rameKey)) byRame.set(rameKey, r);

    for (const m of [r.motriceA, r.motriceB]) {
      const mk = normDigits(m);
      if (!mk) continue;

      // ✅ garde-fou: ignore les motrices manifestement tronquées (ex: "3102")
      // On accepte 5 chiffres (tu l’as précisé), donc seuil = 5.
      if (mk.length < 5) continue;

      const arr = byMotrice.get(mk) ?? [];
      arr.push(r);
      byMotrice.set(mk, arr);
    }
  }
  return { byRame, byMotrice };
}