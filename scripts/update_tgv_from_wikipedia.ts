/* scripts/update_tgv_from_wikipedia.ts */
import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";
import Papa from "papaparse";
import { SERIE_MAPPING, type SerieStatus } from "./serie_mapping";

type Row = {
  rame: string;
  motriceA: string;
  motriceB: string;

  // Libellé Wikipédia du tableau (ex: "Rames 800 : état du matériel au ...")
  wikiGroup: string;

  // Série métier (ex: "TGV Euroduplex (2N2)")
  serieLabel: string;

  // Sous-série / type si présent (ex: "3UH", "3UF", "3UA"...)
  typeRaw: string;

  // Champs extra du tableau
  miseEnServiceRaw: string;
  radiationRemarqueRaw: string;
  livreeRaw: string;
  stfTitulaireRaw: string;
  baptemeRaw: string;

  // Colonne "État/Statut" brute si elle existe (souvent absente)
  etatRaw: string;

  status: SerieStatus;

  confidence: "OK" | "PARTIAL" | "AMBIGUOUS";
  remark: string;
  source: string;
  extractedAt: string; // ISO
};

const WIKI_PAGE = "Liste_des_TGV";
const WIKI_API =
  "https://fr.wikipedia.org/w/api.php?action=parse&format=json&prop=text&origin=*";

function nowIso() {
  return new Date().toISOString();
}

function cleanText(s: string) {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

// Ex: "24001/002" -> ["24001","24002"]
// Ex: "28001 / 28002" -> ["28001","28002"]
function expandMotrices(raw: string): { a?: string; b?: string; remark?: string } {
  const t = cleanText(raw)
    .replace(/[–—]/g, "-")
    .replace(/\u00A0/g, " "); // nbsp

  // extraire 2 nombres (avec possible forme abrégée après /)
  // cas 1: "310201/202"
  const m = t.match(/(\d{3,6})\s*\/\s*(\d{1,6})/);
  if (m) {
    const left = m[1];
    const right = m[2];

    // si right est abrégé (ex 202), on reprend le préfixe de left
    if (right.length < left.length) {
      const prefix = left.slice(0, left.length - right.length);
      const fullRight = prefix + right;
      return { a: left, b: fullRight };
    }
    return { a: left, b: right };
  }

  // cas 2: "28001 28002" ou "28001-28002"
  const nums = t.match(/\d{3,6}/g) ?? [];
  if (nums.length >= 2) {
    return { a: nums[0], b: nums[1] };
  }
  if (nums.length === 1) {
    return { a: nums[0], b: "", remark: "Une seule motrice détectée" };
  }
  return { a: "", b: "", remark: "Aucune motrice détectée" };
}

function tableLooksLikeRameMotrices($table: cheerio.Cheerio<any>, $: cheerio.CheerioAPI) {
  const $headerRow = $table
    .find("tr")
    .filter((_, tr) => $(tr).find("th").length > 0)
    .first();
  if ($headerRow.length === 0) return false;

  const headers = $headerRow
    .find("th")
    .map((_, th) => cleanText($(th).text()))
    .get()
    .join("|")
    .toLowerCase();

  return headers.includes("rame") && headers.includes("motrice");
}

function normalizeWikiGroupTitle(s: string): string {
  // enlève les références [4], [19], etc.
  return cleanText(s.replace(/\[[^\]]*]/g, ""));
}

function applySerieMapping(wikiGroupTitle: string): { serieLabel: string; status: SerieStatus } {
  const t = normalizeWikiGroupTitle(wikiGroupTitle);
  const entry = SERIE_MAPPING.find((e) => t.startsWith(e.groupPrefix));
  if (!entry) return { serieLabel: "Inconnu", status: "UNKNOWN" };
  return { serieLabel: entry.serieLabel, status: entry.status };
}

