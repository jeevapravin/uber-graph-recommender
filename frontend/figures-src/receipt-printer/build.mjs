// Receipt printer: an in-cab POS terminal that prints the trip receipt once the fare is paid.
// node figures-src/receipt-printer/build.mjs  → figures/receipt-printer.js + preview pages
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../kit/iso-kit.mjs";
import * as G from "../kit/lathe.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const kitSource = readFileSync(join(HERE, "..", "kit", "iso-kit.mjs"), "utf8").replace(/^export /gm, "");

const WIDTH = 600;
const HEIGHT = 500;

// ---- world (units ≈ 1 px of the real thing; z up, viewer toward +x +y) ----
const PLATE = { x: -62, y: -50, w: 124, d: 100, r: 8 };
const PLATE_H = 6;
const FOOT_H = 4;
const CRADLE = { x: -50, y: -40, w: 100, d: 80, r: 5 };
const BUMPER = { x: -47, y: -37, w: 94, d: 74, r: 7 };
const CASE = { x: -45, y: -35, w: 90, d: 70, r: 6 };
const CASE_Z = 5;
const TOP = 32;
const LID = { x: -43, y: -33, w: 86, d: 31.4, r: 4 };
const LID_TOP = 33.6;
const WIN = { x: -27, y: -28, w: 54, d: 20, r: 3 };
const WALL_BOTTOM = 31.4;
const ROLL = { x0: -33, len: 66, y: -18, z: 18, r: 13 };
const SLOT = { x: -25, y: -1.6, w: 50, d: 2.8, r: 1 };
const PAPER = { x0: -23, x1: 23, y: 0.2 };
const BAR = { x: -27, y: 1.2, w: 54, d: 2, r: 0.6 };
const BAR_TOP = 34.4;
const DISP = { x: -42, y: 6, w: 38, d: 7, r: 1 };
const DISP_TOP = 32.8;
const DISP_FLOOR = 32.2;
const PAD = { x: 2, y: 7, w: 26, d: 24, r: 4 };
const PAD_TOP = 33.2;
const PAD_C = [PAD.x + PAD.w / 2, PAD.y + PAD.d / 2];
const FEED = [37, 12];
const LED = [37, 22];

// ---- receipt layout (paper units, measured down from the leading edge) ----
const R = { lead: 15, curl: 12, bend: 10, maxLines: 7 };
const lengthFor = (lines) => R.lead + 4.5 + 4 + 2.6 + lines * 4.2 + 2.8 + 4.8 + 4.4 + 4.6 + 5;
const MAX_LEN = lengthFor(R.maxLines);
const MAX_FLAT = MAX_LEN - R.curl;
const curlTop = TOP + MAX_FLAT + R.bend * Math.sin(R.curl / R.bend);

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [PAPER.x0, 0, curlTop], [PAPER.x1, 0, curlTop], [PAPER.x0, -6, curlTop], ...k.boxCorners(CASE, 0, BAR_TOP)],
  WIDTH,
  HEIGHT,
  { pad: 20, azimuth: 58, elevation: 32 },
);

const at = (point) => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const byDepth = (items, key = (x) => x) => [...items].sort((a, b) => k.depthOf(key(a), P) - k.depthOf(key(b), P));
const poly = (points3) => k.pathOf(points3.map(at), true);
const { sinA, cosA } = k.cameraOf(P);
const shadeOf = ([nx, ny]) => Math.min(3, Math.max(0, Math.floor(((nx * -sinA + ny * cosA + 1) / 2) * 4)));

function base() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(PLATE, 16), ([x, y]) => [x, y, 0])) {
    out.push(S(k.cylinder(x, y, 6.4, -PLATE_H - FOOT_H, 1.4, P, 24), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 5, -PLATE_H - FOOT_H + 1.4, FOOT_H - 1.4, P, 24), { tone: "mid" }));
  }
  out.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.4), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 4), 0, P), { tone: "lo" }));
  const screws = k.corners(PLATE, 7);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  return out.join("");
}

function cradle() {
  const out = [];
  // left clamp jaw sits behind the case's far side, so it goes first
  out.push(S(k.slabOf({ x: -51, y: 6, w: 6, d: 20, r: 1.2 }, 3, 13, P, 3, 0.4), { tone: "mid" }));
  out.push(S(k.slabOf(CRADLE, 0, 3, P, 6, 0.6), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(CRADLE, 2.4), 3, P, 6), { tone: "faint" }));
  out.push(D(k.corners(CRADLE, 4).map(([x, y]) => at([x, y, 3])), { size: 0.45 }));
  out.push(S(k.slabOf(BUMPER, 3, 2, P, 8), { tone: "lo", crease: "none" }));
  return out.join("");
}

