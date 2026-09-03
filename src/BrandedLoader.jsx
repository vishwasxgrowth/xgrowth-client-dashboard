// @ts-nocheck
// Loading indicator for the console.
//
// The markup here is byte-for-byte the same as the boot splash in index.html,
// and the CSS for both lives in that file's inline <style> — see the comment
// there for why. Consequence worth knowing: do NOT move these rules into
// design.css. design.css ships inside the JS bundle, which is exactly the
// thing the boot splash exists to cover for.
//
// Shape follows the console rather than a generic spinner: the sidebar brand
// lockup, the uppercase letterspaced group-header label, and skeleton rows
// wearing the same 3px left status stripe every task row has.
//
//   <BrandedLoader full    label="…" />  full viewport — boot, auth, first load
//   <BrandedLoader panel   label="…" />  inside a card — tab bodies
//   <BrandedLoader compact label="…" />  bare and small — modals, panels

function Row() {
  return (
    <div className="xgl-row">
      <div className="xgl-col">
        <div className="xgl-bar xgl-bar--t" />
        <div className="xgl-bar xgl-bar--s" />
      </div>
      <div className="xgl-av" />
      <div className="xgl-chip" />
    </div>
  );
}

export default function BrandedLoader({ label = "Loading", full = false, panel = false, compact = false }) {
  const cls =
    "xgl" + (full ? " xgl--full" : "") + (panel ? " xgl--panel" : "") + (compact ? " xgl--compact" : "");

  return (
    <div className={cls} role="status" aria-live="polite" aria-busy="true">
      {full && (
        <div className="xgl-brand">
          <div className="xgl-tile">xG</div>
          <div className="xgl-word">
            <b>xGrowth</b>
            <span>Monetization console</span>
          </div>
        </div>
      )}
      <div className="xgl-status">
        <span className="xgl-dot" />
        {label}
      </div>
      <div className="xgl-rows">
        <Row />
        <Row />
        {!compact && <Row />}
      </div>
    </div>
  );
}

// Fades out the index.html boot splash once React has committed its first
// frame. Idempotent, so extra calls are harmless.
export function dismissBootSplash() {
  const el = document.getElementById("xg-boot");
  if (!el || el.classList.contains("xg-boot--done")) return;
  el.classList.add("xg-boot--done");
  window.setTimeout(() => el.remove(), 300);
}
