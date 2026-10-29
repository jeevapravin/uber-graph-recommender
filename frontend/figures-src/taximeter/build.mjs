// Builds figures/taximeter.js: a mechanical taximeter whose drums show
// fare = base + perKm × km + perMin × min. Run: node figures-src/taximeter/build.mjs [--light]
// (--light only changes the preview page; the script follows the site's theme).
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../kit/iso-kit.mjs";
import * as G from "../kit/lathe.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "figures", "taximeter.js");
const light = process.argv.includes("--light");

const WIDTH = 600;
const HEIGHT = 440;

// World units are roughly millimetres of a real meter. x right, y toward the front, z up.
const PLATE = { x: -84, y: -50, w: 168, d: 112, r: 8 };
const PLATE_H = 8;
const FOOT_H = 5;

const FOOT = { x: -22, y: -20, w: 44, d: 40, r: 3 };
const STEM = [0, -2];
const STEM_R = 6;
const SADDLE = { x: -32, y: -24, w: 64, d: 50, r: 2 };
const SADDLE_Z = 42;
const BODY = { x: -45, y: -22, w: 90, d: 44, r: 4 };
const BODY_Z = 48;
const LID_Z = 100;
const TOP = 108;
const FRONT = BODY.y + BODY.d;
const SIDE = BODY.x + BODY.w;

const GEARBOX = { x: 26, y: 0, w: 22, d: 22, r: 3 };
const GEAR_H = 12;
const CABLE = [37, 11];
const COUPLING = { z: GEAR_H, h: 6, r: 4.6 };
const FERRULE = { z: 40, h: 8, r: 3.6 };

const FARE = { x0: -19, x1: 34, z0: 73, z1: 94, r: 2, depth: 3, drums: 4 };
const KM = { x0: -38, x1: -7, z0: 55, z1: 67, r: 1.6, depth: 2.4, drums: 3 };
const MIN = { x0: 7, x1: 34, z0: 55, z1: 67, r: 1.6, depth: 2.4, drums: 3 };
const PIVOT = [-36, 89];
const FLAG_Y = FRONT + 2.2;
const FLAG_T = 1.2;
const KNOB = [SIDE, 2, 76];

const P = k.fitProjection(
  [
    ...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0),
    ...k.boxCorners(BODY, BODY_Z, TOP),
    [PIVOT[0] - 34, FLAG_Y, PIVOT[1] + 36],
    [PIVOT[0] - 36, FLAG_Y, PIVOT[1] - 34],
    [SIDE + 12, KNOB[1], KNOB[2]],
  ],
  WIDTH,
  HEIGHT,
  { pad: 18, azimuth: 58 },
);

const at = (point) => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const byDepth = (points) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
const planeOf = (y) => k.sideMatrix([0, y], 0, P, "left");
// A rounded rectangle in front-plane coordinates (u = x, v = −z).
const flat = (x0, z0, x1, z1, r, steps = 6) => k.pathOf(k.roundedPlan({ x: x0, y: z0, w: x1 - x0, d: z1 - z0, r }, steps).map(([u, z]) => [u, -z]), true);
const onFront = (points, y = FRONT) => k.pathOf(points.map(([x, z]) => at([x, y, z])));

let ids = 0;
// A window let into the front face: recess walls, a back plate with `back` on it, clipped by the opening.
function recess({ x0, x1, z0, z1, r, depth }, y, back) {
  const id = `txID-clip-${ids++}`;
  const ring = k.roundedPlan({ x: x0, y: z0, w: x1 - x0, d: z1 - z0, r }, 6);
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const { sinA } = k.cameraOf(P);
  const tops = [];
  const sides = [[], [], [], []];
  ring.forEach(([ax, az], index) => {
    const [bx, bz] = ring[(index + 1) % ring.length];
    const length = Math.hypot(bx - ax, bz - az) || 1;
    let [nx, nz] = [(bz - az) / length, -(bx - ax) / length];
    if (nx * (cx - (ax + bx) / 2) + nz * (cz - (az + bz) / 2) < 0) [nx, nz] = [-nx, -nz];
    if (nx <= 0 && nz <= 0) return;
    const quad = k.pathOf([at([ax, y, az]), at([bx, y, bz]), at([bx, y - depth, bz]), at([ax, y - depth, az])], true);
    if (nz >= nx) tops.push(quad);
    else sides[Math.min(3, Math.max(0, Math.floor(((nx * -sinA + 1) / 2) * 4)))].push(quad);
  });
  const shape = flat(x0, z0, x1, z1, r);
  return [
    `<clipPath id="${id}"><path transform="${planeOf(y)}" d="${shape}"/></clipPath>`,
    `<g clip-path="url(#${id})">`,
    `<g transform="${planeOf(y - depth)}"><path class="tx-well" d="${shape}"/>${back}<path class="iso-line" data-tone="faint" d="${shape}"/></g>`,
    `<path class="iso-top" d="${tops.join("")}"/>`,
    ...sides.map((d, shade) => (d.length ? `<path class="iso-shade" data-shade="${shade}" d="${d.join("")}"/>` : "")),
    `</g>`,
    `<g transform="${planeOf(y)}"><path class="iso-line" data-tone="lo" d="${shape}"/></g>`,
  ].join("");
}