function labelPlate() {
  const plan = { x: -56, y: 41, w: 26, d: 7, r: 1 };
  const out = [S(k.slabOf(plan, 0, 0.8, P, 4), { tone: "lo" })];
  out.push(L(k.planOutline(k.insetPlan(plan, 1.2), 0.8, P, 4), { tone: "faint" }));
  [[19, 42.8], [14, 44.6], [16.5, 46.4]].forEach(([len, y]) => out.push(L(k.lineOnTop([plan.x + 4, y], [plan.x + 4 + len, y], 0.8, P), { tone: "lo", free: true })));
  out.push(D([at([plan.x + 2.2, plan.y + plan.d / 2, 0.8]), at([plan.x + plan.w - 2.2, plan.y + plan.d / 2, 0.8])], { size: 0.4 }));
  return out.join("");
}

function caseBody() {
  const seam = L(k.sideSeam(CASE, 18, P, 6), { tone: "faint" });
  const out = [S(k.slabOf(CASE, CASE_Z, TOP - CASE_Z, P, 6, 1), { tone: "mid", inner: seam })];
  // card slot on the front face: a closed slot, darker inside
  const slot = k.roundedPlan({ x: -22, y: 11.6, w: 44, d: 1.8, r: 0.9 }, 4).map(([x, z]) => [x, CASE.y + CASE.d, z]);
  out.push(`<path class="iso-shade" data-shade="0" d="${poly(slot)}"/>`, L(poly(slot), { tone: "lo" }));
  out.push(k.faceTextSvg(k.sideMatrix([-40, CASE.y + CASE.d], 25.6, P, "left"), "CABGO POS", { size: 2.6, tone: "lo" }));
  // cooling vents on the right face: closed slots
  const vents = [0, 1, 2, 3, 4].map((i) => poly(k.roundedPlan({ x: -13 + i * 2.6, y: 20, w: 1.3, d: 8, r: 0.6 }, 3).map(([y, z]) => [CASE.x + CASE.w, y, z])));
  out.push(`<path class="iso-shade" data-shade="0" d="${vents.join("")}"/>`, L(vents.join(""), { tone: "lo" }));
  // front-corner screws on the deck
  out.push(L([-41, 41].map((x) => k.ring(x, 31.5, 1.4, TOP, P, 14)).join(""), { tone: "lo" }));
  out.push(D([-41, 41].map((x) => at([x, 31.5, TOP])), { size: 0.4 }));
  return out.join("");
}

// the window in the lid: an opening onto the paper roll, with the hole's visible inner walls
const winRing = k.ringOf(WIN, 4);
const winPath = poly(winRing.map(([x, y]) => [x, y, LID_TOP]));
function windowWalls() {
  const cx = WIN.x + WIN.w / 2;
  const cy = WIN.y + WIN.d / 2;
  const n = winRing.length;
  const [vx, vy] = k.towardViewer(P);
  const inner = winRing.map(([ax, ay], i) => {
    const [bx, by] = winRing[(i + 1) % n];
    let nx = by - ay;
    let ny = -(bx - ax);
    const len = Math.hypot(nx, ny) || 1;
    nx /= len;
    ny /= len;
    if (nx * ((ax + bx) / 2 - cx) + ny * ((ay + by) / 2 - cy) > 0) [nx, ny] = [-nx, -ny]; // point into the window
    return [nx, ny];
  });
  const seen = inner.map(([nx, ny]) => nx * vx + ny * vy > 1e-9);
  const start = seen.findIndex((s, i) => !s && seen[(i + 1) % n]);
  const quads = [[], [], [], []];
  const run = [];
  for (let s = 1; s <= n; s++) {
    const i = (start + s) % n;
    if (!seen[i]) break;
    const [ax, ay] = winRing[i];
    const [bx, by] = winRing[(i + 1) % n];
    quads[shadeOf(inner[i])].push(poly([[ax, ay, LID_TOP], [bx, by, LID_TOP], [bx, by, WALL_BOTTOM], [ax, ay, WALL_BOTTOM]]));
    if (!run.length) run.push([ax, ay]);
    run.push([bx, by]);
  }
  const bottom = [[...run[0], LID_TOP], ...run.map(([x, y]) => [x, y, WALL_BOTTOM]), [...run[run.length - 1], LID_TOP]];
  return quads.map((d, shade) => (d.length ? `<path class="iso-shade" data-shade="${shade}" d="${d.join("")}"/>` : "")).join("") + L(k.pathOf(bottom.map(at)), { tone: "faint" });
}

