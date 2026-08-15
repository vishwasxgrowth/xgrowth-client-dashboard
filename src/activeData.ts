// @ts-nocheck
// Swappable data source. XgrowthOps reads `D.*` through this proxy, so we can
// point it at demo data or a live (AdMob + ClickUp) source with no UI changes.
import * as demo from "./data";

let current: any = demo;
export function setDataSource(d: any) { current = d; }
export function resetDataSource() { current = demo; }
const D: any = new Proxy({}, { get: (_t, prop) => current[prop] });
export default D;