// Number drums seen through a window: each drum is a strip 0–9,0 that the live code rolls by translate.
function drums(win, name, { lit = false, point = -1 } = {}) {
  const pitch = win.z1 - win.z0;
  const width = (win.x1 - win.x0) / win.drums;
  const size = pitch * 0.72;
  const mid = -(win.z0 + win.z1) / 2 + size * 0.36;
  const out = [];
  for (let i = 0; i < win.drums; i++) {
    const cx = win.x0 + width * (i + 0.5);
    const digits = Array.from({ length: 11 }, (_, j) => `<text x="${cx.toFixed(2)}" y="${(mid + j * pitch).toFixed(2)}">${j % 10}</text>`).join("");
    out.push(`<g class="tx-digits"${lit ? " data-lit" : ""} data-drum="${name}-${i}" font-size="${size.toFixed(2)}">${digits}</g>`);
  }
  // The drums are round: shade toward the top and bottom of the window, where the faces turn away.
  const gid = `txID-curve-${name}`;
  out.push(
    `<linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="0" y1="${-win.z1}" x2="0" y2="${-win.z0}">` +
      `<stop offset="0" class="tx-curve" stop-opacity=".95"/><stop offset=".3" class="tx-curve" stop-opacity="0"/>` +
      `<stop offset=".7" class="tx-curve" stop-opacity="0"/><stop offset="1" class="tx-curve" stop-opacity=".95"/></linearGradient>`,
    `<path fill="url(#${gid})" d="${flat(win.x0, win.z0, win.x1, win.z1, 0, 1)}"/>`,
  );
  const seams = [];
  for (let i = 1; i < win.drums; i++) {
    const x = win.x0 + width * i;
    seams.push(`M${x.toFixed(2)} ${-win.z1}V${-win.z0}`);
  }
  out.push(`<path class="iso-line" data-tone="lo" d="${seams.join("")}"/>`);
  // A printed decimal point between the units drum and the tenths drum.
  if (point >= 0) out.push(`<circle class="tx-point" cx="${(win.x0 + width * point).toFixed(2)}" cy="${-win.z0 - 1.6}" r=".7"/>`);
  return recess(win, FRONT, out.join(""));
}

// Knurl ribs on a round part, pre-built at `frames` phases so the live code can turn it by swapping frames.
function turningRibs(F, s0, s1, r, count, name, frames = 8) {
  const out = [];
  for (let f = 0; f < frames; f++) {
    const ribs = G.ribsOf(F, s0, s1, r, count, P, { phase: ((Math.PI * 2) / count) * (f / frames), fade: [0.04, 0.4] });
    out.push(`<g data-${name}="${f}"${f ? ' style="display:none"' : ""}>${k.fadedSvg(ribs, { tone: "lo" })}</g>`);
  }
  return out.join("");
}

function plate() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(PLATE, 20))) {
    out.push(S(k.cylinder(x, y, 7, -PLATE_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 5.4, -PLATE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
  }
  out.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.6), { tone: "lo" }));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: "faint" }));
  const screws = k.corners(PLATE, 10);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  // Calibration plate: the meter's sealed tariff card, three printed rules.
  const label = { x: 36, y: 40, w: 38, d: 12, r: 1.2 };
  out.push(S(k.slabOf(label, 0, 0.8, P, 3), { tone: "lo", crease: "none" }));
  out.push(L([28, 22, 26].map((w, i) => k.lineOnTop([label.x + 4, label.y + 3 + i * 3], [label.x + 4 + w, label.y + 3 + i * 3], 0.8, P)).join(""), { tone: "lo", free: true }));
  out.push(D([at([label.x + 2, label.y + label.d / 2, 0.8]), at([label.x + label.w - 2, label.y + label.d / 2, 0.8])], { size: 0.42 }));
  // Ruler strip along the front edge, ticks every 4 with a major every 5th.
  const strip = { x: -74, y: PLATE.y + PLATE.d - 13, w: 100, d: 6, r: 1 };
  out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(strip.x + 4, strip.x + strip.w - 4, 4, 5, strip.y + 0.6, 0.6, [1.6, 3], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  return out.join("");
}

