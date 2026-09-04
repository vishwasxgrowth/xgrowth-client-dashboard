// @ts-nocheck
// Loading indicator for the console.
//
// The markup here matches the boot splash in index.html exactly, and the CSS
// for both lives in that file's inline <style> — see the comment there for
// why. Consequence worth knowing: do NOT move these rules into design.css.
// design.css ships inside the JS bundle, which is the very thing the boot
// splash exists to cover for.
//
// Two treatments, deliberately different:
//
//   Every state is the same shimmer skeleton rows, wearing the 3px left
//   status stripe every task row has, so the placeholder is always the shape
//   of the content about to replace it. `full` adds the brand lockup.
//
//   <BrandedLoader full    label="…" />  boot, auth, first load
//   <BrandedLoader panel   label="…" />  tab bodies (inside a card)
//   <BrandedLoader compact label="…" />  modals and side panels

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

function Rows({ compact }) {
  return (
    <div className="xgl-rows">
      <Row />
      <Row />
      {!compact && <Row />}
    </div>
  );
}

export default function BrandedLoader({ label = "Loading", full = false, panel = false, compact = false }) {
  const cls =
    "xgl" + (full ? " xgl--full" : "") + (panel ? " xgl--panel" : "") + (compact ? " xgl--compact" : "");

  const status = (
    <div className="xgl-status">
      <span className="xgl-dot" />
      {label}
    </div>
  );

  if (full) {
    return (
      <div className={cls} role="status" aria-live="polite" aria-busy="true">
        <div className="xgl-brand">
          <div className="xgl-tile">xG</div>
          <div className="xgl-word">
            <b>xGrowth</b>
            <span>Monetization console</span>
          </div>
        </div>
        {status}
        <Rows compact={false} />
      </div>
    );
  }

  return (
    <div className={cls} role="status" aria-live="polite" aria-busy="true">
      {status}
      <Rows compact={compact} />
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
