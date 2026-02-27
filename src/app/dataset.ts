import type { TgvRow } from "./types";

export async function loadDataset(): Promise<TgvRow[]> {
  const res = await fetch("/data/tgv_map.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`Erreur chargement dataset: HTTP ${res.status}`);
  return res.json();
}