function gearbox() {
  const out = [`<path class="iso-halo" d="${k.haloOf(GEARBOX, 0, GEAR_H, P)}" style="filter:blur(4px)"/>`];
  out.push(S(k.slabOf(GEARBOX, 0, 2, P, 3, 0.4), { tone: "mid" }));
  out.push(S(k.slabOf(k.insetPlan(GEARBOX, 1.2), 2, GEAR_H - 2, P, 3, 0.6), { tone: "mid", inner: L(k.sideSeam(k.insetPlan(GEARBOX, 1.2), 7, P, 3), { tone: "faint" }) }));
  out.push(L(k.planOutline(k.insetPlan(GEARBOX, 3.4), GEAR_H, P, 3), { tone: "faint" }));
  const screws = k.corners(GEARBOX, 3.2);
  out.push(D(screws.map(([x, y]) => at([x, y, GEAR_H])), { size: 0.45 }));
  // Input coupling from the wheel drive: the knurl turns with the cable, so it turns as km count.
  const F = G.frameAlong([CABLE[0], CABLE[1], COUPLING.z], [0, 0, 1]);
  out.push(S(G.disc(0, COUPLING.h, COUPLING.r, F, P), { tone: "mid" }));
  out.push(turningRibs(F, 0, COUPLING.h, COUPLING.r, 18, "coupling"));
  return out.join("");
}

function cable() {
  const [x, y] = CABLE;
  const out = [];
  const top = FERRULE.z;
  const from = COUPLING.z + COUPLING.h;
  // Armoured sheath: the wrap rings follow the cross-section and end on the outline.
  const wraps = [];
  for (let z = from + 1.6; z < top - 0.8; z += 1.8) wraps.push(k.sideArc(x, y, 2.2, z, P, 14));
  out.push(S(k.cylinder(x, y, 2.2, from, top - from, P, 18), { tone: "mid", crease: "none", inner: L(wraps.join(""), { tone: "faint" }) }));
  const F = G.frameAlong([x, y, top], [0, 0, 1]);
  out.push(S(G.disc(0, FERRULE.h, FERRULE.r, F, P), { tone: "mid" }));
  out.push(k.fadedSvg(G.ribsOf(F, 0, FERRULE.h, FERRULE.r, 16, P, { fade: [0.04, 0.4] }), { tone: "lo" }));
  return out.join("");
}

function bracket() {
  const out = [];
  out.push(S(k.slabOf(FOOT, 0, 3, P, 3, 0.5), { tone: "mid" }));
  const bolts = byDepth(k.corners(FOOT, 5));
  for (const [x, y] of bolts) out.push(S(k.cylinder(x, y, 2.4, 3, 1.4, P, 6), { tone: "mid" }));
  out.push(D(bolts.map(([x, y]) => at([x, y, 4.4])), { size: 0.4, tone: "lo" }));
  const [sx, sy] = STEM;
  out.push(S(k.cylinder(sx, sy, STEM_R + 2, 3, 3, P, 32), { tone: "mid" }));
  out.push(S(k.cylinder(sx, sy, STEM_R, 6, 12, P, 32), { tone: "mid", crease: "none" }));
  // Height collar with a thumb screw toward the viewer.
  out.push(S(k.cylinder(sx, sy, STEM_R + 2.4, 18, 6, P, 32, 0.4), { tone: "mid" }));
  const F = G.frameAlong([sx, sy + STEM_R + 2.4, 21], [0, 1, 0]);
  out.push(S(G.disc(0, 2, 1.6, F, P), { tone: "mid" }));
  out.push(S(G.disc(2, 5.4, 3.2, F, P), { tone: "mid" }));
  out.push(k.fadedSvg(G.ribsOf(F, 2, 5.4, 3.2, 14, P, { fade: [0.04, 0.4] }), { tone: "lo" }));
  out.push(S(k.cylinder(sx, sy, STEM_R, 24, SADDLE_Z - 24, P, 32), { tone: "mid", crease: "none", inner: L(k.sideArc(sx, sy, STEM_R, 33, P, 20), { tone: "faint" }) }));
  // Saddle the meter is bolted to; its lip shows in front of the case.
  out.push(S(k.slabOf(SADDLE, SADDLE_Z, BODY_Z - SADDLE_Z, P, 3, 0.5), { tone: "mid" }));
  out.push(L(k.lineOnTop([SADDLE.x, FRONT + 1], [SADDLE.x + SADDLE.w, FRONT + 1], BODY_Z, P), { tone: "faint" }));
  const lip = [SADDLE.x + 5, SADDLE.x + SADDLE.w - 5];
  out.push(L(lip.map((x) => k.ring(x, FRONT + 2, 1.1, BODY_Z, P, 12)).join(""), { tone: "lo" }));
  out.push(D(lip.map((x) => at([x, FRONT + 2, BODY_Z])), { size: 0.4 }));
  return out.join("");
}

