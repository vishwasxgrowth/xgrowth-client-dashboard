// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import D from "../activeData";
import { parseArms, armMetrics } from "../testConfig";
import { C, LISTS, PRIORITIES, STATUSES, card, Empty, groupId, money, compact, pct, shortDate } from "./theme";

const errText = (e) => String((e && e.message) || e || "Unknown error");

function cfValue(f) {
  const v = f.value; if (v == null || v === "") return null;
  const tc = f.type_config || {};
  try {
    if (f.type === "drop_down") { const o = (tc.options || []).find((x) => x.id === v || x.orderindex === v); return o ? o.name : null; }
    if (f.type === "labels") { const opts = tc.options || []; return (Array.isArray(v) ? v : [v]).map((id) => (opts.find((o) => o.id === id) || {}).label || id).join(", "); }
    if (f.type === "date") return new Date(Number(v)).toLocaleDateString();
    if (f.type === "tasks" || f.type === "list_relationship") return (Array.isArray(v) ? v : [v]).map((x) => x.name || x.id).join(", ");
    if (f.type === "users") return (Array.isArray(v) ? v : [v]).map((u) => u.username || u).join(", ");
    if (Array.isArray(v)) return v.map((x) => (x && (x.name || x.label || x.username)) || x).join(", ");
    if (typeof v === "object") return v.name || v.username || null;
    return String(v);
  } catch { return null; }
}

