import { useEffect, useMemo, useState } from "react";
import type { TgvRow } from "./app/types";
import { loadDataset } from "./app/dataset";
import { buildIndexes } from "./app/lookup";
import { normDigits } from "./app/normalize";

export default function App() {
  const [rows, setRows] = useState<TgvRow[] | null>(null);
  const [err, setErr] = useState<string>("");

  const [rame, setRame] = useState("");
  const [mA, setMA] = useState("");
  const [mB, setMB] = useState("");

  const [result, setResult] = useState<TgvRow | null>(null);
  const [candidates, setCandidates] = useState<TgvRow[]>([]);
  const [warning, setWarning] = useState<string>("");

  useEffect(() => {
    loadDataset()
      .then(setRows)
      .catch((e) => setErr(String(e)));
  }, []);

  // Mode supprimé : on utilise toujours l’ensemble du dataset
  const filtered = useMemo(() => {
    if (!rows) return [];
    return rows;
  }, [rows]);

  const idx = useMemo(() => buildIndexes(filtered), [filtered]);

  function clearAll() {
    setRame("");
    setMA("");
    setMB("");
    setResult(null);
    setCandidates([]);
    setWarning("");
  }

  function applyRow(r: TgvRow) {
    setResult(r);
    setCandidates([]);
    setWarning(r.remark ? r.remark : "");
    setRame(normDigits(r.rame) || r.rame);
    setMA(r.motriceA);
    setMB(r.motriceB);
  }

  function handleRameChange(v: string) {
    const nv = normDigits(v);
    setRame(nv);
    setWarning("");
    setCandidates([]);

    if (!nv) {
      setResult(null);
      setMA("");
      setMB("");
      return;
    }

    const r = idx.byRame.get(nv);
    if (!r) {
      setResult(null);
      setMA("");
      setMB("");
      setWarning("Rame inconnue dans le dataset (ou filtre Actuel actif).");
      return;
    }
    applyRow(r);
  }

  function handleMotriceChange(which: "A" | "B", v: string) {
    const nv = normDigits(v);
        console.log("[motrice-change]", { which, v, nv, nvLen: nv.length });
    if (which === "A") setMA(nv);
    else setMB(nv);

    setWarning("");
    setCandidates([]);

    if (!nv) {
      setResult(null);
      setRame("");
      if (which === "A") setMB("");
      else setMA("");
      return;
    }

    const list = idx.byMotrice.get(nv) ?? [];
    if (list.length === 0) {
      // ✅ pas de match exact => on ne “casse” pas le contexte
      // On garde l’autre motrice et la rame tant que l’utilisateur n’a pas saisi un numéro complet reconnu.
      setResult(null);
      setWarning("Motrice inconnue dans le dataset (ou filtre Actuel actif).");
      return;
    }
    if (list.length === 1) {
      applyRow(list[0]);
      return;
    }

    // ambigu : on propose une sélection
    setResult(null);
    setCandidates(list.slice(0, 20));
    setWarning("Plusieurs correspondances trouvées (historique) — choisis :");
  }

  if (err) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>Erreur: {err}</div>
      </div>
    );
  }

  if (!rows) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>Chargement…</div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={styles.title}>Parc TGV</div>
      </div>

      <div style={styles.card}>


        <div style={styles.grid}>
          <div style={styles.field}>
            <div style={styles.fieldLabel}>Motrice A</div>
            <input
              style={styles.input}
              value={mA}
              onChange={(e) => {
                const nv = normDigits(e.target.value);
                setMA(nv);
                setWarning("");
                setCandidates([]);

                // ✅ auto-lookup uniquement si correspondance exacte
                if (!nv) {
                  setResult(null);
                  setRame("");
                  setMB("");
                  return;
                }

                const list = idx.byMotrice.get(nv) ?? [];
                if (list.length === 1) {
                  applyRow(list[0]);
                } else if (list.length > 1) {
                  // ambigu : on propose une sélection
                  setResult(null);
                  setRame("");
                  setCandidates(list.slice(0, 20));
                  setWarning("Plusieurs correspondances trouvées (historique) — choisis :");
                }
                // si 0 match => on ne fait rien (pas d’auto-remplissage)
              }}
              inputMode="numeric"
              placeholder="ex: 24001"
            />
          </div>

          <div style={styles.field}>
            <div style={styles.fieldLabel}>Motrice B</div>
            <input
              style={styles.input}
              value={mB}
              onChange={(e) => handleMotriceChange("B", e.target.value)}
              inputMode="numeric"
              placeholder="ex: 24002"
            />
          </div>

          <div style={styles.field}>
            <div style={styles.fieldLabel}>Rame</div>
            <input
              style={styles.input}
              value={rame}
              onChange={(e) => handleRameChange(e.target.value)}
              inputMode="numeric"
              placeholder="ex: 806"
            />
          </div>
        </div>
        <div style={{ ...styles.row, marginTop: 10 }}>
          <button style={styles.btnDanger} onClick={clearAll}>
            Effacer
          </button>
        </div>
        {warning ? <div style={styles.warn}>{warning}</div> : null}

        {candidates.length > 0 ? (
          <div style={styles.candidates}>
            {candidates.map((c, i) => (
              <button key={i} style={styles.candidateBtn} onClick={() => applyRow(c)}>
                Rame {normDigits(c.rame) || c.rame} — {c.motriceA}/{c.motriceB} • {c.serieLabel}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div style={styles.card}>
        {result ? (
          <div style={styles.result}>
            <div><b>Rame:</b> {normDigits(result.rame) || result.rame}</div>
            <div><b>Motrices:</b> {result.motriceA} / {result.motriceB}</div>
            <div><b>Série:</b> {result.serieLabel}</div>

            <div><b>Type:</b> {result.typeRaw?.trim() ? result.typeRaw.trim() : "---"}</div>
            <div><b>Baptême:</b> {result.baptemeRaw?.trim() ? result.baptemeRaw.trim() : "---"}</div>
            <div><b>Livrée:</b> {result.livreeRaw?.trim() ? result.livreeRaw.trim() : "---"}</div>
            <div><b>STF:</b> {result.stfTitulaireRaw?.trim() ? result.stfTitulaireRaw.trim() : "---"}</div>
            <div><b>Mise en service:</b> {result.miseEnServiceRaw?.trim() ? result.miseEnServiceRaw.trim() : "---"}</div>

            <div>
              <b>Radiation / Remarques:</b>{" "}
              {(() => {
                const a = result.radiationRemarqueRaw?.trim() ?? "";
                const b = result.remark?.trim() ?? "";
                const parts = [a, b].filter(Boolean);
                return parts.length ? parts.join(" • ") : "---";
              })()}
            </div>

            <div><b>Statut:</b> {result.status}</div>
          </div>
        ) : (
          <div style={styles.muted}>Saisis une rame ou une motrice.</div>
        )}
      </div>

      <div style={styles.footer}>
        Dataset: {filtered.length} entrées • Source: Wikipédia (via API MediaWiki)
        {" • "}
        Maj:{" "}
        {rows[0]?.extractedAt
          ? new Date(rows[0].extractedAt).toLocaleString("fr-FR", {
              year: "numeric",
              month: "long",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit"
            })
          : "---"}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    padding: 16,
    background: "#0b0b0b",
    color: "#f2f2f2",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial"
  },
  header: { marginBottom: 12 },
  title: { fontSize: 22, fontWeight: 700 },
  sub: { opacity: 0.7, marginTop: 4 },
  card: {
    background: "#141414",
    border: "1px solid #2a2a2a",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12
  },
  row: { display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" },
  label: { opacity: 0.8, minWidth: 70 },
  toggleRow: { display: "flex", gap: 8, flexWrap: "wrap" },
  btnOn: {
    background: "#f2f2f2",
    color: "#111",
    border: "1px solid #f2f2f2",
    borderRadius: 10,
    padding: "8px 12px",
    fontWeight: 700
  },
  btnOff: {
    background: "transparent",
    color: "#f2f2f2",
    border: "1px solid #3a3a3a",
    borderRadius: 10,
    padding: "8px 12px"
  },
  btnDanger: {
    background: "transparent",
    color: "#ffb3b3",
    border: "1px solid #5a2a2a",
    borderRadius: 10,
    padding: "8px 12px"
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 10,
    marginTop: 12
  },
  field: { display: "flex", flexDirection: "column", gap: 6 },
  fieldLabel: { opacity: 0.8, fontSize: 13 },
  input: {
    width: "100%",
    fontSize: 18,
    padding: "12px 12px",
    borderRadius: 12,
    border: "1px solid #333",
    background: "#0f0f0f",
    color: "#f2f2f2",
    outline: "none"
  },
  warn: { marginTop: 10, color: "#ffd27d" },
  candidates: { marginTop: 10, display: "flex", flexDirection: "column", gap: 8 },
  candidateBtn: {
    textAlign: "left",
    borderRadius: 12,
    border: "1px solid #333",
    background: "#0f0f0f",
    color: "#f2f2f2",
    padding: 10
  },
  sectionTitle: { fontWeight: 700, marginBottom: 8 },
  result: { display: "flex", flexDirection: "column", gap: 6 },
  muted: { opacity: 0.7 },
  footer: { opacity: 0.55, fontSize: 12, marginTop: 6 }
};