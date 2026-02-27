export type TgvRow = {
  rame: string;
  motriceA: string;
  motriceB: string;

  wikiGroup: string;
  serieLabel: string;
  etatRaw: string;

  status: "ACTIVE" | "HISTORICAL" | "UNKNOWN";
  confidence: "OK" | "PARTIAL" | "AMBIGUOUS";
  remark: string;
  source: string;
  extractedAt: string;
};