function meter() {
  const out = [`<path class="iso-halo" d="${k.haloOf(BODY, BODY_Z - 1, 2, P)}" style="filter:blur(5px)"/>`];
  out.push(S(k.slabOf(BODY, BODY_Z, LID_Z - BODY_Z, P, 6, 0.6), { tone: "mid", inner: L(k.sideSeam(BODY, BODY_Z + 4, P, 6), { tone: "faint" }) }));
  const LID = k.insetPlan(BODY, -0.8);
  out.push(S(k.slabOf(LID, LID_Z, TOP - LID_Z, P, 6, 1.2), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(LID, 4), TOP, P, 6), { tone: "faint" }));
  // Lid screws, one of them wired to a lead seal so nobody can open the meter unseen.
  const lidScrews = [[-38, -15], [38, -15], [-38, 15], [38, 15]];
  out.push(L(lidScrews.map(([x, y]) => k.ring(x, y, 1.8, TOP, P, 14)).join(""), { tone: "lo" }));
  out.push(D(lidScrews.map(([x, y]) => at([x, y, TOP])), { size: 0.45 }));
  // Vent slots on the side, closed slots so their lines end on themselves.
  const vents = [];
  for (let i = 0; i < 5; i++) {
    const y0 = -14 + i * 4.2;
    vents.push(k.pathOf(k.roundedPlan({ x: y0, y: 54, w: 2, d: 8, r: 1 }, 3).map(([u, z]) => at([SIDE, u, z])), true));
  }
  out.push(L(vents.join(""), { tone: "lo" }));
  // Front panel: an inset bead, four screws.
  out.push(`<g transform="${planeOf(FRONT)}"><path class="iso-line" data-tone="faint" d="${flat(-42, 51, 42, 98, 2.4)}"/></g>`);
  const faceScrews = [[-40, 53.5], [40, 53.5], [40, 95.5]];
  out.push(L(faceScrews.map(([x, z]) => k.sideRing([x, FRONT, z], 1.5, "y", P)).join(""), { tone: "lo" }));
  out.push(D(faceScrews.map(([x, z]) => at([x, FRONT, z])), { size: 0.42 }));
  out.push(drums(FARE, "fare", { lit: true }));
  out.push(drums(KM, "km", { point: 2 }));
  out.push(drums(MIN, "min"));
  // The rupee sign is printed on the panel beside the fare window.
  out.push(`<g transform="${planeOf(FRONT)}"><text class="iso-face-text" data-tone="hi" x="${FARE.x0 - 5.5}" y="${-(FARE.z0 + FARE.z1) / 2 + 3.4}" font-size="10" text-anchor="middle">₹</text></g>`);
  // Small ticks under the km and minute windows: one drum division each.
  const tick = (win) => {
    const width = (win.x1 - win.x0) / win.drums;
    const d = [];
    for (let i = 0; i <= win.drums; i++) d.push(onFront([[win.x0 + width * i, win.z0 - 1.6], [win.x0 + width * i, win.z0 - (i === 0 || i === win.drums ? 3.4 : 2.6)]]));
    d.push(onFront([[win.x0, win.z0 - 1.6], [win.x1, win.z0 - 1.6]]));
    return L(d.join(""), { tone: "lo" });
  };
  out.push(tick(KM), tick(MIN));
  return out.join("");
}

