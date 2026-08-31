// @ts-nocheck
const TEAM_ID = "9012725808";
const base = () => (import.meta.env.VITE_FUNCTIONS_BASE_URL || "").replace(/\/$/, "");
async function cu(path, opts) {
  const b = base(); if (!b) throw new Error("ClickUp proxy not configured");
  const r = await fetch(b + "/clickup/api/v2" + path, opts);
  if (!r.ok) throw new Error("ClickUp " + r.status + ": " + (await r.text()).slice(0, 200));
  return r.json();
}
function fmtCF(f) {
  try {
    const v = f.value;
    if (f.type === "drop_down") { const o = (f.type_config?.options || []).find((x) => x.orderindex === v || x.id === v); return o ? o.name : String(v); }
    if (f.type === "labels") { const opts = f.type_config?.options || []; return (Array.isArray(v) ? v : [v]).map((id) => (opts.find((o) => o.id === id) || {}).label || id).join(", "); }
    if (f.type === "date") return new Date(Number(v)).toLocaleDateString();
    if (f.type === "users") return (Array.isArray(v) ? v : [v]).map((u) => u.username || u).join(", ");
    if (f.type === "currency") return "$" + v;
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  } catch { return ""; }
}
function mapTask(t, listName) {
  return {
    id: t.id, name: t.name,
    status: t.status?.status || "to do", statusColor: t.status?.color || "#9AA0AE",
    assignee: t.assignees?.[0]?.username || null,
    assignees: (t.assignees || []).map((a) => ({ name: a.username, color: a.color, initials: a.initials })),
    priority: t.priority?.priority || null, priorityColor: t.priority?.color || null,
    due: t.due_date ? new Date(Number(t.due_date)).toISOString().slice(0, 10) : null,
    start: t.start_date ? new Date(Number(t.start_date)).toISOString().slice(0, 10) : null,
    created: t.date_created ? Number(t.date_created) : null,
    updated: t.date_updated ? Number(t.date_updated) : null,
    tags: (t.tags || []).map((x) => x.name),
    url: t.url, list: listName, app: null,
    desc: t.text_content || t.description || "",
    customFields: (t.custom_fields || []).filter((f) => f.value !== undefined && f.value !== null && f.value !== "").map((f) => ({ name: f.name, value: fmtCF(f) })),
    subtaskCount: (t.subtasks || []).length,
    commentCount: t.comment_count || 0,
  };
}
export async function getFolderData(folderId, allowedListNames) {
  const folder = await cu("/folder/" + folderId);
  const allow = allowedListNames ? new Set([...allowedListNames].map((name) => String(name).toLowerCase())) : null;
  const lists = (folder.lists || []).filter((list) => !allow || allow.has(String(list.name || "").toLowerCase()));
  const listsMeta = {}; const tasks = [];
  for (const l of lists) {
    listsMeta[l.name] = (l.statuses || []).slice().sort((a, b) => a.orderindex - b.orderindex).map((s) => ({ name: s.status, color: s.color, type: s.type }));
    // One list erroring (rate limit, a transient network hiccup, an
    // unexpected response shape) must not take every other list's tasks down
    // with it — that reads as "some folders are just missing."
    try {
      for (let page = 0; ; page++) {
        const qs = new URLSearchParams({ include_closed: "true", subtasks: "true", page: String(page) });
        const data = await cu("/list/" + l.id + "/task?" + qs.toString());
        const batch = data.tasks || [];
        for (const t of batch) tasks.push(mapTask(t, l.name));
        if (data.last_page === true || batch.length < 100 || page > 50) break;
      }
    } catch (e) {
      console.warn("[clickup] could not load tasks for list \"" + l.name + "\":", e);
    }
  }
  return { listsMeta, tasks };
}
// Real workspace members (id, username, color, initials) — used instead of a
// hardcoded 4-person roster so assignee names/colors/initials are accurate
// for anyone actually assigned in ClickUp, not just a few hand-picked people.
export async function getWorkspaceMembers() {
  const d = await cu("/team");
  const team = (d.teams || []).find((x) => x.id === TEAM_ID) || (d.teams || [])[0];
  const members = (team?.members || []).map((m) => m.user).filter(Boolean);
  return members.map((u) => ({
    name: u.username || u.email || "Unknown",
    initials: (u.initials || "").trim() || null,
    color: u.color || null,
  }));
}
export async function getTaskDetail(taskId) { return cu("/task/" + taskId + "?include_subtasks=true"); }
export async function getTaskComments(taskId) { const d = await cu("/task/" + taskId + "/comment"); return d.comments || []; }
export async function updateTaskStatus(taskId, status) {
  return cu("/task/" + taskId, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
}