function lid() {
  const ROLL_F = G.frameAlong([ROLL.x0, ROLL.y, ROLL.z], [1, 0, 0]);
  const out = [S(k.slabOf(LID, TOP, LID_TOP - TOP, P, 4, 0.5), { tone: "mid" })];
  out.push(L(k.planOutline(k.insetPlan(LID, 2.5), LID_TOP, P, 4), { tone: "faint" }));
  out.push(D([[-39, -29], [39, -29]].map(([x, y]) => at([x, y, LID_TOP])), { size: 0.4 }));
  out.push(`<g clip-path="url(#__ID__-win)">`);
  out.push(`<path class="iso-shade" data-shade="0" d="${winPath}"/>`);
  out.push(S(G.disc(0, ROLL.len, ROLL.r, ROLL_F, P), { tone: "hi", crease: "lo" }));
  out.push(`<path data-part="rollline" class="iso-line" data-tone="mid" d=""/>`);
  out.push(windowWalls(), `</g>`);
  out.push(L(winPath, { tone: "lo" }));
  // the paper slot between the lid and the tear bar
  out.push(`<path class="iso-shade" data-shade="0" d="${k.planOutline(SLOT, TOP, P, 3)}"/>`, L(k.planOutline(SLOT, TOP, P, 3), { tone: "lo" }));
  return out.join("");
}

// paper: built live (its height and curl change), text in the plane of its face
const FACE = k.sideMatrix([0, PAPER.y], TOP, P, "left");
function paper() {
  return [
    `<g data-part="paper" class="iso-solid">`,
    `<path class="iso-fill" data-part="pfill" d=""/>`,
    `<path class="iso-shade" data-part="pface" data-shade="${shadeOf([0, 1])}" d=""/>`,
    `<path data-part="pcurl" fill="url(#__ID__-curl)" stroke="none" d=""/>`,
    `<g transform="${FACE}" clip-path="url(#__ID__-ink)"><g data-part="ink"></g></g>`,
    `<path class="iso-line iso-edge" data-part="pedge" data-tone="hi" d=""/>`,
    `</g>`,
  ].join("");
}

function tearBar() {
  const teeth = [];
  const x0 = BAR.x + BAR.r;
  const x1 = BAR.x + BAR.w - BAR.r;
  const count = 34;
  for (let i = 0; i <= count; i++) teeth.push([x0 + ((x1 - x0) * i) / count, i % 2 ? BAR.y + 0.7 : BAR.y]);
  return S(k.slabOf(BAR, TOP, BAR_TOP - TOP, P, 2, 0.3), { tone: "mid" }) + L(k.onTop(teeth, BAR_TOP, P), { tone: "lo" });
}