function knob() {
  const F = G.frameAlong(KNOB, [1, 0, 0]);
  const out = [];
  out.push(S(G.disc(0, 1.6, 8, F, P), { tone: "mid" }));
  out.push(D(G.dotsOf(F, 1.6, 6.4, 6, P, { fade: [0.04, 0.42] }), { size: 0.38 }));
  out.push(S(G.disc(1.6, 3.2, 3, F, P), { tone: "mid" }));
  out.push(S(G.disc(3.2, 10.4, 6.4, F, P, { bevel: 0.4 }), { tone: "mid" }));
  out.push(turningRibs(F, 3.2, 10.4, 6.4, 28, "knob"));
  out.push(L(G.circleOf(F, 10.4, 4.6, P, 32), { tone: "lo" }));
  out.push(D([at(G.pointOf(F, 10.4, 0, 0))], { size: 0.5, tone: "hi" }));
  return out.join("");
}

// The FOR HIRE flag: a sheet turning in the plane just in front of the panel, pivot at origin, u right, v down.
const ARM = flat(-2, -6, 2, 32, 2, 4);
const SHEET = flat(-34, 15, -2, 34, 1.6, 4);
const FLAG = `${ARM}${SHEET}`;
function flagSheet(y, last) {
  const inner = last
    ? `<path class="iso-line" data-tone="mid" d="${flat(-32, 17, -4, 32, 1, 4)}"/>` +
      `<text class="iso-face-text tx-hire" data-tone="hi" x="-18" y="-21.6" font-size="5.2" text-anchor="middle">FOR HIRE</text>` +
      `<g class="iso-dots" data-tone="hi"><circle cx="0" cy="-27" r=".5"/></g>`
    : "";
  return `<g data-flag="${y.toFixed(2)}"><path class="${last ? "tx-flag" : "tx-flag-edge"}" d="${FLAG}"/>${inner}</g>`;
}
function flag() {
  const out = [];
  const F = G.frameAlong([PIVOT[0], FRONT, PIVOT[1]], [0, 1, 0]);
  out.push(S(G.disc(0, FLAG_Y - FRONT, 5, F, P), { tone: "mid" }));
  const copies = 4;
  for (let i = 0; i < copies; i++) out.push(flagSheet(FLAG_Y + (FLAG_T * i) / (copies - 1), i === copies - 1));
  return `<g data-part="flag">${out.join("")}</g>`;
}
function pivotNut() {
  const F = G.frameAlong([PIVOT[0], FLAG_Y + FLAG_T, PIVOT[1]], [0, 1, 0]);
  return S(G.disc(0, 1.8, 2.6, F, P), { tone: "mid" }) + D([at(G.pointOf(F, 1.8, 0, 0))], { size: 0.45, tone: "hi" });
}

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "A mechanical taximeter on a dashboard bracket. A cable from the wheel gearbox turns the kilometre drums, a clock turns the minute drums, and the fare drums add up base fare plus a rate per kilometre and a rate per minute. The FOR HIRE flag drops when the meter is hired.",
  body: [plate(), bracket(), gearbox(), cable(), meter(), knob(), flag(), pivotNut()],
});

// Pre-composed transforms for each flag sheet copy (plane matrix, then a rotation about the pivot).
const flagPlanes = {};
for (let i = 0; i < 4; i++) {
  const y = FLAG_Y + (FLAG_T * i) / 3;
  flagPlanes[y.toFixed(2)] = planeOf(y);
}
const flagShift = `translate(${PIVOT[0]} ${-PIVOT[1]})`;

const CSS = `
.tx-fig{container-type:inline-size}
.tx-fig .iso-figure{margin:0}
.tx-fig .iso-stage{outline:none;cursor:pointer;border-radius:4px}
.tx-fig .iso-stage:focus-visible{box-shadow:0 0 0 2px var(--anatomy-mid)}
.tx-well{fill:var(--anatomy-shade-0)}
.tx-curve{stop-color:var(--anatomy-halo)}
.tx-digits{fill:var(--anatomy-hi);font-family:var(--anatomy-mono);text-anchor:middle;font-weight:600}
.tx-digits[data-lit]{fill:var(--anatomy-lit)}
.tx-point{fill:var(--anatomy-hi)}
.tx-flag{fill:var(--anatomy-face);stroke:var(--anatomy-hi);stroke-width:var(--anatomy-weight);stroke-linejoin:round}
.tx-flag-edge{fill:var(--anatomy-shade-1);stroke:var(--anatomy-mid);stroke-width:var(--anatomy-weight);stroke-linejoin:round}
.tx-hire{letter-spacing:.08em;font-weight:600}
.tx-fig .iso-plate-corner[data-corner="readout"]{white-space:normal;text-align:right;max-width:calc(100% - 9em)}
@container (max-width:560px){
  .tx-fig .iso-plate{padding:44px 10px 66px}
  .tx-fig .iso-plate-corners{inset:14px 12px}
  .tx-fig .iso-plate-corner[data-corner="hint"]{bottom:auto;top:16px;left:0}
  .tx-fig .iso-plate-corner[data-corner="readout"]{max-width:100%;left:0}
}
`;

