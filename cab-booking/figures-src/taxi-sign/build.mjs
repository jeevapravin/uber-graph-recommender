// Taxi roof sign: the driver's availability switch, drawn as a real roof light wired to a rocker on a dash plate.
// node figures-src/taxi-sign/build.mjs        -> public/figures/taxi-sign.js + preview.html (dark)
// node figures-src/taxi-sign/build.mjs --light -> preview-light.html
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import * as k from "../kit/iso-kit.mjs";
import { tubePieces, tubeSvg } from "../kit/tube.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "public", "figures", "taxi-sign.js");
const theme = process.argv.includes("--light") ? "light" : "dark";

const WIDTH = 600;
const HEIGHT = 310;

// World units, z up. The roof slice sits on the left, the dash console on the right.
const PLATE = { x: -150, y: -60, w: 260, d: 124, r: 8 };
const PLATE_H = 10;
const FOOT_H = 5;

const ROOF = { x: -140, y: -48, w: 160, d: 96, r: 6 };
const ROOF_Z = 8;
const ROOF_TOP = 14;
const ROOF_X1 = ROOF.x + ROOF.w;

const TRAY = { x: -118, y: -17, w: 112, d: 34, r: 5 };
const TRAY_Z = 16;
const TRAY_TOP = 19.5;
const BODY = { x: -114, y: -13, w: 104, d: 26, r: 4 };
const BODY_TOP = 46;
const FRONT = BODY.y + BODY.d;
const END = BODY.x + BODY.w;
const CAP = { x: -110, y: -10, w: 96, d: 20, r: 3 };
const CAP_TOP = 49.5;
const LENS = { x0: -106, x1: -18, z0: 25, z1: 42, r: 3, depth: 1.4 };

const X = -16; // console shift along x
const CONSOLE = { x: 58 + X, y: -26, w: 56, d: 52, r: 4 };
const CONSOLE_TOP = 20;
const DASH = { x: 62 + X, y: -22, w: 48, d: 44, r: 2.5 };
const DASH_TOP = 21;
const GLAND = [68 + X, -13];
const GLAND_TOP = 25.5;
const BEZEL = { x: 80 + X, y: -11, w: 18, d: 22, r: 2 };
const BEZEL_TOP = 23;
const PADDLE = { x0: 82 + X, x1: 96 + X, y0: -9, y1: 9, z0: 23.2, z1: 26.2 };
const HINGE_Z = 23.2;
const ON_ANGLE = -9;
const OFF_ANGLE = 9;
const GUARD = { x0: 77 + X, x1: 101 + X, y: 14, top: 31 };
const LED = [105 + X, 14];
const FUSE = [105 + X, -12];

const CABLE_R = 1.35;
const START = [END, 0, 29];
const ROUTE = Array.from({ length: 48 }, (_, i) => {
  const t = i / 47;
  const a = START, b = [END + 30, 0, 27], c = [GLAND[0], GLAND[1], 50], d = [GLAND[0], GLAND[1], GLAND_TOP];
  const u = 1 - t;
  return [0, 1, 2].map((n) => u * u * u * a[n] + 3 * u * u * t * b[n] + 3 * u * t * t * c[n] + t * t * t * d[n]);
});

// Self-check: the cable clears the roof edge, the drip rail and the console top before it drops into its gland.
for (const [x, , z] of ROUTE) {
  if (x <= ROOF_X1 + 2) assert.ok(z > ROOF_TOP + 2.4 + CABLE_R * 2, `cable sags into the roof at x=${x.toFixed(1)} z=${z.toFixed(1)}`);
  if (x >= CONSOLE.x - 2 && x < GLAND[0] - 4) assert.ok(z > DASH_TOP + CABLE_R * 2, `cable touches the console at x=${x.toFixed(1)}`);
}

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), ...k.boxCorners(CAP, 0, CAP_TOP + 1), [GUARD.x1, GUARD.y, GUARD.top + 2.2], ...ROUTE],
  WIDTH,
  HEIGHT,
  { pad: 30, azimuth: 55 },
);

const at = (point) => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const byDepth = (points, z = 0) => [...points].sort((a, b) => k.depthOf([a[0], a[1], z], P) - k.depthOf([b[0], b[1], z], P));
const frontPlane = (y) => k.sideMatrix([0, y], 0, P, "left");
const endPlane = (x) => k.sideMatrix([x, 0], 0, P, "right");
const flat = (x0, z0, x1, z1, r, steps = 6) => k.pathOf(k.roundedPlan({ x: x0, y: z0, w: x1 - x0, d: z1 - z0, r }, steps).map(([u, z]) => [u, -z]), true);
const screwAt = (x, y, z, ring = 1.6) => L(k.ring(x, y, ring, z, P, 14), { tone: "lo" }) + D([at([x, y, z])], { size: 0.45 });

