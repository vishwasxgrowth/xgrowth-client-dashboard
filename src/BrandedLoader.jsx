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
//   full     the first screen — a knot hauls a rope the length of the bar
//            and locks it at the far end. The cord it lays is the progress
//            fill itself, so the track is the thing being dragged.
//
//   panel    inside the dashboard — shimmer skeleton rows wearing the same
//   compact  3px left status stripe every task row has, so the placeholder
//            is the shape of the content about to replace it.
//
//   <BrandedLoader full    label="…" />  boot, auth, first load
//   <BrandedLoader panel   label="…" />  tab bodies (inside a card)
//   <BrandedLoader compact label="…" />  modals and side panels

function Rope() {
  return (
    <div className="xgl-rope" aria-hidden="true">
      <span className="xgl-rope__track">
        <span className="xgl-rope__fill" />
        <span className="xgl-rope__lock" />
        <span className="xgl-rope__spark"><i /><i /><i /></span>
      </span>
      <span className="xgl-rope__knot" />
    </div>
  );
}

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
        <Rope />
        {status}
      </div>
    );
  }

  return (
    <div className={cls} role="status" aria-live="polite" aria-busy="true">
      {status}
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