const card = k.plateHtml({
  fig: "Fig 1",
  title: "Taximeter",
  hint: "Click to pull the flag",
  readout: "vacant",
  keys: [
    { mark: "lit", label: "Fare drums: base + per km + per minute" },
    { mark: "raised", label: "Km and minute drums, driven by the cable and the clock" },
  ],
  body: `<div class="iso-stage" tabindex="0" role="button" aria-label="Taximeter. Press Enter to pull the flag.">${svg}</div>`,
});

const LIVE = String.raw`
const RULES = { AUTO: [30, 10, 1], BIKE: [20, 6, 0.8], MINI: [40, 12, 1.5], SEDAN: [60, 15, 2], SUV: [90, 20, 2.5] };
const DEMO = [["SEDAN", 7.2], ["AUTO", 3.4], ["MINI", 12.6], ["SUV", 18.4], ["BIKE", 5.1]];
// Truth: minutes at 25 km/h, fare = base + perKm·km + perMin·min, rounded, never below base.
const tripOf = (type, km) => {
  const [base, perKm, perMin] = RULES[type];
  const min = Math.round((km / 25) * 60);
  return { type, km, min, base, perKm, perMin, total: Math.max(base, Math.round(base + perKm * km + perMin * min)) };
};
const num = (v) => String(Math.round(v * 10) / 10);
const sentence = (d) => "₹ " + num(d.base) + " + " + num(d.perKm) + "×" + d.km.toFixed(1) + " km + " + num(d.perMin) + "×" + Math.round(d.min) + " min = ₹ " + Math.round(d.total);
// Odometer carry: a drum only turns while every drum below it is passing 9 → 0.
const drumsOf = (value, count) => {
  const out = [];
  for (let p = 0; p < count; p++) {
    const unit = Math.pow(10, p);
    const lower = value - Math.floor(value / unit) * unit;
    const roll = p ? Math.max(0, lower - (unit - 1)) : 0;
    const base = p ? Math.floor(value / unit) : value;
    out.push((((base + roll) % 10) + 10) % 10);
  }
  return out.reverse();
};
const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
let mounts = 0;

function mount(el, opts) {
  opts = opts || {};
  const n = ++mounts;
  if (!document.getElementById("tx-style")) {
    const style = document.createElement("style");
    style.id = "tx-style";
    style.textContent = CSS;
    document.head.appendChild(style);
  }
  el.classList.add("iso", "tx-fig");
  const scheme = matchMedia("(prefers-color-scheme: light)");
  const paint = () => el.setAttribute("data-theme", opts.theme || (scheme.matches ? "light" : "dark"));
  paint();
  if (!opts.theme) scheme.addEventListener("change", paint);
  el.innerHTML = CARD.replace(/txID/g, "tx" + n);
  const stage = el.querySelector(".iso-stage");
  const readout = el.querySelector("[data-readout]");
  const still = matchMedia("(prefers-reduced-motion: reduce)");
  const pitch = { fare: FARE_PITCH, km: KM_PITCH, min: MIN_PITCH };
  const drumEls = { fare: [], km: [], min: [] };
  for (const name of ["fare", "km", "min"]) for (let i = 0; i < DRUMS[name]; i++) drumEls[name].push(el.querySelector('[data-drum="' + name + "-" + i + '"]'));
  const flagEls = [...el.querySelectorAll("[data-flag]")];
  const frames = (name) => [...el.querySelectorAll("[data-" + name + "]")];
  const knobFrames = frames("knob"), couplingFrames = frames("coupling");

  // Animated state: flag 0 = up (vacant), 1 = down (hired), on a spring with a detent overshoot.
  const s = { km: 0, min: 0, fare: 0, flag: 0, flagRate: 0, flagTarget: 0, knob: 0 };
  let tween = null, queue = [], clock = 0, data = null, touring = true, demo = 0;
  let frame = 0, last = 0, visible = false;
  const shown = { fare: "", km: "", min: "", flag: "", knob: -1, coupling: -1 };

  const roll = (to, dur) => { tween = { from: { km: s.km, min: s.min, fare: s.fare }, to, t0: clock, dur }; };
  const at = (delay, fn) => queue.push({ at: clock + delay, fn });
  const say = (text) => { if (readout.textContent !== text) readout.textContent = text; stage.setAttribute("aria-label", "Taximeter: " + text); };

  // Hire: drop the flag, the drums jump to the flag-down fare, then km and minutes count up.
  function hire(d, prefix) {
    queue = [];
    s.flagTarget = 1;
    roll({ km: 0, min: 0, fare: d.base }, s.fare > d.base ? 0.7 : 0.4);
    at(0.75, () => roll({ km: d.km, min: d.min, fare: d.total }, 2.6));
    say(prefix + sentence(d));
  }
  function vacate() {
    queue = [];
    s.flagTarget = 0;
    roll({ km: 0, min: 0, fare: 0 }, 0.9);
    say("vacant · flag up");
  }
  function nextDemo() {
    const [type, km] = DEMO[demo++ % DEMO.length];
    const d = tripOf(type, km);
    hire(d, "demo · " + type + " · ");
    at(6.2, vacate);
    at(8.0, nextDemo);
  }
  function settleNow() {
    if (tween) { Object.assign(s, tween.to); tween = null; }
    for (const q of queue.splice(0)) if (q.fn !== nextDemo && q.fn !== vacate) q.fn();
    if (tween) { Object.assign(s, tween.to); tween = null; }
    s.flag = s.flagTarget; s.flagRate = 0;
  }

  function draw() {
    const fare = drumsOf(Math.max(0, s.fare), 4);
    const km = drumsOf(Math.max(0, s.km * 10), 3);
    const min = drumsOf(Math.max(0, s.min), 3);
    const put = (name, list) => {
      const key = list.map((v) => v.toFixed(3)).join();
      if (shown[name] === key) return;
      shown[name] = key;
      list.forEach((v, i) => drumEls[name][i].setAttribute("transform", "translate(0 " + (-v * pitch[name]).toFixed(3) + ")"));
    };
    put("fare", fare); put("km", km); put("min", min);
    const angle = (-90 * s.flag).toFixed(2);
    if (shown.flag !== angle) {
      shown.flag = angle;
      for (const g of flagEls) g.setAttribute("transform", PLANES[g.getAttribute("data-flag")] + " " + SHIFT + " rotate(" + angle + ")");
    }
    const swap = (list, key, phase) => {
      const f = ((Math.floor(phase * list.length) % list.length) + list.length) % list.length;
      if (shown[key] === f) return;
      if (shown[key] >= 0) list[shown[key]].style.display = "none";
      list[f].style.display = "";
      shown[key] = f;
    };
    // The cable drives the km drums: one rib pitch of the coupling per 20 m. The knob turns while resetting.
    swap(couplingFrames, "coupling", s.km * 50);
    swap(knobFrames, "knob", s.knob);
  }

  function tick(now) {
    const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
    last = now;
    clock += dt;
    queue.sort((a, b) => a.at - b.at);
    while (queue.length && queue[0].at <= clock) queue.shift().fn();
    if (tween) {
      const e = ease((clock - tween.t0) / tween.dur);
      const before = s.fare;
      for (const key of ["km", "min", "fare"]) s[key] = tween.from[key] + (tween.to[key] - tween.from[key]) * e;
      if (s.fare < before) s.knob += (before - s.fare) * 0.05 + dt * 1.5;
      if (e >= 1) tween = null;
    }
    // Flag spring: stiff with light damping, so it lands on its stop with a small bounce.
    for (let i = 0; i < 4; i++) {
      s.flagRate += ((s.flagTarget - s.flag) * 260 - s.flagRate * 18) * (dt / 4);
      s.flag += s.flagRate * (dt / 4);
    }
    if (Math.abs(s.flagTarget - s.flag) < 0.001 && Math.abs(s.flagRate) < 0.001) { s.flag = s.flagTarget; s.flagRate = 0; }
    draw();
    const busy = tween || queue.length || s.flagRate !== 0;
    frame = visible && busy ? requestAnimationFrame(tick) : 0;
  }
  const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };

  function set(d) {
    if (d) {
      const rule = RULES[d.type] || [0, 0, 0];
      data = {
        type: d.type || "",
        km: +d.km || 0,
        min: +d.min || 0,
        base: d.base != null ? +d.base : rule[0],
        perKm: d.perKm != null ? +d.perKm : rule[1],
        perMin: d.perMin != null ? +d.perMin : rule[2],
      };
      data.total = d.total != null ? +d.total : Math.max(data.base, Math.round(data.base + data.perKm * data.km + data.perMin * data.min));
      touring = false;
      hire(data, data.type ? data.type + " · " : "");
    } else {
      data = null;
      touring = true;
      vacate();
      if (!still.matches) at(1.4, nextDemo);
    }
    if (still.matches) {
      if (!d) { touring = false; hire(tripOf("SEDAN", 7.2), "demo · SEDAN · "); }
      settleNow();
      draw();
    }
    run();
  }

  const pull = () => {
    if (data) { hire(data, data.type ? data.type + " · " : ""); }
    else if (s.flagTarget) { vacate(); at(2.4, nextDemo); }
    else nextDemo();
    if (still.matches) { settleNow(); draw(); }
    run();
  };
  const onKey = (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); pull(); } };
  stage.addEventListener("click", pull);
  stage.addEventListener("keydown", onKey);
  const io = new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" });
  io.observe(stage);
  draw();
  set(opts.data || null);

  return {
    set,
    destroy() {
      cancelAnimationFrame(frame);
      frame = 0;
      visible = false;
      io.disconnect();
      scheme.removeEventListener("change", paint);
      el.innerHTML = "";
      el.classList.remove("iso", "tx-fig");
      el.removeAttribute("data-theme");
    },
  };
}
window.CabFig = window.CabFig || {};
window.CabFig.taximeter = { mount };
`;