// A box from eight world corners (bottom ring then top ring), shaded like the kit's extrude. Used for the tilting rocker.
function boxSvg(c) {
  const { sinA, cosA, sinE, cosE } = cameraOf(P);
  const view = [cosA * cosE, sinA * cosE, sinE];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const mid = c.reduce((s, p) => [s[0] + p[0] / 8, s[1] + p[1] / 8, s[2] + p[2] / 8], [0, 0, 0]);
  const faces = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
  const shown = [], edges = new Map();
  const tops = [], shades = [[], [], [], []];
  for (const f of faces) {
    let n = cross(sub(c[f[1]], c[f[0]]), sub(c[f[2]], c[f[0]]));
    const centre = f.reduce((s, i) => [s[0] + c[i][0] / 4, s[1] + c[i][1] / 4, s[2] + c[i][2] / 4], [0, 0, 0]);
    if (n[0] * (centre[0] - mid[0]) + n[1] * (centre[1] - mid[1]) + n[2] * (centre[2] - mid[2]) < 0) n = n.map((v) => -v);
    const len = Math.hypot(...n) || 1;
    n = n.map((v) => v / len);
    const visible = n[0] * view[0] + n[1] * view[1] + n[2] * view[2] > 1e-6;
    f.forEach((a, i) => {
      const b = f[(i + 1) % 4], key = a < b ? a + "-" + b : b + "-" + a;
      edges.set(key, (edges.get(key) || 0) + (visible ? 1 : 0));
    });
    if (!visible) continue;
    const d = pathOf(f.map((i) => iso(c[i], P)), true);
    shown.push(d);
    if (n[2] > 0.6) tops.push(d);
    else shades[Math.min(3, Math.max(0, Math.floor(((n[0] * -sinA + n[1] * cosA + 1) / 2) * 4)))].push(d);
  }
  let outline = "", crease = "";
  for (const [key, count] of edges) {
    if (!count) continue;
    const [a, b] = key.split("-").map(Number);
    const seg = pathOf([iso(c[a], P), iso(c[b], P)]);
    if (count === 1) outline += seg;
    else crease += seg;
  }
  return '<g class="iso-solid"><path class="iso-fill" d="' + shown.join("") + '"/>' +
    shades.map((d, i) => (d.length ? '<path class="iso-shade" data-shade="' + i + '" d="' + d.join("") + '"/>' : "")).join("") +
    (tops.length ? '<path class="iso-top" d="' + tops.join("") + '"/>' : "") +
    '<path class="iso-line iso-crease" data-tone="lo" d="' + crease + '"/><path class="iso-line iso-edge" data-tone="hi" d="' + outline + '"/></g>';
}

// The rocker paddle tilted by `deg` about its hinge (an axis along x), with its I and O marks engraved on top.
function paddleSvg(deg) {
  const t = (deg * Math.PI) / 180, s = Math.sin(t), co = Math.cos(t);
  const turn = ([x, y, z]) => [x, y * co - (z - HINGE_Z) * s, HINGE_Z + y * s + (z - HINGE_Z) * co];
  const { x0, x1, y0, y1, z0, z1 } = PADDLE;
  const ring = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const box = [...ring.map(([x, y]) => turn([x, y, z0])), ...ring.map(([x, y]) => turn([x, y, z1]))];
  const cx = (x0 + x1) / 2;
  const onTop = (pts) => pathOf(pts.map(([x, y]) => iso(turn([x, y, z1]), P)), true);
  const bar = onTop([[cx - 0.5, 3], [cx + 0.5, 3], [cx + 0.5, 7], [cx - 0.5, 7]]);
  const o = onTop(Array.from({ length: 16 }, (_, i) => [cx + 1.9 * Math.cos((i / 16) * Math.PI * 2), -5 + 1.9 * Math.sin((i / 16) * Math.PI * 2)]));
  const lip = pathOf([[x0, y1], [x1, y1]].map(([x, y]) => iso(turn([x, y, z1 - 0.9]), P)));
  return boxSvg(box) + '<path class="iso-line" data-tone="mid" d="' + bar + o + '"/>' + '<path class="iso-line" data-tone="faint" d="' + lip + '"/>';
}

