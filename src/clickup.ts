// @ts-nocheck
const TEAM_ID = "9012725808";
export async function getClickupTasks(folderId, functionsBase) {
  const base = (functionsBase || "").replace(/\/$/, "");
  if (!base) throw new Error("ClickUp proxy not configured");
  const all = [];
  for (let page = 0; ; page++) {
    const qs = new URLSearchParams({ include_closed: "true", subtasks: "true", page: String(page) });
    qs.append("folder_ids[]", folderId);
    const resp = await fetch(base + "/clickup/api/v2/team/" + TEAM_ID + "/task?" + qs.toString());
    if (!resp.ok) throw new Error("ClickUp proxy " + resp.status);
    const data = await resp.json();
    const batch = data.tasks || [];
    for (const t of batch) all.push({
      id: t.id, name: t.name, status: t.status?.status || "to do",
      assignee: (t.assignees && t.assignees[0] && (t.assignees[0].username || t.assignees[0].email)) || null,
      priority: (t.priority && t.priority.priority) || null,
      due: t.due_date ? new Date(Number(t.due_date)).toISOString().slice(0, 10) : null,
      tags: (t.tags || []).map((x) => x.name), list: t.list?.name || "Tasks", app: null,
    });
    if (data.last_page === true || batch.length < 100 || page > 100) break;
  }
  return all;
}