const consts = {
  CSS,
  CARD: card,
  PLANES: flagPlanes,
  SHIFT: flagShift,
  FARE_PITCH: FARE.z1 - FARE.z0,
  KM_PITCH: KM.z1 - KM.z0,
  MIN_PITCH: MIN.z1 - MIN.z0,
  DRUMS: { fare: FARE.drums, km: KM.drums, min: MIN.drums },
};
// Self-check of the live model before writing: fare arithmetic and odometer carry.
const model = new Function(`${LIVE.slice(0, LIVE.indexOf("const ease"))}return { drumsOf, tripOf };`)();
assert.equal(model.tripOf("SEDAN", 7.2).total, 202);
assert.equal(model.tripOf("SEDAN", 7.2).min, 17);
assert.deepEqual(model.drumsOf(202, 4), [0, 2, 0, 2]);
assert.deepEqual(model.drumsOf(199.5, 4).map((v) => +v.toFixed(2)), [0, 1.5, 9.5, 9.5]); // 199.5: hundreds rolls with tens and units
assert.deepEqual(model.drumsOf(150.5, 4).map((v) => +v.toFixed(2)), [0, 1, 5, 0.5]);

const head = Object.entries(consts).map(([name, value]) => `const ${name} = ${JSON.stringify(value)};`).join("\n");
const script = `// Generated by figures-src/taximeter/build.mjs. Do not edit by hand.\n(function () {\n"use strict";\n${head}\n${LIVE}\n})();\n`;
writeFileSync(OUT, script);

// Preview pages for verification: one card on the idle tour, one fed a booking estimate.
const preview = (theme) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Taximeter preview</title><link rel="stylesheet" href="../../figures/iso.css">
<style>body{margin:0;background:${theme === "light" ? "#f2f2ef" : "#0b0b0b"};color:#888;font:14px system-ui}main{width:min(520px,100% - 32px);margin:40px auto;display:grid;gap:32px}</style></head>
<body><main><div id="tour"></div><div id="booked"></div></main>
<script src="../../figures/taximeter.js"></script>
<script>
CabFig.taximeter.mount(document.getElementById("tour"), { theme: "${theme}" });
const m = CabFig.taximeter.mount(document.getElementById("booked"), { theme: "${theme}" });
m.set({ type: "SEDAN", km: 7.2, min: 17, base: 60, perKm: 15, perMin: 2, total: 202 });
window.__tx = m;
</script></body></html>`;
writeFileSync(join(HERE, light ? "preview-light.html" : "preview.html"), preview(light ? "light" : "dark"));
console.log("wrote", OUT, "and", light ? "preview-light.html" : "preview.html");