const cameraOf = k.cameraOf, iso = k.iso, pathOf = k.pathOf;

function plate() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(PLATE, 22))) {
    out.push(S(k.cylinder(x, y, 7, -PLATE_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 5.4, -PLATE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
  }
  out.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.6), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: "lo" }));
  const screws = k.corners(PLATE, 10);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  // Ruler strip along the front edge, ticks rooted on its far edge.
  const strip = { x: -40, y: PLATE.y + PLATE.d - 13, w: 130, d: 6, r: 1 };
  out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(strip.x + 4, strip.x + strip.w - 4, 4, 5, strip.y + 0.6, 0.6, [1.8, 3.4], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(D([at([strip.x + 2, strip.y + 3, 0.6]), at([strip.x + strip.w - 2, strip.y + 3, 0.6])], { size: 0.45 }));
  // Label plate: three rule lines stand for printed text.
  const label = { x: -138, y: PLATE.y + PLATE.d - 13, w: 42, d: 8, r: 1.2 };
  out.push(S(k.slabOf(label, 0, 0.8, P, 3), { tone: "lo", crease: "none" }));
  out.push(L(k.planOutline(k.insetPlan(label, 1.4), 0.8, P, 3), { tone: "faint" }));
  out.push(L([26, 18].map((w, i) => k.lineOnTop([label.x + 4, label.y + 2.8 + i * 2.6], [label.x + 4 + w, label.y + 2.8 + i * 2.6], 0.8, P)).join(""), { tone: "lo", free: true }));
  out.push(D([at([label.x + label.w - 3.4, label.y + label.d / 2, 0.8])], { size: 0.45 }));
  return out.join("");
}

function roof() {
  const out = [`<path class="iso-halo" d="${k.haloOf(k.insetPlan(ROOF, 6), 0, 4, P)}" style="filter:blur(6px)"/>`];
  for (const [x, y] of byDepth(k.corners(ROOF, 16))) {
    out.push(S(k.cylinder(x, y, 5.2, 0, 1.4, P, 24), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 3.8, 1.4, 3.6, P, 24), { tone: "mid" }));
  }
  // Headliner foam under the steel skin, then the skin itself with its drip rails.
  out.push(S(k.slabOf(k.insetPlan(ROOF, 3), 5, ROOF_Z - 5, P, 6), { tone: "lo" }));
  out.push(S(k.slabOf(ROOF, ROOF_Z, ROOF_TOP - ROOF_Z, P, 6, 1), { tone: "mid", inner: L(k.sideSeam(ROOF, ROOF_Z + 2, P, 6), { tone: "faint" }) }));
  out.push(L(k.planOutline(k.insetPlan(ROOF, 9), ROOF_TOP, P, 6), { tone: "faint" }));
  for (const y of [ROOF.y + 2, ROOF.y + ROOF.d - 6]) {
    out.push(S(k.slabOf({ x: ROOF.x + 4, y, w: ROOF.w - 8, d: 4, r: 1.6 }, ROOF_TOP, 2.4, P, 4, 0.4), { tone: "mid" }));
    out.push(D(Array.from({ length: 13 }, (_, i) => at([ROOF.x + 14 + i * 11.2, y + 2, ROOF_TOP + 2.4])), { size: 0.4, tone: "lo" }));
  }
  // Shark-fin antenna behind the sign: gasket, stepped fin, cap.
  out.push(S(k.slabOf({ x: 0, y: -36, w: 18, d: 9, r: 3.5 }, ROOF_TOP, 1, P, 6), { tone: "lo" }));
  out.push(S(k.slabOf({ x: 2, y: -34.5, w: 14, d: 6, r: 2.8 }, ROOF_TOP + 1, 6, P, 6, 0.5), { tone: "mid", inner: L(k.sideSeam({ x: 2, y: -34.5, w: 14, d: 6, r: 2.8 }, ROOF_TOP + 3, P, 6), { tone: "faint" }) }));
  out.push(S(k.slabOf({ x: 4, y: -33.5, w: 8, d: 4, r: 2 }, ROOF_TOP + 7, 3, P, 6, 0.4), { tone: "mid" }));
  return out.join("");
}