export function Drawer({ tasks, openTask, setOpenTask, patchTask, setTasks, persist, flash }) {
  const ot = tasks.find((t) => t.id === openTask);
  const [detail, setDetail] = useState(null);
  const [comments, setComments] = useState(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!ot || !D.getTaskDetail) return;
    let live = true; setLoading(true); setDetail(null); setComments(null);
    Promise.allSettled([D.getTaskDetail(ot.id), D.getTaskComments ? D.getTaskComments(ot.id) : Promise.resolve([])])
      .then(([d, c]) => { if (!live) return; if (d.status === "fulfilled") setDetail(d.value); if (c.status === "fulfilled") setComments(c.value); })
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [ot && ot.id]);
  if (!ot) return null;
  const doneReal = groupId(ot.status) === "done";
  const setStatus = (v) => {
    patchTask(ot.id, { status: v });
    if (!D.updateTaskStatus) { flash("Updated locally; ClickUp update is not connected"); return; }
    D.updateTaskStatus(ot.id, v)
      .then(() => flash("Updated in ClickUp"))
      .catch((e) => flash("Updated locally; ClickUp update failed: " + errText(e)));
  };
  const d = detail || {};
  const descText = d.markdown_description || d.description || ot.desc || "";
  const codey = /[{}\[\]]|table-embed|waterfalls|"ad_|"name":/.test(descText);
  const cfs = (d.custom_fields || []).map((f) => ({ name: f.name, value: cfValue(f) })).filter((x) => x.value != null && x.value !== "");
  const subtasks = d.subtasks || [];
  const assignees = (d.assignees || []).map((a) => ({ name: a.username, color: a.color, initials: a.initials })).concat(ot.assignees && !d.assignees ? ot.assignees : []);
  const statusOpts = D.LISTS_META && D.LISTS_META[ot.list] ? D.LISTS_META[ot.list].map((x) => x.name) : STATUSES;
  const isUrl = (v) => typeof v === "string" && /^https?:\/\//.test(v);
  const lbl = { fontSize: 10.5, textTransform: "uppercase", color: C.faint, fontWeight: 600, letterSpacing: ".03em" };
  const metaRow = { display: "grid", gridTemplateColumns: "120px 1fr", gap: 12, alignItems: "center", padding: "7px 0" };

  return (
    <div onClick={() => setOpenTask(null)} style={{ position: "absolute", inset: 0, background: C.overlay, display: "flex", alignItems: "center", justifyContent: "center", padding: "6vh 8vw", zIndex: 30 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "84vw", height: "86vh", background: C.surface, color: C.ink, border: "1px solid " + C.line, borderRadius: 10, boxShadow: C.shadow, display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: C.sans }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 20px", borderBottom: "1px solid " + C.line }}>
          <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, color: "#fff", background: ot.statusColor || C.accent }}>{ot.status}</span>
          <span style={{ fontSize: 12, color: C.faint2 }}>{ot.list}</span>
          {ot.url && <a href={ot.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: C.accent }}>Open in ClickUp ↗</a>}
          <div style={{ flex: 1 }} />
          <button onClick={() => setOpenTask(null)} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 24, color: C.faint, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 400px", overflow: "hidden" }}>
          {/* MAIN */}
          <div style={{ overflow: "auto", padding: "20px 24px" }}>
            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 14 }}>{ot.name}</div>
            <div style={{ borderTop: "1px solid " + C.line, borderBottom: "1px solid " + C.line, marginBottom: 18 }}>
              <div style={metaRow}><span style={lbl}>Status</span><select value={ot.status} onChange={(e) => setStatus(e.target.value)} style={{ height: 32, borderRadius: 8, border: "1px solid " + C.line, padding: "0 8px", fontSize: 13, background: C.field, color: C.ink, maxWidth: 260 }}>{statusOpts.map((sn) => <option key={sn}>{sn}</option>)}</select></div>
              <div style={metaRow}><span style={lbl}>Assignees</span><div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{assignees.length ? assignees.map((a, i) => <span key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}><span style={{ width: 22, height: 22, borderRadius: "50%", background: a.color || C.faint2, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700 }}>{a.initials || (a.name || "?")[0]}</span>{a.name}</span>) : <span style={{ color: C.faint2, fontSize: 13 }}>Unassigned</span>}</div></div>
              <div style={metaRow}><span style={lbl}>Priority</span><span style={{ fontSize: 13, color: ot.priorityColor || C.ink, fontWeight: 600 }}>{ot.priority || "—"}</span></div>
              <div style={metaRow}><span style={lbl}>Dates</span><span style={{ fontSize: 13 }}>{ot.start ? shortDate(ot.start) : "—"} → {ot.due ? shortDate(ot.due) : "—"}</span></div>
              {ot.tags && ot.tags.length > 0 && <div style={metaRow}><span style={lbl}>Tags</span><div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>{ot.tags.map((t) => <span key={t} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: C.panel, color: C.sub }}>{t}</span>)}</div></div>}
            </div>

            <div style={{ ...lbl, marginBottom: 8 }}>Description</div>
            {descText ? (codey
              ? <pre style={{ fontSize: 12, lineHeight: 1.5, background: C.panel, color: C.ink, border: "1px solid " + C.line, borderRadius: 8, padding: 14, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0 }}>{descText}</pre>
              : <div style={{ fontSize: 13.5, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{descText}</div>
            ) : <div style={{ fontSize: 13, color: C.faint2 }}>{loading ? "Loading…" : "No description"}</div>}

            {cfs.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={{ ...lbl, marginBottom: 8 }}>Fields</div>
                <div style={{ border: "1px solid " + C.line, borderRadius: 10, overflow: "hidden" }}>
                  {cfs.map((f, i) => (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 10, padding: "9px 14px", borderTop: i ? "1px solid " + C.line : "none", fontSize: 13 }}>
                      <span style={{ color: C.sub }}>{f.name}</span>
                      {isUrl(f.value) ? <a href={f.value} target="_blank" rel="noreferrer" style={{ color: C.accent, wordBreak: "break-all" }}>{f.value}</a> : <span style={{ fontWeight: 500 }}>{f.value}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {subtasks.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={{ ...lbl, marginBottom: 8 }}>Subtasks ({subtasks.length})</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{subtasks.map((st) => <div key={st.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, border: "1px solid " + C.line, borderRadius: 8, padding: "8px 12px" }}><span style={{ width: 8, height: 8, borderRadius: 2, background: st.status?.color || C.faint2 }} />{st.name}<span style={{ flex: 1 }} /><span style={{ fontSize: 11, color: C.faint2 }}>{st.status?.status}</span></div>)}</div>
              </div>
            )}

            <button onClick={() => { const target = statusOpts.find((x) => /done|complete|closed/i.test(x)) || "done"; setStatus(doneReal ? statusOpts[0] : target); }} style={{ marginTop: 22, height: 38, padding: "0 18px", borderRadius: 8, border: "none", background: doneReal ? C.panel : C.forest, color: doneReal ? C.sub : "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>{doneReal ? "Reopen" : "Mark complete"}</button>
          </div>

          {/* ACTIVITY / COMMENTS (right rail) */}
          <div style={{ borderLeft: "1px solid " + C.line, background: C.panel, overflow: "auto", padding: "18px 18px" }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Activity {comments ? "· " + comments.length : ""}</div>
            {loading && !comments && <div style={{ fontSize: 13, color: C.faint2 }}>Loading…</div>}
            {comments && comments.length === 0 && <div style={{ fontSize: 13, color: C.faint2 }}>No comments yet.</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {(comments || []).map((c) => (
                <div key={c.id}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                    <div style={{ width: 26, height: 26, borderRadius: "50%", background: c.user?.color || C.accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}>{c.user?.initials || (c.user?.username || "?")[0]}</div>
                    <b style={{ fontSize: 12.5 }}>{c.user?.username || "User"}</b>
                    <span style={{ fontSize: 11, color: C.faint2 }}>{c.date ? new Date(Number(c.date)).toLocaleString() : ""}</span>
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap", color: C.ink, background: C.surface, border: "1px solid " + C.line, borderRadius: 8, padding: "9px 12px" }}>{c.comment_text || (c.comment || []).map((x) => x.text).join("")}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CreateModal({ modal, setModal, commitCreate }) {
  const m = modal, upd = (k) => (e) => setModal((s) => ({ ...s, [k]: e.target.value }));
  const sel = { width: "100%", height: 34, borderRadius: 8, border: "1px solid " + C.line, padding: "0 8px", fontSize: 13, background: C.field, color: C.ink, marginTop: 4 };
  const lbl = { fontSize: 11, textTransform: "uppercase", color: C.faint, fontWeight: 600 };
  const appOptions = ["— none —", ...D.APPS.map((a) => a.name)];
  if (m.app && !appOptions.includes(m.app)) appOptions.splice(1, 0, m.app);
  return (
    <div onClick={() => setModal(null)} style={{ position: "absolute", inset: 0, background: C.overlay, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 30 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 460, background: C.surface, color: C.ink, border: "1px solid " + C.line, borderRadius: 10, padding: 22, fontFamily: C.sans, boxShadow: C.shadow }}>
        <div className="xg-display" style={{ fontSize: 23, fontWeight: 620, marginBottom: 14 }}>New task</div>
        {m.ctxTitle && <div style={{ background: m.ctxBad ? C.dangerBg : C.forestBg, border: "1px solid " + (m.ctxBad ? C.danger : C.forest), color: m.ctxBad ? C.danger : C.forest, borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: 12.5 }}><b>{m.ctxTitle}</b> · {m.ctxValue}</div>}
        <div style={{ marginBottom: 12 }}><div style={lbl}>Task name</div><input value={m.name} onChange={upd("name")} style={sel} placeholder="What needs doing?" /></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div><div style={lbl}>List</div><select value={m.list} onChange={upd("list")} style={sel}>{LISTS.map((l) => <option key={l}>{l}</option>)}</select></div>
          <div><div style={lbl}>App</div><select value={m.app} onChange={upd("app")} style={sel}>{appOptions.map((l) => <option key={l}>{l}</option>)}</select></div>
          <div><div style={lbl}>Assignee</div><select value={m.assignee} onChange={upd("assignee")} style={sel}>{["Unassigned", ...D.MEMBERS.map((x) => x.name)].map((l) => <option key={l}>{l}</option>)}</select></div>
          <div><div style={lbl}>Priority</div><select value={m.priority} onChange={upd("priority")} style={sel}>{PRIORITIES.map((l) => <option key={l}>{l}</option>)}</select></div>
          <div><div style={lbl}>Due</div><input type="date" value={m.due} onChange={upd("due")} style={sel} /></div>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={() => setModal(null)} style={{ height: 36, padding: "0 16px", borderRadius: 8, border: "1px solid " + C.line, background: C.field, cursor: "pointer", fontSize: 13, fontWeight: 600, color: C.sub }}>Cancel</button>
          <button onClick={commitCreate} style={{ height: 36, padding: "0 18px", borderRadius: 8, border: "none", background: C.accent, color: C.inverse, cursor: "pointer", fontSize: 13, fontWeight: 700 }}>Create task</button>
        </div>
      </div>
    </div>
  );
}

export function TestDetail({ tasks, testId, setTestId, openCreate }) {
  const seed = tasks.find((t) => t.id === testId);
  const [detail, setDetail] = useState(null);
  const [units, setUnits] = useState(null);   // ad-unit metrics map
  const [loading, setLoading] = useState(true);
  const [vi, setVi] = useState(0);            // selected variant index
  const [err, setErr] = useState(null);
  useEffect(() => {
    let live = true; setLoading(true); setErr(null);
    (async () => {
      let d = null;
      try { d = D.getTaskDetail ? await D.getTaskDetail(testId) : null; } catch (e) {}
      if (live) setDetail(d);
      // window from task start/due, else last 14 days
      const end = (seed && seed.due) ? seed.due : D.TODAY;
      const start = (seed && seed.start) ? seed.start : D.rangeDates(14, 1)[0];
      const toRd = (s0) => { const dt = new Date(s0 + "T00:00:00Z"); return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate() }; };
      try { if (D.adUnitReport) { const m = await D.adUnitReport(toRd(start), toRd(end)); if (live) setUnits(m); } }
      catch (e) { if (live) setErr("Couldn't load AdMob per-ad-unit data"); }
      if (live) setLoading(false);
    })();
    return () => { live = false; };
  }, [testId]);

  const desc = (detail && (detail.markdown_description || detail.description)) || (seed && seed.desc) || "";
  const arms = useMemo(() => {
    const parsed = parseArms(desc);
    let variantCount = 0;
    return parsed.map((arm, i) => {
      if (arm.isBaseline) return { ...arm, label: "Baseline" };
      variantCount += 1;
      const totalVariants = parsed.filter((x) => !x.isBaseline).length;
      return { ...arm, label: totalVariants > 1 ? "Variant " + variantCount : "Variant" };
    });
  }, [desc]);
  if (!seed) return null;
  const baseline = arms.find((a) => a.isBaseline) || arms[0];
  const variants = arms.filter((a) => a !== baseline);
  const variant = variants[vi] || null;
  const unitMap = units || {};
  const bM = baseline ? armMetrics(baseline, unitMap) : null;
  const vMs = variants.map((a) => armMetrics(a, unitMap));
  const vM = vMs[vi] || null;

  const pctD = (a, b) => (b ? ((a - b) / b) * 100 : 0);
  const lift = (bM && vM && bM.total && bM.total.revenue) ? pctD(vM.total.revenue, bM.total.revenue) : 0;
  const absD = (bM && vM && bM.total && vM.total) ? vM.total.revenue - bM.total.revenue : 0;
  const anyData = units && Object.keys(units).length > 0;

  const rowsRevenue = [
    ["Estimated earnings", "", (t) => money(t.revenue), (t) => t.revenue, "higher better"],
    ["eCPM", "", (t) => "$" + t.ecpm.toFixed(2), (t) => t.ecpm, "higher better"],
  ];
  const rowsServing = [
    ["Ad requests", "", (t) => compact(t.requests), (t) => t.requests, "context"],
    ["Match requests", "", (t) => compact(t.matched), (t) => t.matched, "higher better"],
    ["Match rate", "", (t) => pct(t.matchRate), (t) => t.matchRate, "higher better"],
    ["Impressions", "", (t) => compact(t.impressions), (t) => t.impressions, "higher better"],
    ["Show rate", "", (t) => pct(t.showRate), (t) => t.showRate, "higher better"],
    ["Clicks", "", (t) => compact(t.clicks), (t) => t.clicks, "context"],
    ["CTR", "", (t) => pct(t.ctr), (t) => t.ctr, "context"],
  ];
  const rowsUser = [
    ["ARPU", "", () => "n/a", null, "higher better"],
    ["ARPV", "", () => "n/a", null, "higher better"],
    ["D1 retention", "", () => "n/a", null, "higher better"],
    ["D2 to 3 days retention", "", () => "n/a", null, "higher better"],
  ];
  const chg = (v, b, tone) => { const d = pctD(v, b); const up = d >= 0; const good = tone === "context" ? null : up; const col = good == null ? C.faint2 : good ? C.forest : C.danger; return <span style={{ color: col, fontSize: 12.5, fontWeight: 750, fontVariantNumeric: "tabular-nums" }}>{d >= 0 ? "▲ +" : "▼ "}{d.toFixed(1)}%</span>; };

  const MetricTable = ({ title, rows }) => (
    <>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: C.faint, padding: "16px 14px 8px" }}>{title}</div>
      {rows.map(([name, subd, fmt, get, reading], i) => {
        const safe = (fn, arg) => { try { return arg ? fn(arg) : "n/a"; } catch (e) { return "n/a"; } };
        const bVal = get ? safe(fmt, bM && bM.total) : "n/a";
        const variantVals = variants.map((_, idx) => get ? (vMs[idx] ? safe(fmt, vMs[idx].total) : "—") : "n/a");
        let change = <span style={{ color: C.faint2 }}>n/a</span>;
        try { if (get && bM && vM) change = chg(get(vM.total), get(bM.total), reading); } catch (e) {}
        return (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr repeat(" + Math.max(1, variants.length) + ",1fr) 100px", gap: 8, alignItems: "center", padding: "10px 14px", borderTop: "1px solid " + C.line, fontSize: 13 }}>
            <div><div style={{ fontWeight: 600 }}>{name}</div>{subd && <div style={{ fontSize: 11, color: C.faint2 }}>{subd}</div>}</div>
            <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{bVal}</span>
            {variantVals.length ? variantVals.map((value, idx) => <span key={idx} style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{value}</span>) : <span style={{ textAlign: "right", color: C.faint2 }}>—</span>}
            <span style={{ textAlign: "right" }}>{change}</span>
          </div>
        );
      })}
    </>
  );

  const JsonCard = ({ arm }) => (
    <div style={{ border: "1px solid " + C.line, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ padding: "10px 14px", borderBottom: "1px solid " + C.line, display: "flex", alignItems: "center", gap: 8, background: C.panel }}>
        <b style={{ fontSize: 12.5 }}>{arm ? arm.label : "—"}</b>
        <div style={{ flex: 1 }} />
        {arm && (arm.error ? <span style={{ fontSize: 10.5, fontWeight: 700, color: C.danger, background: C.dangerBg, padding: "2px 7px", borderRadius: 6 }}>invalid JSON</span>
          : <span style={{ fontSize: 10.5, fontWeight: 700, color: C.forest, background: C.forestBg, padding: "2px 7px", borderRadius: 6 }}>✓ valid</span>)}
      </div>
      {arm && arm.error && <div style={{ fontSize: 11.5, color: C.danger, padding: "8px 14px", background: C.dangerBg }}>{arm.error}</div>}
      <pre style={{ margin: 0, padding: 14, fontSize: 11.5, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 320, overflow: "auto" }}>{arm ? (arm.json ? JSON.stringify(arm.json, null, 2) : arm.raw) : "No config found"}</pre>
    </div>
  );

  return (
    <div onClick={() => setTestId(null)} style={{ position: "absolute", inset: 0, background: C.overlay, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "5vh 6vw", zIndex: 30, overflow: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "88vw", maxWidth: 1060, background: C.surface, color: C.ink, border: "1px solid " + C.line, borderRadius: 10, boxShadow: C.shadow, fontFamily: C.sans }}>
        {/* header */}
        <div style={{ padding: "20px 24px", borderBottom: "1px solid " + C.line, background: C.panel }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, color: "#fff", background: seed.statusColor || C.accent }}>{seed.status}</span>
            <span style={{ fontSize: 12, color: C.faint2 }}>{seed.list} · {seed.start ? shortDate(seed.start) : "—"} → {seed.due ? shortDate(seed.due) : "—"}</span>
            {seed.url && <a href={seed.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: C.accent }}>Open in ClickUp ↗</a>}
            <div style={{ flex: 1 }} />
            <button onClick={() => setTestId(null)} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 22, color: C.faint }}>×</button>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.faint, letterSpacing: ".04em", textTransform: "uppercase" }}>Overall lift · Estimated earnings</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, margin: "4px 0 2px" }}>
            <div style={{ fontSize: 40, fontWeight: 700, color: !anyData ? C.faint2 : lift >= 0 ? C.forest : C.danger, fontVariantNumeric: "tabular-nums" }}>{!anyData ? "—" : (lift >= 0 ? "+" : "") + lift.toFixed(1) + "%"}</div>
            {anyData && <div style={{ fontSize: 16, color: lift >= 0 ? C.forest : C.danger, fontVariantNumeric: "tabular-nums" }}>{absD >= 0 ? "+" : ""}{money(absD)}</div>}
          </div>
          <div style={{ fontSize: 13, color: C.sub }}>{!variant ? "Add a variant config to compare against the baseline." : !anyData ? "AdMob returned no data for these ad units in the window." : "Test config (" + variant.label + ") is " + (lift >= 0 ? "outperforming" : "underperforming") + " the baseline on revenue."}</div>
          <div style={{ marginTop: 14 }}><button onClick={() => { setTestId(null); openCreate && openCreate({ name: "Follow-up: " + seed.name, list: "Tests & Experiments", assignee: seed.assignee, priority: "high" }); }} style={{ height: 34, padding: "0 16px", borderRadius: 8, border: "none", background: C.accent, color: C.inverse, cursor: "pointer", fontSize: 13, fontWeight: 700 }}>Create follow-up task</button></div>
        </div>

        <div style={{ padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <b style={{ fontSize: 14 }}>{variants.length ? "Baseline vs " + variants.map((v) => v.label).join(" vs ") : "Config under test"}</b>
            <div style={{ flex: 1 }} />
            {variants.length > 1 && <select value={vi} onChange={(e) => setVi(Number(e.target.value))} style={{ height: 30, borderRadius: 8, border: "1px solid " + C.line, background: C.field, color: C.ink, padding: "0 8px", fontSize: 12.5 }}>{variants.map((v, i) => <option key={i} value={i}>Compare {v.label}</option>)}</select>}
          </div>
          {arms.length === 0 ? <Empty>No JSON config found in the description.</Empty> : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(" + Math.min(3, Math.max(1, arms.length)) + ",minmax(0,1fr))", gap: 14 }}>
              {arms.map((arm, idx) => <JsonCard key={idx} arm={arm} />)}
            </div>
          )}

          <div style={{ marginTop: 20 }}>
            <b style={{ fontSize: 14 }}>All metrics</b>
            {loading ? <div style={{ padding: 20, color: C.faint2, fontSize: 13 }}>Loading AdMob data…</div> : (
              <div style={{ marginTop: 10, border: "1px solid " + C.line, borderRadius: 12, overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr repeat(" + Math.max(1, variants.length) + ",1fr) 100px", gap: 8, padding: "9px 14px", background: C.panel, fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", color: C.faint, letterSpacing: ".03em" }}>
                  <span>Metric</span><span style={{ textAlign: "right" }}>Baseline</span>{variants.length ? variants.map((v, idx) => <span key={idx} style={{ textAlign: "right" }}>{v.label}</span>) : <span style={{ textAlign: "right" }}>Variant</span>}<span style={{ textAlign: "right" }}>Change</span>
                </div>
                <MetricTable title="Revenue & efficiency" rows={rowsRevenue} />
                <MetricTable title="Ad serving" rows={rowsServing} />
                <MetricTable title="User level" rows={rowsUser} />
              </div>
            )}
            {err && <div style={{ marginTop: 10, fontSize: 12, color: C.warn }}>⚠ {err}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