const dispRing = k.ringOf(DISP, 3);
function deck() {
  const out = [];
  // display: bezel, recess walls, glass floor with the machine's own text
  out.push(S(k.slabOf(k.insetPlan(DISP, -1.6), TOP, DISP_TOP - TOP, P, 3, 0.3), { tone: "mid" }));
  const open = poly(dispRing.map(([x, y]) => [x, y, DISP_TOP]));
  out.push(`<g clip-path="url(#__ID__-disp)">`);
  out.push(`<path class="iso-shade" data-shade="0" d="${open}"/>`);
  // far walls of the recess: the back (+y facing) and left (+x facing) sides
  out.push(`<path class="iso-shade" data-shade="${shadeOf([0, 1])}" d="${poly([[DISP.x, DISP.y, DISP_TOP], [DISP.x + DISP.w, DISP.y, DISP_TOP], [DISP.x + DISP.w, DISP.y, DISP_FLOOR], [DISP.x, DISP.y, DISP_FLOOR]])}"/>`);
  out.push(`<path class="iso-shade" data-shade="${shadeOf([1, 0])}" d="${poly([[DISP.x, DISP.y, DISP_TOP], [DISP.x, DISP.y + DISP.d, DISP_TOP], [DISP.x, DISP.y + DISP.d, DISP_FLOOR], [DISP.x, DISP.y, DISP_FLOOR]])}"/>`);
  out.push(`<text class="iso-face-text" data-part="display" data-tone="hi" transform="${k.topMatrix([0, 0], DISP_FLOOR, P, "x")}" x="${DISP.x + DISP.w - 1.6}" y="${DISP.y + DISP.d / 2 + 1.5}" font-size="4.2" text-anchor="end"></text>`);
  out.push(`</g>`, L(open, { tone: "lo" }));
  // keypad, 3 × 4
  const keys = [];
  for (let row = 0; row < 4; row++) for (let col = 0; col < 3; col++) keys.push({ x: -41 + col * 12.4, y: 15.6 + row * 4.4, w: 10.4, d: 3.2, r: 0.9 });
  for (const key of byDepth(keys, (p) => [p.x + p.w / 2, p.y + p.d / 2, TOP])) out.push(S(k.slabOf(key, TOP, 1.2, P, 2, 0.3), { tone: "mid" }));
  // contactless tap pad: rings on its top pulse while the fare is due
  out.push(`<g data-part="pad">${S(k.slabOf(PAD, TOP, PAD_TOP - TOP, P, 5, 0.6), { tone: "hi", crease: "lo" })}</g>`);
  out.push(`<g data-part="rings">${[3.2, 6.2, 9.2].map((r) => L(k.ring(PAD_C[0], PAD_C[1], r, PAD_TOP, P, 48), { tone: "mid" })).join("")}</g>`);
  out.push(D([at([PAD_C[0], PAD_C[1], PAD_TOP])], { size: 0.6, tone: "hi" }));
  // feed button and status LED
  out.push(L(k.ring(FEED[0], FEED[1], 4.4, TOP, P, 28), { tone: "lo" }));
  out.push(S(k.cylinder(FEED[0], FEED[1], 3.2, TOP, 1.6, P, 28, 0.3), { tone: "mid" }));
  out.push(L(k.ring(FEED[0], FEED[1], 1.8, TOP + 1.6, P, 20), { tone: "faint" }));
  out.push(S(k.cylinder(LED[0], LED[1], 2, TOP, 0.6, P, 20), { tone: "mid" }));
  out.push(S(k.cylinder(LED[0], LED[1], 1.2, TOP + 0.6, 0.8, P, 16), { tone: "hi" }));
  out.push(`<g class="iso-dots" data-tone="hi"><circle data-part="led" cx="${at([LED[0], LED[1], TOP + 1.4])[0].toFixed(1)}" cy="${at([LED[0], LED[1], TOP + 1.4])[1].toFixed(1)}" r="0.9"/></g>`);
  return out.join("");
}

function sideParts() {
  const out = [];
  // power: connector shell on the right face, cable down to a socket on the base plate
  out.push(S(k.slabOf({ x: 52, y: -24, w: 6, d: 8, r: 1 }, 0, 2.4, P, 3, 0.3), { tone: "mid" }));
  out.push(S(k.slabOf({ x: CASE.x + CASE.w, y: -24, w: 3.5, d: 8, r: 0.8 }, 9, 5, P, 3, 0.3), { tone: "mid" }));
  out.push(k.wireSvg(at([48.5, -20, 11.5]), at([55, -20, 2.4]), { via: [at([55, -20, 11.5])], tone: "mid", size: 1 }));
  // right clamp jaw with its knurled thumb screw
  out.push(S(k.slabOf({ x: CASE.x + CASE.w, y: 6, w: 6, d: 20, r: 1.2 }, 3, 13, P, 3, 0.4), { tone: "mid" }));
  out.push(D([at([48, 9, 16]), at([48, 23, 16])], { size: 0.4 }));
  out.push(S(k.cylinder(48, 16, 3.2, 16, 4.4, P, 28), { tone: "mid" }));
  out.push(L(k.knurl(48, 16, 3.2, 16, 20.4, 30, P, 0), { tone: "lo" }));
  return out.join("");
}

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "An in-cab receipt printer on a dashboard mount. While a fare is due the contactless pad on its deck pulses; once the trip is paid, a paper receipt with the fare lines feeds out of the slot behind the tear bar, unwinding the roll seen through the lid window.",
  body: [
    `<defs><clipPath id="__ID__-win"><path d="${winPath}"/></clipPath><clipPath id="__ID__-disp"><path d="${poly(dispRing.map(([x, y]) => [x, y, DISP_TOP]))}"/></clipPath>`,
    `<clipPath id="__ID__-ink"><rect data-part="inkclip" x="${PAPER.x0}" y="${-MAX_FLAT}" width="${PAPER.x1 - PAPER.x0}" height="${MAX_FLAT}"/></clipPath>`,
    `<linearGradient id="__ID__-curl" data-part="curlgrad" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--anatomy-lit-top)" stop-opacity="0"/><stop offset="1" style="stop-color:var(--anatomy-lit-top)" stop-opacity=".9"/></linearGradient></defs>`,
    base(),
    cradle(),
    labelPlate(),
    caseBody(),
    lid(),
    paper(),
    tearBar(),
    deck(),
    sideParts(),
  ],
});