function sign() {
  const out = [];
  // Light pool the lamp throws onto the roof in front of the lens (dark theme only; see CSS).
  out.push(`<path class="ts-pool" d="${k.planOutline({ x: -112, y: FRONT + 1, w: 100, d: 26, r: 12 }, ROOF_TOP + 0.05, P, 8)}"/>`);
  for (const [x, y] of byDepth(k.corners(TRAY, 9))) {
    out.push(S(k.cylinder(x, y, 4.2, ROOF_TOP, 1.1, P, 24), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 3.1, ROOF_TOP + 1.1, TRAY_Z - ROOF_TOP - 1.1, P, 24), { tone: "mid", crease: "none" }));
  }
  out.push(S(k.slabOf(TRAY, TRAY_Z, TRAY_TOP - TRAY_Z, P, 6, 0.6), { tone: "mid" }));
  out.push(D(byDepth(k.corners(TRAY, 2.4)).map(([x, y]) => at([x, y, TRAY_TOP])), { size: 0.45 }));
  out.push(S(k.slabOf(BODY, TRAY_TOP, BODY_TOP - TRAY_TOP, P, 6, 0.8), { tone: "hi", crease: "lo", inner: L(k.sideSeam(BODY, 22, P, 6), { tone: "faint" }) }));
  out.push(lens());
  out.push(D([29, 38].flatMap((z) => [at([LENS.x0 - 2.2, FRONT, z]), at([LENS.x1 + 2.2, FRONT, z])]), { size: 0.45 }));
  // Strain-relief grommet on the end face where the cable leaves.
  out.push(`<g transform="${endPlane(END)}"><circle class="iso-line ts-grommet" data-tone="mid" cx="0" cy="${-START[2]}" r="3.4"/><circle class="iso-line" data-tone="lo" cx="0" cy="${-START[2]}" r="2.3"/></g>`);
  // Vent slots on the end face, closed outlines.
  out.push(`<g transform="${endPlane(END)}">${[-6, -3, 0, 3, 6].map((y) => `<path class="iso-line" data-tone="faint" d="${flat(y - 0.6, 36, y + 0.6, 43, 0.6, 3)}"/>`).join("")}</g>`);
  out.push(S(k.slabOf(CAP, BODY_TOP, CAP_TOP - BODY_TOP, P, 6, 0.6), { tone: "mid" }));
  out.push(L(k.lineOnTop([CAP.x, 0], [CAP.x + CAP.w, 0], CAP_TOP, P), { tone: "faint" }));
  out.push(D([at([CAP.x + 6, -5, CAP_TOP]), at([CAP.x + CAP.w - 6, 5, CAP_TOP])], { size: 0.45 }));
  return out.join("");
}

// The lens is a shallow recess in the front face; its glass and letters crossfade between dark and lit through --ts-on.
function lens() {
  const { x0, x1, z0, z1, r, depth } = LENS;
  const ring = k.roundedPlan({ x: x0, y: z0, w: x1 - x0, d: z1 - z0, r }, 6);
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const { sinA } = k.cameraOf(P);
  const tops = [], sides = [[], [], [], []];
  ring.forEach(([ax, az], i) => {
    const [bx, bz] = ring[(i + 1) % ring.length];
    const len = Math.hypot(bx - ax, bz - az) || 1;
    let [nx, nz] = [(bz - az) / len, -(bx - ax) / len];
    if (nx * (cx - (ax + bx) / 2) + nz * (cz - (az + bz) / 2) < 0) [nx, nz] = [-nx, -nz];
    if (nx <= 0 && nz <= 0) return;
    const quad = k.pathOf([at([ax, FRONT, az]), at([bx, FRONT, bz]), at([bx, FRONT - depth, bz]), at([ax, FRONT - depth, az])], true);
    if (nz >= nx) tops.push(quad);
    else sides[Math.min(3, Math.max(0, Math.floor(((nx * -sinA + 1) / 2) * 4)))].push(quad);
  });
  const shape = flat(x0, z0, x1, z1, r);
  const glow = flat(x0 + 10, z0 + 3, x1 - 10, z1 - 3, 6, 6);
  const word = (cls) => `<text class="${cls}" x="${cx}" y="${-(z0 + 4.2)}" font-size="12.6" text-anchor="middle">TAXI</text>`;
  const ribs = Array.from({ length: 21 }, (_, i) => `M${(x0 + 4 + i * 4).toFixed(1)} ${-z0}V${-z1}`).join("");
  return [
    `<clipPath id="__ID__-lens"><path transform="${frontPlane(FRONT)}" d="${shape}"/></clipPath>`,
    `<g clip-path="url(#__ID__-lens)">`,
    `<path class="iso-top" d="${tops.join("")}"/>`,
    ...sides.map((d, s) => (d.length ? `<path class="iso-shade" data-shade="${s}" d="${d.join("")}"/>` : "")),
    `<g transform="${frontPlane(FRONT - depth)}">`,
    `<path class="ts-glass" d="${shape}"/><path class="ts-glass-on" d="${shape}"/><path class="ts-glow" d="${glow}"/>`,
    `<path class="ts-ribs" d="${ribs}"/>`,
    word("ts-word"), word("ts-word-on"),
    `<path class="iso-line" data-tone="faint" d="${shape}"/>`,
    `</g></g>`,
    `<g transform="${frontPlane(FRONT)}"><path class="iso-line" data-tone="lo" d="${shape}"/></g>`,
  ].join("");
}

