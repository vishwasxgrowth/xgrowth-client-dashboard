// @ts-nocheck
// Direct browser call to the AdMob API with the signed-in user's token.
export async function generateMediationReport(accountName, reportSpec, token) {
  const url = "https://admob.googleapis.com/v1alpha/" + accountName + "/mediationReport:generate";
  const resp = await fetch(url, {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ reportSpec }),
  });
  if (!resp.ok) throw new Error("AdMob " + resp.status + ": " + (await resp.text()));
  const text = await resp.text();
  // Response is a JSON array (header/row/footer). Fall back to NDJSON if needed.
  try { return JSON.parse(text); }
  catch { return text.split("\n").filter(Boolean).map((l) => JSON.parse(l)); }
}