const STAGE = `<div class="iso-stage" tabindex="0" role="button" aria-label="Receipt printer">${svg}</div>`;
const HTML = k.plateHtml({
  fig: "Fig 4",
  title: "Receipt printer",
  hint: "Waiting for payment",
  readout: "PENDING",
  keys: [{ mark: "lit", label: "Tap pad while the fare is due; the receipt once it is paid" }],
  body: STAGE,
});

// ---- live behaviour (runs in the page, with the kit inlined) ----
const live = `
const P = ${JSON.stringify(P)};
const C = ${JSON.stringify({ TOP, PAPER, R, ROLL, WIN, LID_TOP, MAX_FLAT, DISP_W: DISP.w - 3.2 })};
const WIN_POLY = ${JSON.stringify(winRing.map(([x, y]) => k.iso([x, y, LID_TOP], P)))};
const HTML = ${JSON.stringify(HTML)};
const NS = "http://www.w3.org/2000/svg";
const VIEW = [Math.cos(P.azimuth * Math.PI / 180) * Math.cos(P.elevation * Math.PI / 180), Math.sin(P.azimuth * Math.PI / 180) * Math.cos(P.elevation * Math.PI / 180), Math.sin(P.elevation * Math.PI / 180)];
const SPEED = 18, ACCEL = 60, TEAR = 0.7;
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
let mounts = 0;

// clip the segment a→b (screen) to a convex polygon, or null when it misses it
function clipToPoly(a, b, poly) {
  let t0 = 0, t1 = 1;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length, cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    let nx = q[1] - p[1], ny = -(q[0] - p[0]);
    if (nx * (cx - p[0]) + ny * (cy - p[1]) < 0) { nx = -nx; ny = -ny; } // inward normal
    const den = nx * dx + ny * dy, num = nx * (a[0] - p[0]) + ny * (a[1] - p[1]);
    if (Math.abs(den) < 1e-9) { if (num < 0) return null; continue; }
    const t = -num / den;
    if (den > 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  return [[a[0] + dx * t0, a[1] + dy * t0], [a[0] + dx * t1, a[1] + dy * t1]];
}

const money = (n) => (n < 0 ? "-₹" : "₹") + Math.abs(Math.round(n * 100) / 100).toLocaleString("en-IN");
const fit = (text, chars) => (text.length > chars ? text.slice(0, Math.max(1, chars - 1)) + "…" : text);
const CW = 0.66; // mono advance + letter-spacing, per unit of font size

function receiptFor(state, data) {
  const parts = [];
  const amount = Number(data.amount) || 0;
  const method = String(data.method || "CASH").toUpperCase().slice(0, 8);
  const text = (value, x, y, size, anchor, tone) => parts.push({ tag: "text", value, x, y, size, anchor, tone });
  let y = C.R.lead + 4.5;
  text("CABGO", 0, y, 3.8, "middle", "hi");
  y += 4; text(state === "REFUNDED" ? "REFUND SLIP" : "TRIP RECEIPT", 0, y, 2.3, "middle", "mid");
  y += 2.6; parts.push({ tag: "rule", y });
  const given = Array.isArray(data.lines) && data.lines.length ? data.lines : [{ label: "Trip fare", amount }];
  const lines = state === "REFUNDED" ? [{ label: "Trip fare", amount }] : given.slice(0, C.R.maxLines);
  const room = Math.floor((C.PAPER.x1 - C.PAPER.x0 - 4) / (2.8 * CW));
  for (const line of lines) {
    y += 4.2;
    const value = fit(typeof line.amount === "number" ? money(line.amount) : String(line.amount ?? ""), 9);
    text(fit(String(line.label ?? ""), room - value.length - 1), C.PAPER.x0 + 2, y, 2.8, "start", "mid");
    text(value, C.PAPER.x1 - 2, y, 2.8, "end", "hi");
  }
  y += 2.8; parts.push({ tag: "rule", y });
  y += 4.8; text("TOTAL", C.PAPER.x0 + 2, y, 3.4, "start", "hi");
  text(fit((state === "REFUNDED" ? "-" : "") + money(amount), 10), C.PAPER.x1 - 2, y, 3.4, "end", "hi");
  y += 4.4; text((state === "REFUNDED" ? "BACK TO " : "PAID BY ") + method, 0, y, 2.3, "middle", "mid");
  y += 4.6; text("THANK YOU", 0, y, 2.3, "middle", "mid");
  return { parts, length: y + 5 };
}

function mount(el, opts = {}) {
  const id = "rp" + ++mounts;
  const media = matchMedia("(prefers-color-scheme: light)");
  const theme = () => el.setAttribute("data-theme", opts.theme || (media.matches ? "light" : "dark"));
  el.classList.add("iso");
  theme();
  if (!opts.theme) media.addEventListener("change", theme);
  el.innerHTML = HTML.split("__ID__").join(id);
  const $ = (name) => el.querySelector('[data-part="' + name + '"]');
  const stage = el.querySelector(".iso-stage");
  const readout = el.querySelector("[data-readout]");
  const hint = el.querySelector('[data-corner="hint"]');
  const paper = $("paper"), pfill = $("pfill"), pface = $("pface"), pcurl = $("pcurl"), pedge = $("pedge"), ink = $("ink"), inkclip = $("inkclip");
  const curlgrad = el.querySelector("#" + id + "-curl");
  const rollline = $("rollline"), led = $("led"), pad = $("pad").firstElementChild, rings = [...$("rings").children], display = $("display");
  const still = matchMedia("(prefers-reduced-motion: reduce)");

  let state = "PENDING", data = { amount: 0, method: "CASH" };
  let job = null;        // receipt being printed / shown: { length, flat }
  let fed = 0, speed = 0, tear = 0, pending = null;
  let clock = 0, last = 0, frame = 0, visible = false, touring = true, tourAt = 0, tourStep = 0;

  function lay(receipt) {
    ink.textContent = "";
    for (const part of receipt.parts) {
      if (part.tag === "rule") {
        const line = document.createElementNS(NS, "path");
        line.setAttribute("class", "iso-line");
        line.setAttribute("data-tone", "lo");
        line.setAttribute("data-dashed", "");
        line.setAttribute("data-free", "");
        line.setAttribute("d", "M" + (C.PAPER.x0 + 2) + " " + part.y + "H" + (C.PAPER.x1 - 2));
        ink.appendChild(line);
      } else {
        const t = document.createElementNS(NS, "text");
        t.setAttribute("class", "iso-face-text");
        t.setAttribute("data-tone", part.tone);
        t.setAttribute("x", part.x);
        t.setAttribute("y", part.y);
        t.setAttribute("font-size", part.size);
        t.setAttribute("text-anchor", part.anchor);
        t.textContent = part.value;
        ink.appendChild(t);
      }
    }
    const flat = receipt.length - C.R.curl;
    inkclip.setAttribute("y", -flat);
    inkclip.setAttribute("height", flat);
    return { length: receipt.length, flat };
  }

  function drawPaper() {
    const lift = smooth(tear / TEAR);
    paper.setAttribute("transform", translateAlong(P, [0, 0, lift * 16]));
    paper.setAttribute("opacity", (1 - lift).toFixed(3));
    paper.style.display = fed > 0.05 ? "" : "none";
    if (!(fed > 0.05) || !job) return;
    const flat = Math.min(fed, job.flat);
    const curl = Math.max(0, fed - job.flat);
    const phi = curl / C.R.bend;
    const edge = (x) => {
      const pts = [[x, C.PAPER.y, C.TOP], [x, C.PAPER.y, C.TOP + flat]];
      for (let i = 1, n = Math.ceil(phi / 0.08); i <= n && phi > 0; i++) {
        const t = (phi * i) / n;
        pts.push([x, C.PAPER.y - C.R.bend * (1 - Math.cos(t)), C.TOP + flat + C.R.bend * Math.sin(t)]);
      }
      return pts.map((p) => iso(p, P));
    };
    const left = edge(C.PAPER.x0), right = edge(C.PAPER.x1);
    const outline = pathOf([...left, ...right.slice().reverse()], true);
    pfill.setAttribute("d", outline);
    pface.setAttribute("d", outline);
    pedge.setAttribute("d", pathOf([...left, ...right.slice().reverse()]));
    if (phi > 0) {
      const from = iso([0, C.PAPER.y, C.TOP + flat], P), to = left[left.length - 1], toR = right[right.length - 1];
      const curlPts = [...left.slice(1), ...right.slice(1).reverse()];
      pcurl.setAttribute("d", pathOf(curlPts, true));
      curlgrad.setAttribute("x1", from[0]); curlgrad.setAttribute("y1", from[1]);
      curlgrad.setAttribute("x2", (to[0] + toR[0]) / 2); curlgrad.setAttribute("y2", (to[1] + toR[1]) / 2);
      curlgrad.lastElementChild.setAttribute("stop-opacity", (0.9 * Math.min(1, phi / 1.2)).toFixed(2));
    } else pcurl.setAttribute("d", "");
    ink.setAttribute("transform", "translate(0 " + (-fed).toFixed(2) + ")");
  }

  // the outer layer's glued edge on the roll turns as paper is drawn off
  function drawRoll() {
    const alpha = 1.25 - fed / C.ROLL.r;
    const y = C.ROLL.y + C.ROLL.r * Math.cos(alpha), z = C.ROLL.z + C.ROLL.r * Math.sin(alpha);
    const facing = Math.cos(alpha) * VIEW[1] + Math.sin(alpha) * VIEW[2];
    const seg = facing > 0 ? clipToPoly(iso([C.ROLL.x0, y, z], P), iso([C.ROLL.x0 + C.ROLL.len, y, z], P), WIN_POLY) : null;
    rollline.setAttribute("d", seg ? pathOf(seg) : "");
    rollline.setAttribute("stroke-opacity", smooth(facing / 0.35).toFixed(2));
  }

  function words() {
    const amount = money(Number(data.amount) || 0);
    const method = String(data.method || "CASH").toUpperCase();
    const printing = state !== "PENDING" && (tear > 0 || (job && fed < job.length - 0.01));
    let text, screen, tip;
    if (state === "PENDING") { text = "PENDING · " + amount + " due"; screen = "DUE " + amount; tip = "Waiting for payment"; }
    else if (printing) { text = "PRINTING · " + amount; screen = "PRINTING"; tip = "Printing receipt"; }
    else if (state === "PAID") { text = "PAID · " + method + " · " + amount; screen = "PAID " + amount; tip = "Click to reprint"; }
    else { text = "REFUNDED · " + amount + " to " + method; screen = "REFUND " + amount; tip = "Click to reprint"; }
    if (screen.length * 4.2 * CW > C.DISP_W) screen = screen.split(" ").pop();
    if (readout.textContent !== text) readout.textContent = text;
    if (display.textContent !== screen) display.textContent = screen;
    if (hint.textContent !== tip) hint.textContent = tip;
    stage.setAttribute("aria-label", "Receipt printer: " + text + (state === "PENDING" ? "" : ". Press Enter to reprint."));
    stage.setAttribute("aria-disabled", state === "PENDING" ? "true" : "false");
  }

  function lights(t) {
    const due = state === "PENDING";
    if (due) pad.setAttribute("data-lit", ""); else pad.removeAttribute("data-lit");
    if (due) paper.removeAttribute("data-lit"); else paper.setAttribute("data-lit", "");
    const calm = still.matches;
    led.setAttribute("fill-opacity", due && !calm ? (0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2 / 2.4))).toFixed(2) : "1");
    rings.forEach((ring, i) => {
      const u = (((t / 1.8 - i * 0.22) % 1) + 1) % 1;
      ring.setAttribute("stroke-opacity", due && !calm ? (0.25 + 0.75 * Math.sin(Math.PI * u) ** 2).toFixed(2) : due ? "1" : "0.55");
    });
  }

  // a state change tears off what is out, then prints what the new state needs
  function apply(next, nextData, replay) {
    const changed = next !== state;
    state = next;
    data = Object.assign({}, nextData || data);
    if (!changed && !replay) return words();
    pending = state === "PENDING" ? "none" : receiptFor(state, data);
    if (fed > 0.05) tear = Math.max(tear, 0.0001); else start();
    run();
  }
  function start() {
    tear = 0; fed = 0; speed = 0;
    job = pending && pending !== "none" ? lay(pending) : null;
    pending = null;
    if (job && still.matches) fed = job.length;
  }

  function tour(dt) {
    tourAt += dt;
    const steps = [["PENDING", 3.6], ["PAID", 9], ["REFUNDED", 7]];
    if (tourAt < steps[tourStep][1]) return;
    tourAt = 0;
    tourStep = (tourStep + 1) % steps.length;
    apply(steps[tourStep][0], DEMO, false);
  }

  function tick(now) {
    const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
    last = now;
    clock += dt;
    if (touring && !still.matches) tour(dt);
    if (tear > 0) {
      tear = still.matches ? TEAR : tear + dt;
      if (tear >= TEAR) start();
    } else if (job && fed < job.length) {
      // feed: accelerate to the print speed, brake to stop exactly at the receipt's end
      const want = Math.min(SPEED, Math.sqrt(2 * ACCEL * Math.max(0, job.length - fed)));
      speed += Math.max(-ACCEL * dt, Math.min(ACCEL * dt, want - speed));
      fed = Math.min(job.length, fed + Math.max(speed, 0.6) * dt);
    }
    drawPaper();
    drawRoll();
    lights(clock);
    words();
    const busy = tear > 0 || (job && fed < job.length) || state === "PENDING" || touring;
    frame = visible && busy && !still.matches ? requestAnimationFrame(tick) : 0;
  }
  const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } else if (!visible) { drawPaper(); drawRoll(); lights(clock); words(); } };

  const DEMO = { amount: 182, method: "UPI", lines: [{ label: "Base fare", amount: 60 }, { label: "Distance 7.2 km", amount: 108 }, { label: "Time 17 min", amount: 34 }, { label: "Promo CAB20", amount: -20 }] };
  data = DEMO;

  const reprint = () => { if (state !== "PENDING") { touring = false; apply(state, data, true); } };
  const onKey = (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); reprint(); } };
  stage.addEventListener("click", reprint);
  stage.addEventListener("keydown", onKey);
  const io = new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" });
  io.observe(stage);
  if (still.matches) touring = false;
  drawPaper(); drawRoll(); lights(0); words();

  return {
    set(next, nextData) {
      if (!["PENDING", "PAID", "REFUNDED"].includes(next)) return;
      touring = false;
      apply(next, nextData, false);
      if (!visible) { tick(performance.now()); }
    },
    destroy() {
      cancelAnimationFrame(frame);
      frame = 0;
      io.disconnect();
      media.removeEventListener("change", theme);
      stage.removeEventListener("click", reprint);
      stage.removeEventListener("keydown", onKey);
      el.textContent = "";
    },
  };
}

window.CabFig = window.CabFig || {};
window.CabFig.receiptPrinter = { mount };
`;