function cable() {
  const pieces = tubePieces(ROUTE, CABLE_R, P, { maxLength: 14, caps: [false, true] });
  return pieces
    .sort((a, b) => k.depthOf(a.mid, P) - k.depthOf(b.mid, P))
    .map((p) => tubeSvg(p, { tone: "mid" }))
    .join("");
}

function consoleBack() {
  const out = [`<path class="iso-halo" d="${k.haloOf(CONSOLE, 0, 6, P)}"/>`];
  out.push(S(k.slabOf(k.insetPlan(CONSOLE, 2.5), 0, 3, P, 6), { tone: "lo" }));
  out.push(S(k.slabOf(CONSOLE, 3, CONSOLE_TOP - 3, P, 6, 1), { tone: "mid", inner: L(k.sideSeam(CONSOLE, 8, P, 6), { tone: "faint" }) }));
  // Vent slots on the console's right face.
  const side = CONSOLE.x + CONSOLE.w;
  const slot = (y) => k.pathOf(k.roundedPlan({ x: y - 0.7, y: 10.5, w: 1.4, d: 6, r: 0.7 }, 3).map(([u, z]) => at([side, u, z])), true);
  out.push(L([-14, -10, -6, -2, 2, 6, 10, 14].map(slot).join(""), { tone: "faint" }));
  out.push(S(k.slabOf(DASH, CONSOLE_TOP, DASH_TOP - CONSOLE_TOP, P, 4), { tone: "lo", crease: "none" }));
  out.push(byDepth(k.corners(DASH, 3), DASH_TOP).map(([x, y]) => screwAt(x, y, DASH_TOP, 1.3)).join(""));
  // Fuse holder with a knurled cap.
  out.push(S(k.cylinder(FUSE[0], FUSE[1], 3, DASH_TOP, 2.4, P, 6), { tone: "mid" }));
  out.push(S(k.cylinder(FUSE[0], FUSE[1], 2.3, DASH_TOP + 2.4, 3, P, 24), { tone: "mid" }));
  out.push(L(k.knurl(FUSE[0], FUSE[1], 2.3, DASH_TOP + 2.4, DASH_TOP + 5.4, 18, P), { tone: "lo" }));
  // Label plate on the dash: rule lines for printed text.
  const label = { x: 63.5 + X, y: -1, w: 13, d: 19, r: 1 };
  out.push(S(k.slabOf(label, DASH_TOP, 0.5, P, 3), { tone: "lo", crease: "none" }));
  out.push(L([9, 6, 8].map((w, i) => k.lineOnTop([label.x + 2, label.y + 4 + i * 3.4], [label.x + 2 + w, label.y + 4 + i * 3.4], DASH_TOP + 0.5, P)).join(""), { tone: "lo", free: true }));
  // Cable gland: hex nut then a domed cap the cable drops into.
  out.push(S(k.cylinder(GLAND[0], GLAND[1], 3.6, DASH_TOP, 2, P, 6), { tone: "mid" }));
  out.push(S(k.cylinder(GLAND[0], GLAND[1], 2.6, DASH_TOP + 2, GLAND_TOP - DASH_TOP - 2, P, 24), { tone: "mid" }));
  out.push(L(k.sideArc(GLAND[0], GLAND[1], 2.6, DASH_TOP + 3.4, P, 16), { tone: "faint" }));
  // Rocker bezel with its dark well.
  out.push(S(k.slabOf(BEZEL, DASH_TOP, BEZEL_TOP - DASH_TOP, P, 4, 0.4), { tone: "mid" }));
  out.push(`<path class="ts-well" d="${k.planOutline(k.insetPlan(BEZEL, 1.8), BEZEL_TOP, P, 3)}"/>`);
  return out.join("");
}

