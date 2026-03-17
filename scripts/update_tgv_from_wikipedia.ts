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

  // Sous-série / type si présent
  typeRaw?: string;

  // Baptême (si présent)
  baptemeRaw?: string;

  // Livrée (si présent)
  livreeRaw?: string;

  // STF (si présent)
  stfTitulaireRaw?: string;

  // Mise en service (si présent)
  miseEnServiceRaw?: string;

  // Radiation/remarque (colonne dédiée)
  radiationRemarqueRaw?: string;

  // Remarque extraite du champ motrices (cas ex: "ex-24013/24014")
  remark?: string;

  // Confidence : EXACT (2 motrices), PARTIAL (1 motrice), NONE (0)
  confidence: "EXACT" | "PARTIAL" | "NONE";

  // Statut métier (ACTIVE/HISTORICAL/UNKNOWN)
  status: SerieStatus;

  // Timestamp extraction
  extractedAt: string;
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

// Supprime les refs Wikipédia [1], [12], etc. + normalise espaces/tirets
function cleanWikiCellText(s: string) {
  return cleanText(s)
    .replace(/\[[^\]]*]/g, "") // refs [1]
    .replace(/\u00A0/g, " ") // nbsp
    .replace(/[–—]/g, "-") // tirets unicode
    .replace(/\s+/g, " ")
    .trim();
}

function hasWord(h: string, w: string) {
  return (` ${h} `).includes(` ${w} `);
}

// Ex: "24001/002" -> ["24001","24002"]
// Ex: "28001 / 28002" -> ["28001","28002"]
function expandMotrices(raw: string): { a?: string; b?: string; remark?: string } {
  const t = cleanWikiCellText(raw);

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

  // cas 2: "28001 - 28002" ou "28001–28002"
  const m2 = t.match(/(\d{3,6})\s*[-]\s*(\d{3,6})/);
  if (m2) return { a: m2[1], b: m2[2] };

  // cas 3: 2 nombres simples dans la cellule (ex: "24001 24002")
  const nums = [...t.matchAll(/\b(\d{3,6})\b/g)].map((x) => x[1]);
  if (nums.length >= 2) return { a: nums[0], b: nums[1] };
  if (nums.length === 1) return { a: nums[0] };

  // cas 4: rien (ou "—", etc.)
  // on conserve quand même le texte brut comme remarque éventuelle
  const remark = t && t !== "-" ? t : undefined;
  return { remark };
}

