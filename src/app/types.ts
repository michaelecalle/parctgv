export type TgvRow = {
  rame: string;
  motriceA: string;
  motriceB: string;

  wikiGroup: string;
  serieLabel: string;

  // Champs "bruts" extraits des colonnes Wikipédia (peuvent être vides selon les tableaux)
  typeRaw: string;
  miseEnServiceRaw: string;
  radiationRemarqueRaw: string;
  livreeRaw: string;
  stfTitulaireRaw: string;
  baptemeRaw: string;
  etatRaw: string;

  status: "ACTIVE" | "HISTORICAL" | "UNKNOWN";
  confidence: "OK" | "PARTIAL" | "AMBIGUOUS";
  remark: string;
  source: string;
  extractedAt: string;
};