// The near and right lips of the bezel, drawn after the paddle so its lowered end sinks behind them.
function bezelFront() {
  const { x, y, w, d } = BEZEL, t = 1.8;
  const lip = [[x, y + d], [x + w, y + d], [x + w, y], [x + w - t, y], [x + w - t, y + d - t], [x, y + d - t]];
  return S(k.extrude(lip, DASH_TOP, BEZEL_TOP - DASH_TOP, P, { convex: false }), { tone: "mid" });
}

function consoleFront() {
  const out = [];
  // Guard hoop in front of the rocker.
  for (const x of [GUARD.x0, GUARD.x1]) {
    out.push(S(k.slabOf({ x: x - 2, y: GUARD.y - 2, w: 4, d: 4, r: 0.8 }, DASH_TOP, 1.4, P, 3), { tone: "mid" }));
    out.push(S(k.cylinder(x, GUARD.y, 1.1, DASH_TOP + 1.4, GUARD.top - DASH_TOP - 1.4, P, 16), { tone: "mid", crease: "none" }));
  }
  out.push(S(k.slabOf({ x: GUARD.x0 - 1.4, y: GUARD.y - 1.2, w: GUARD.x1 - GUARD.x0 + 2.8, d: 2.4, r: 1.2 }, GUARD.top, 2.2, P, 4, 0.3), { tone: "mid" }));
  // Lock-out padlock, shown while the driver is not allowed online.
  const body = { x: 86 + X, y: GUARD.y + 1.4, w: 7, d: 2.6, r: 0.8 };
  const shackle = `<g transform="${frontPlane(GUARD.y + 2.2)}"><path class="iso-line ts-shackle" data-tone="hi" d="M${87.6 + X} ${-29}V${-31.6}A1.9 1.9 0 0 1 ${91.4 + X} ${-31.6}V${-29}"/></g>`;
  out.push(`<g class="ts-lock" data-part="lock">${S(k.slabOf(body, 23.5, 5.5, P, 3, 0.3), { tone: "hi", crease: "lo" })}${shackle}${D([at([89.5 + X, body.y + body.d, 25.6])], { size: 0.5, tone: "lo" })}</g>`);
  // Pilot LED.
  out.push(S(k.cylinder(LED[0], LED[1], 2.4, DASH_TOP, 0.9, P, 20), { tone: "mid" }));
  out.push(S(k.cylinder(LED[0], LED[1], 1.5, DASH_TOP + 0.9, 1.2, P, 20), { tone: "mid", crease: "none" }));
  out.push(`<circle class="ts-led" data-part="led" cx="${at([LED[0], LED[1], DASH_TOP + 2.1])[0].toFixed(1)}" cy="${at([LED[0], LED[1], DASH_TOP + 2.1])[1].toFixed(1)}" r="1.5"/>`);
  return out.join("");
}

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label: "A taxi roof sign clamped on a slice of car roof, wired to a guarded rocker switch on a dash plate. Switching the rocker lights the TAXI lens: lit means the driver is online and receives ride requests.",
  body: [
    plate(),
    roof(),
    sign(),
    consoleBack(),
    cable(),
    `<g data-part="paddle">${paddleSvg(OFF_ANGLE)}</g>`,
    bezelFront(),
    consoleFront(),
  ],
});