function headerKey(h: string) {
  // normalisation pour matcher facilement les variantes ("titulaire", "STF", accents, etc.)
  return cleanText(h)
    .toLowerCase()
    .replace(/\u00A0/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // supprime accents
}

async function main() {
  const extractedAt = nowIso();
  const url = `${WIKI_API}&page=${encodeURIComponent(WIKI_PAGE)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);

  const res = await fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timeout));
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
  const data: any = await res.json();

  const html = data?.parse?.text?.["*"];
  if (!html) throw new Error("Impossible de récupérer le HTML parsé depuis l'API MediaWiki.");

  const $ = cheerio.load(html);
  const $tables = $("table.wikitable");

  const rows: Row[] = [];
  const issues: Row[] = [];

  function inferWikiGroupForTable(tableEl: any): string {
    const $t = $(tableEl);

    const caption = cleanText($t.find("caption").first().text());
    if (caption) return caption;

    let $h = $t.prevAll("h2, h3").first();
    if ($h.length) {
      const headline = cleanText($h.find(".mw-headline").first().text() || $h.text());
      return headline.replace(/\[modifier.*$/i, "").trim() || "Inconnu";
    }

    let $p = $t.parent();
    for (let i = 0; i < 10 && $p.length; i++) {
      $h = $p.prevAll("h2, h3").first();
      if ($h.length) {
        const headline = cleanText($h.find(".mw-headline").first().text() || $h.text());
        return headline.replace(/\[modifier.*$/i, "").trim() || "Inconnu";
      }
      $p = $p.parent();
    }

    return "Inconnu";
  }

  $tables.each((_, tableEl) => {
    const $table = $(tableEl);
    if (!tableLooksLikeRameMotrices($table, $)) return;

    const wikiGroup = inferWikiGroupForTable(tableEl);
    const mapped = applySerieMapping(wikiGroup);

    const $headerRow = $table
      .find("tr")
      .filter((_, tr) => $(tr).find("th").length > 0)
      .first();
    if ($headerRow.length === 0) return;

    const headerCells = $headerRow.find("th");

    let rameIdx = -1;
    let motIdx = -1;
    let etatIdx = -1;

    let miseIdx = -1;
    let radIdx = -1;
    let typeIdx = -1;
    let livreeIdx = -1;
    let stfIdx = -1;
    let baptIdx = -1;

    headerCells.each((i, th) => {
      const raw = cleanText($(th).text());
      const h = headerKey(raw);

      if (h.includes("rame")) rameIdx = i;
      if (h.includes("motrice")) motIdx = i;

      // colonne optionnelle déjà gérée
      if (h.includes("etat") || h.includes("statut")) etatIdx = i;

      // nouvelles colonnes (variantes selon tableaux)
      if (h.includes("mise en service")) miseIdx = i;
      if (h.includes("radiation") || h.includes("remarque")) radIdx = i; // "Radiation" ou "Radiation ou remarque"
      if (h === "type" || h.includes(" type")) typeIdx = i;
      if (h.includes("livree")) livreeIdx = i;
      if (h.includes("titulaire") || h === "stf" || h.includes(" stf")) stfIdx = i;
      if (h.includes("bapteme")) baptIdx = i;
    });

    if (rameIdx === -1 || motIdx === -1) return;

    const $dataRows = $headerRow.nextAll("tr");

    $dataRows.each((__, tr) => {
      const $cells = $(tr).find("td");
      if ($cells.length === 0) return;

      const rame = cleanText($cells.eq(rameIdx).text());
      const motRaw = cleanText($cells.eq(motIdx).text());
      if (!rame) return;

      const { a, b, remark } = expandMotrices(motRaw);

      const etatRaw = etatIdx >= 0 ? cleanText($cells.eq(etatIdx).text()) : "";

      const miseEnServiceRaw = miseIdx >= 0 ? cleanText($cells.eq(miseIdx).text()) : "";
      const radiationRemarqueRaw = radIdx >= 0 ? cleanText($cells.eq(radIdx).text()) : "";
      const typeRaw = typeIdx >= 0 ? cleanText($cells.eq(typeIdx).text()) : "";
      const livreeRaw = livreeIdx >= 0 ? cleanText($cells.eq(livreeIdx).text()) : "";
      const stfTitulaireRaw = stfIdx >= 0 ? cleanText($cells.eq(stfIdx).text()) : "";
      const baptemeRaw = baptIdx >= 0 ? cleanText($cells.eq(baptIdx).text()) : "";

      const row: Row = {
        rame,
        motriceA: a ?? "",
        motriceB: b ?? "",
        wikiGroup,
        serieLabel: mapped.serieLabel,
        typeRaw,
        miseEnServiceRaw,
        radiationRemarqueRaw,
        livreeRaw,
        stfTitulaireRaw,
        baptemeRaw,
        etatRaw,
        status: mapped.status,
        confidence: "OK",
        remark: remark ?? "",
        source: `wikipedia:${WIKI_PAGE}`,
        extractedAt
      };

      if (!row.motriceA || !row.motriceB) row.confidence = "PARTIAL";
      if (row.remark) row.confidence = row.motriceA && row.motriceB ? "OK" : "PARTIAL";

      const looksWeird = /[a-z]/i.test(motRaw) && !(row.motriceA && row.motriceB);
      if (looksWeird || row.confidence !== "OK") issues.push(row);

      rows.push(row);
    });
  });

  const outDir = path.join(process.cwd(), "public", "data");
  fs.mkdirSync(outDir, { recursive: true });

  const csv = Papa.unparse(rows, { quotes: false, delimiter: ";", newline: "\n" });
  fs.writeFileSync(path.join(outDir, "tgv_map.csv"), csv, "utf-8");

  const issuesCsv = Papa.unparse(issues, { quotes: false, delimiter: ";", newline: "\n" });
  fs.writeFileSync(path.join(outDir, "tgv_issues.csv"), issuesCsv, "utf-8");

  fs.writeFileSync(path.join(outDir, "tgv_map.json"), JSON.stringify(rows, null, 2), "utf-8");

  console.log(`OK: ${rows.length} lignes extraites`);
  console.log(`Issues: ${issues.length}`);
  console.log(`Écrit dans: public/data/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});