function headerKey(s: string) {
  return cleanText(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function wikiGroupTitle(raw: string) {
  return cleanText(raw).replace(/\[[^\]]*]/g, "").trim();
}

function parseTableToRows(html: string) {
  const $ = cheerio.load(html);

  const out: Row[] = [];

  // Les tableaux wikitable "Liste des TGV"
  const tables = $(".wikitable");

  tables.each((_, table) => {
    const $table = $(table);

    // titre du groupe = le <caption> si présent, sinon rien
    const caption = wikiGroupTitle($table.find("caption").first().text());
    const wikiGroup = caption || "Wikitable";

    // Ligne header : la première ligne avec des <th>
    const $headerRow = $table.find("tr").filter((__, tr) => $(tr).find("th").length > 0).first();
    if (!$headerRow.length) return;

    const headerCells = $headerRow.find("th");

    let rameIdx = -1;
    let motIdx = -1;
    let motScore = -999;
    let etatIdx = -1;

    let miseIdx = -1;
    let radIdx = -1;
    let typeIdx = -1;
    let livreeIdx = -1;
    let stfIdx = -1;
    let baptIdx = -1;

    // ✅ support tableaux avec 2 colonnes (Motrice A / Motrice B)
    let motAIdx = -1;
    let motBIdx = -1;

    headerCells.each((i, th) => {
      const raw = cleanText($(th).text());
      const h = headerKey(raw);

      if (h.includes("rame")) rameIdx = i;

      // détecter explicitement Motrice A / Motrice B si présents
      if (h.includes("motrice") && (h.endsWith(" a") || h.includes(" motrice a"))) motAIdx = i;
      if (h.includes("motrice") && (h.endsWith(" b") || h.includes(" motrice b"))) motBIdx = i;

      if (h.includes("motrice")) {
        // On choisit la colonne "motrices" avec priorité, et on évite "origine"
        const isOrigine = hasWord(h, "origine");
        const isPlural = hasWord(h, "motrices");
        const score = (isPlural ? 20 : 10) + (isOrigine ? -100 : 0);

        if (score > motScore) {
          motScore = score;
          motIdx = i;
        }
      }

      // colonne opti
      if (h.includes("etat")) etatIdx = i;

      // colonnes bonus (varient selon série)
      if (h.includes("mise") && h.includes("service")) miseIdx = i;
      if (h.includes("radiation") || (h.includes("remarque") && h.includes("radiation"))) radIdx = i;
      if (h === "type" || (h.includes("type") && !h.includes("prototype"))) typeIdx = i;
      if (h.includes("livree")) livreeIdx = i;
      if (h.includes("stf")) stfIdx = i;
      if (h.includes("bapteme")) baptIdx = i;
    });

    // rame + motrices indispensables
    // ✅ si Motrice A/B existent, on n'exige pas motIdx
    if (rameIdx === -1 || (motIdx === -1 && (motAIdx === -1 || motBIdx === -1))) return;

    const $dataRows = $headerRow.nextAll("tr");

    $dataRows.each((__, tr) => {
      const $cells = $(tr).find("td");
      if ($cells.length === 0) return;

      const rame = cleanWikiCellText($cells.eq(rameIdx).text());
      if (!rame) return;

      // ✅ Filtre anti-artefacts (ex: "/", "Rés.", etc.)
      // On ne garde que les rames contenant au moins un chiffre.
      const rameDigits = rame.replace(/\D/g, "");
      if (!rameDigits) return;

      // ✅ si tableau A/B : on lit directement les 2 colonnes
      // sinon : fallback sur parsing de la colonne "motrices"
      let a: string | undefined;
      let b: string | undefined;
      let remark: string | undefined;

      if (motAIdx >= 0 && motBIdx >= 0) {
        const rawA = cleanWikiCellText($cells.eq(motAIdx).text());
        const rawB = cleanWikiCellText($cells.eq(motBIdx).text());
        a = rawA.replace(/\D/g, "") || undefined;
        b = rawB.replace(/\D/g, "") || undefined;
      } else {
        const motRaw = cleanWikiCellText($cells.eq(motIdx).text());
        const parsed = expandMotrices(motRaw);
        a = parsed.a;
        b = parsed.b;
        remark = parsed.remark;
      }

      const etatRaw = etatIdx >= 0 ? cleanWikiCellText($cells.eq(etatIdx).text()) : "";

      const miseEnServiceRaw = miseIdx >= 0 ? cleanWikiCellText($cells.eq(miseIdx).text()) : undefined;
      const radiationRemarqueRaw = radIdx >= 0 ? cleanWikiCellText($cells.eq(radIdx).text()) : undefined;
      const typeRaw = typeIdx >= 0 ? cleanWikiCellText($cells.eq(typeIdx).text()) : undefined;
      const livreeRaw = livreeIdx >= 0 ? cleanWikiCellText($cells.eq(livreeIdx).text()) : undefined;
      const stfTitulaireRaw = stfIdx >= 0 ? cleanWikiCellText($cells.eq(stfIdx).text()) : undefined;
      const baptemeRaw = baptIdx >= 0 ? cleanWikiCellText($cells.eq(baptIdx).text()) : undefined;

      // mapping série à partir du nom du groupe
      const mapping = SERIE_MAPPING.find((m) =>
        wikiGroup.toLowerCase().startsWith((m.groupPrefix ?? "").toLowerCase())
      );
      const serieLabel = mapping?.serieLabel ?? wikiGroup;
      const status: SerieStatus = mapping?.status ?? "UNKNOWN";

      const confidence: Row["confidence"] = a && b ? "EXACT" : a ? "PARTIAL" : "NONE";

      out.push({
        rame,
        motriceA: a ?? "",
        motriceB: b ?? "",
        wikiGroup,
        serieLabel,

        typeRaw,
        baptemeRaw,
        livreeRaw,
        stfTitulaireRaw,
        miseEnServiceRaw,
        radiationRemarqueRaw,

        remark,
        confidence,
        status,
        extractedAt: nowIso()
      });
    });
  });

  return out;
}

async function fetchWikiHtml() {
  const url = `${WIKI_API}&page=${encodeURIComponent(WIKI_PAGE)}`;

  const r = await fetch(url);
  if (!r.ok) throw new Error(`Wiki fetch failed: ${r.status} ${r.statusText}`);

  const j = await r.json();
  const html = j?.parse?.text?.["*"];
  if (!html) throw new Error("Wiki parse result missing html");

  return html as string;
}

function writeOutputs(rows: Row[]) {
  const outDir = path.join(process.cwd(), "public", "data");
  fs.mkdirSync(outDir, { recursive: true });

  // JSON
  const jsonPath = path.join(outDir, "tgv_map.json");
  fs.writeFileSync(jsonPath, JSON.stringify(rows, null, 2), "utf-8");

  // CSV (flat)
  const csvPath = path.join(outDir, "tgv_map.csv");
  const csv = Papa.unparse(
    rows.map((r) => ({
      rame: r.rame,
      motriceA: r.motriceA,
      motriceB: r.motriceB,
      serieLabel: r.serieLabel,
      type: r.typeRaw ?? "",
      bapteme: r.baptemeRaw ?? "",
      livree: r.livreeRaw ?? "",
      stf: r.stfTitulaireRaw ?? "",
      miseEnService: r.miseEnServiceRaw ?? "",
      radiationRemarque: r.radiationRemarqueRaw ?? "",
      remark: r.remark ?? "",
      confidence: r.confidence,
      status: r.status,
      wikiGroup: r.wikiGroup,
      extractedAt: r.extractedAt
    })),
    { quotes: true }
  );
  fs.writeFileSync(csvPath, csv, "utf-8");

  // Issues CSV
  const issues: Array<{ type: string; rame: string; motrice: string; wikiGroup: string; note: string }> = [];

  for (const r of rows) {
    if (!r.rame) continue;
    if (!r.motriceA || !r.motriceB) {
      issues.push({
        type: "MOTRICES_INCOMPLETE",
        rame: r.rame,
        motrice: `${r.motriceA || "?"}/${r.motriceB || "?"}`,
        wikiGroup: r.wikiGroup,
        note: r.remark ?? ""
      });
    }
  }

  const issuesPath = path.join(outDir, "tgv_issues.csv");
  const issuesCsv = Papa.unparse(issues, { quotes: true });
  fs.writeFileSync(issuesPath, issuesCsv, "utf-8");

  console.log(`OK: ${rows.length} lignes extraites`);
  console.log(`Issues: ${issues.length}`);
  console.log(`Écrit dans: public/data/`);
}

async function main() {
  const html = await fetchWikiHtml();
  const rows = parseTableToRows(html);

  // tri par rame numérique si possible
  rows.sort((a, b) => {
    const na = parseInt(a.rame.replace(/\D/g, ""), 10);
    const nb = parseInt(b.rame.replace(/\D/g, ""), 10);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return a.rame.localeCompare(b.rame);
  });

  writeOutputs(rows);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});