const CSS = `
.ts-stage{cursor:pointer;outline:none;border-radius:4px;-webkit-tap-highlight-color:transparent}
.ts-stage:focus-visible{box-shadow:0 0 0 2px var(--anatomy-mid)}
.ts-stage[aria-disabled="true"]{cursor:not-allowed}
.iso{--ts-glass:#0d0d0d;--ts-glass-on:#efefe9;--ts-word:#3a3a3a;--ts-word-on:#141414;--ts-glow:#ffffff;--ts-pool:#ffffff;--ts-pool-max:.16}
.iso[data-theme="light"]{--ts-glass:#d6d6d2;--ts-glass-on:#ffffff;--ts-word:#9a9a9e;--ts-word-on:#111113;--ts-glow:#ffffff;--ts-pool:#ffffff;--ts-pool-max:0}
.ts-glass{fill:var(--ts-glass)}
.ts-glass-on{fill:var(--ts-glass-on);opacity:var(--ts-on,0)}
.ts-glow{fill:var(--ts-glow);filter:blur(5px);opacity:calc(var(--ts-on,0) * .9)}
.ts-ribs{fill:none;stroke:var(--anatomy-faint);stroke-width:var(--anatomy-weight);vector-effect:non-scaling-stroke;opacity:calc(.9 - var(--ts-on,0) * .5)}
.ts-word,.ts-word-on{font-family:ui-sans-serif,system-ui,-apple-system,"Helvetica Neue",Arial,sans-serif;font-weight:800;letter-spacing:1.6px}
.ts-word{fill:var(--ts-word);opacity:calc(1 - var(--ts-on,0))}
.ts-word-on{fill:var(--ts-word-on);opacity:var(--ts-on,0)}
.ts-pool{fill:var(--ts-pool);stroke:none;filter:blur(8px);opacity:calc(var(--ts-on,0) * var(--ts-pool-max))}
.ts-well{fill:var(--anatomy-shade-0);stroke:var(--anatomy-faint);stroke-width:var(--anatomy-weight);vector-effect:non-scaling-stroke}
.ts-lock{opacity:var(--ts-lock,0)}
.ts-led{fill:var(--anatomy-shade-1);stroke:var(--anatomy-lo);stroke-width:var(--anatomy-weight);vector-effect:non-scaling-stroke}
.ts-stage[data-online] .ts-led{fill:var(--anatomy-green);stroke:var(--anatomy-green);animation:ts-pulse 2.4s ease-in-out infinite}
@keyframes ts-pulse{50%{opacity:.45}}
@media (prefers-reduced-motion:reduce){.ts-stage[data-online] .ts-led{animation:none}}
`;