const script = `/* Receipt printer figure — built by figures-src/receipt-printer/build.mjs; do not edit by hand. */\n(function () {\n"use strict";\n${kitSource}\n${live}\n})();\n`;
writeFileSync(join(ROOT, "figures", "receipt-printer.js"), script);

const preview = (theme) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Receipt printer</title>
<link rel="stylesheet" href="../../figures/iso.css">
<style>*{box-sizing:border-box}body{margin:0;background:var(--anatomy-page);font:14px/1.6 system-ui,sans-serif}.wrap{width:min(480px,100% - 32px);margin:48px auto}</style></head>
<body class="iso" data-theme="${theme}"><div class="wrap" id="fig"></div>
<script src="../../figures/receipt-printer.js"></script>
<script>
const fig = CabFig.receiptPrinter.mount(document.getElementById("fig"), { theme: "${theme}" });
const want = location.hash.slice(1);
const lines = [{ label: "Base fare", amount: 60 }, { label: "Distance 7.2 km × ₹15", amount: 108 }, { label: "Time 17 min", amount: 34 }, { label: "Surge ×1.2", amount: 40 }, { label: "Promo CAB20", amount: -24 }];
if (want) fig.set(want, { amount: 218, method: "UPI", lines });
window.fig = fig;
</script></body></html>`;
writeFileSync(join(HERE, "preview.html"), preview("dark"));
writeFileSync(join(HERE, "preview-light.html"), preview("light"));
console.log("wrote figures/receipt-printer.js (" + (script.length / 1024).toFixed(1) + " KB) and previews");