// Runs in the page: moves the paddle on a spring, eases the lamp, and owns the switch semantics.
const live = `
var P = ${JSON.stringify(P)};
var PADDLE = ${JSON.stringify(PADDLE)}, HINGE_Z = ${HINGE_Z}, ON_ANGLE = ${ON_ANGLE}, OFF_ANGLE = ${OFF_ANGLE};
${boxSvg.toString()}
${paddleSvg.toString()}
var SVG = ${JSON.stringify(svg)};
var CSS = ${JSON.stringify(CSS)};
var mounts = 0;
function mount(el, opts) {
  opts = opts || {};
  if (!document.getElementById("cabfig-taxi-sign-css")) {
    var style = document.createElement("style");
    style.id = "cabfig-taxi-sign-css";
    style.textContent = CSS;
    document.head.appendChild(style);
  }
  var id = "ts" + ++mounts;
  var dark = matchMedia("(prefers-color-scheme: light)");
  var applyTheme = function () { el.setAttribute("data-theme", opts.theme || (dark.matches ? "light" : "dark")); };
  el.classList.add("iso");
  applyTheme();
  if (!opts.theme) dark.addEventListener("change", applyTheme);
  el.innerHTML = ${JSON.stringify(k.plateHtml({
    fig: "__FIG__",
    title: "Roof sign",
    hint: "Click to switch",
    readout: "OFFLINE",
    body: `<div class="iso-stage ts-stage" tabindex="0" role="switch" aria-checked="false" aria-label="Availability: off. Press to go online.">__SVG__</div>`,
  }))}.replace("__FIG__", opts.fig || "Fig 1").replace("__SVG__", function () { return SVG.replace(/__ID__/g, id); });
  var stage = el.querySelector(".ts-stage");
  var paddle = stage.querySelector('[data-part="paddle"]');
  var readout = el.querySelector("[data-readout]");
  var hint = el.querySelector('[data-corner="hint"]');
  var still = matchMedia("(prefers-reduced-motion: reduce)");
  var online = false, disabled = false, note = "";
  var angle = OFF_ANGLE, rate = 0, lamp = 0, lock = 0, hover = 0, drawn = null;
  var frame = 0, last = 0, visible = true;
  function targets() {
    var a = online ? ON_ANGLE : OFF_ANGLE;
    if (!disabled) a += (online ? 1 : -1) * hover * 2.5;
    return { angle: a, lamp: online ? 1 : 0, lock: disabled ? 1 : 0 };
  }
  function draw() {
    var a = Math.round(angle * 20) / 20;
    if (a !== drawn) { paddle.innerHTML = paddleSvg(a); drawn = a; }
    stage.style.setProperty("--ts-on", lamp.toFixed(3));
    stage.style.setProperty("--ts-lock", lock.toFixed(3));
  }
  function tick(now) {
    var dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
    last = now;
    var want = targets();
    if (still.matches) { angle = want.angle; rate = 0; lamp = want.lamp; lock = want.lock; }
    else {
      for (var i = 0; i < 4; i++) { rate += ((want.angle - angle) * 900 - rate * 34) * dt / 4; angle += rate * dt / 4; }
      lamp += (want.lamp - lamp) * (1 - Math.exp(-dt / (want.lamp > lamp ? 0.16 : 0.42)));
      lock += (want.lock - lock) * (1 - Math.exp(-dt / 0.25));
    }
    var done = Math.abs(want.angle - angle) < 0.01 && Math.abs(rate) < 0.01 && Math.abs(want.lamp - lamp) < 0.002 && Math.abs(want.lock - lock) < 0.002;
    if (done) { angle = want.angle; rate = 0; lamp = want.lamp; lock = want.lock; }
    draw();
    frame = visible && !done ? requestAnimationFrame(tick) : 0;
  }
  function run() { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } }
  function label() {
    var text = disabled ? "LOCKED" + (note ? " · " + note : "") : online ? "ONLINE · receiving requests" : "OFFLINE";
    readout.textContent = text;
    hint.textContent = disabled ? "Locked out" : "Click to switch";
    stage.setAttribute("aria-checked", String(online));
    stage.setAttribute("aria-disabled", String(disabled));
    stage.setAttribute("aria-label", "Availability: " + (online ? "online" : "offline") + (disabled ? ". Locked" + (note ? ": " + note : "") : ". Press to go " + (online ? "offline" : "online")) + ".");
    if (online) stage.setAttribute("data-online", ""); else stage.removeAttribute("data-online");
  }
  function toggle() { if (!disabled) el.dispatchEvent(new CustomEvent("cabfig:toggle", { bubbles: true })); }
  var onClick = function () { toggle(); };
  var onKey = function (event) { if (event.key === " " || event.key === "Enter") { event.preventDefault(); toggle(); } };
  var onEnter = function () { hover = 1; run(); };
  var onLeave = function () { hover = 0; run(); };
  stage.addEventListener("click", onClick);
  stage.addEventListener("keydown", onKey);
  stage.addEventListener("pointerenter", onEnter);
  stage.addEventListener("pointerleave", onLeave);
  var watcher = new IntersectionObserver(function (entries) { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" });
  watcher.observe(stage);
  label();
  draw();
  return {
    set: function (value, extra) {
      extra = extra || {};
      online = Boolean(value);
      disabled = Boolean(extra.disabled);
      note = extra.note || "";
      label();
      run();
    },
    destroy: function () {
      cancelAnimationFrame(frame);
      watcher.disconnect();
      dark.removeEventListener("change", applyTheme);
      el.innerHTML = "";
    },
  };
}
window.CabFig = window.CabFig || {};
window.CabFig.taxiSign = { mount: mount };
`;

const kit = readFileSync(join(HERE, "..", "kit", "iso-kit.mjs"), "utf8").replace(/^export /gm, "");
// The IIFE keeps this copy of the kit private, since other figure scripts inline their own.
writeFileSync(OUT, `/* Taxi roof sign figure. Generated by figures-src/taxi-sign/build.mjs; do not edit. Kit: anatomy (MIT). */\n(function () {\n"use strict";\n${kit}\n${live}\n})();\n`);

const preview = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Roof sign preview</title>
<link rel="stylesheet" href="../../public/figures/iso.css">
<style>*{box-sizing:border-box}body{margin:0;background:${theme === "light" ? "#f2f2ef" : "#0b0b0b"};font:14px system-ui}main{width:min(480px,100% - 32px);margin:48px auto}</style></head>
<body><main><div id="fig"></div></main>
<script src="../../public/figures/taxi-sign.js"></script>
<script>
var q = new URLSearchParams(location.search);
var el = document.getElementById("fig");
var fig = CabFig.taxiSign.mount(el, { theme: "${theme}", fig: "Fig 2" });
var state = q.get("state") || "off";
fig.set(state === "on", { disabled: state === "locked", note: state === "locked" ? "awaiting approval" : "" });
var on = state === "on";
el.addEventListener("cabfig:toggle", function () { on = !on; fig.set(on); });
</script></body></html>`;
writeFileSync(join(HERE, theme === "light" ? "preview-light.html" : "preview.html"), preview);
console.log("wrote", OUT, "and", theme === "light" ? "preview-light.html" : "preview.html");
