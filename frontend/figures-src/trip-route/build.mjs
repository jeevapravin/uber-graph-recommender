// Trip route figure: a tabletop street model whose cab drives the booking's stages.
// node figures-src/trip-route/build.mjs  →  figures/trip-route.js + preview pages
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../kit/iso-kit.mjs";
import * as G from "../kit/lathe.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "figures", "trip-route.js");
const kitScript = () => readFileSync(join(HERE, "..", "kit", "iso-kit.mjs"), "utf8").replace(/^export /gm, "");

const WIDTH = 600;
const HEIGHT = 340;

// World, about 1 unit per px of the model. x runs along the road, y toward the viewer, z up.
const PLATE = { x: -152, y: -76, w: 304, d: 146, r: 8 };
const PLATE_H = 10;
const FOOT_H = 5;
const ROAD = { x: -148, y: -14, w: 296, d: 35, r: 2 };
const FAR_KERB = { x: -148, y: -18, w: 296, d: 4, r: 1 };
const NEAR_KERB = { x: -148, y: 21, w: 296, d: 4, r: 1 };
const FAR_WALK = { x: -148, y: -31, w: 296, d: 13, r: 1 };
const NEAR_WALK = { x: -148, y: 25, w: 296, d: 16, r: 1 };
const KERB_H = 2;
const WALK_H = 1;
const LANE_Y = 3.5; // centre line
const CAB_Y = 11; // cab centre, near lane
// The cab is a toy at 1.4× the street's scale so it reads; iso is linear, so scaling its picture about a
// road point is the same as scaling the model. Built centred on y = 8.5, it spans y 1.6–20.4 on the road.
const CAB_SCALE = 1.4;

// The booking's stops along the road.
const STAND_X = -122;
const PICK_X = -34;
const PICK_STOP = PICK_X + 26; // the cab pulls up just past the pin
const DEST_X = 76;
const PIN = [PICK_X, 32];
const FLAG = [DEST_X + 50, 32]; // near-walk parts sit ~18 units left of the road point they cover on screen
const FLAG_LOW = 9;
const FLAG_HIGH = 20;

// Cab, built at x = 0 and moved along x.
const WHEEL_R = 3.2;
const WHEEL_Z = 3.6;
const WHEELS_X = [-8.4, 8.4];
const NEAR_WHEEL = [13, 15.2];
const FAR_WHEEL = [1.8, 4];
const BODY = { x: -13, y: 2.4, w: 26, d: 12.2, r: 2 };
const BODY_Z = 3.6;
const BODY_TOP = 9.6;
const CABIN = { x: -7.4, y: 3.4, w: 13, d: 10.2, r: 1.6 };
const CABIN_TOP = 14.6;
const SIGN = { x: -3.4, y: 5.9, w: 6.8, d: 5.2, r: 0.8 };
const SIGN_TOP = CABIN_TOP + 2.6;
const HUB_R = 1.5;
const HUB_FACE = NEAR_WHEEL[1] + 0.4;

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [-36, -50, 70], [-24, -50, 70], [140, -40, 50]],
  WIDTH,
  HEIGHT,
  { pad: 22, azimuth: 58 },
);

const at = (point) => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const quad = (points) => k.pathOf(points.map(at), true);
const byX = (items) => [...items].sort((a, b) => a.x - b.x).map((item) => item.svg).join("");
const halo = (plan, z, h, blur = 4) => `<path class="iso-halo" d="${k.haloOf(plan, z, h, P)}" style="filter:blur(${blur}px)"/>`;
const vertical = (x, y, z) => G.frameAlong([x, y, z], [0, 0, 1]);

// A closed window on the +y face (y fixed) or the +x face (x fixed).
const winY = (y, x0, x1, z0, z1) => quad([[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]]);
const winX = (x, y0, y1, z0, z1) => quad([[x, y0, z0], [x, y1, z0], [x, y1, z1], [x, y0, z1]]);

function plate() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
  const feet = k.corners(PLATE, 20).sort((a, b) => k.depthOf([...a, 0], P) - k.depthOf([...b, 0], P));
  for (const [x, y] of feet) {
    out.push(S(k.cylinder(x, y, 7, -PLATE_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 5.4, -PLATE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
  }
  out.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.4), { tone: "mid", inner: L(k.sideSeam(PLATE, -4, P, 8), { tone: "faint" }) }));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 3), 0, P), { tone: "faint" }));
  const screws = k.corners(PLATE, 8);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 1.8, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  return out.join("");
}

function road() {
  const out = [S(k.slabOf(ROAD, 0, 0.4, P, 3), { tone: "lo", flat: true, crease: "none" })];
  // Edge lines run end to end; lane dashes and crossing stripes are closed outlines.
  for (const y of [ROAD.y + 3, ROAD.y + ROAD.d - 3]) out.push(L(k.lineOnTop([ROAD.x, y], [ROAD.x + ROAD.w, y], 0.4, P), { tone: "faint" }));
  const dashes = [];
  for (let x = ROAD.x + 10; x + 8 < ROAD.x + ROAD.w - 6; x += 16) {
    if (Math.abs(x + 4 - (PICK_X - 21)) < 12) continue;
    dashes.push(k.planOutline({ x, y: LANE_Y - 0.6, w: 8, d: 1.2, r: 0.3 }, 0.4, P, 2));
  }
  out.push(L(dashes.join(""), { tone: "mid" }));
  const zebra = [];
  for (let y = ROAD.y + 4.5; y + 2.4 < ROAD.y + ROAD.d - 4; y += 4.2) zebra.push(k.planOutline({ x: PICK_X - 26, y, w: 10, d: 2.4, r: 0.3 }, 0.4, P, 2));
  out.push(L(zebra.join(""), { tone: "mid" }));
  // Taxi stand bay in the near lane, and a stop bay at the pickup.
  out.push(L(k.planOutline({ x: STAND_X - 23, y: 1.2, w: 46, d: 19, r: 0.6 }, 0.4, P, 2), { tone: "mid" }));
  out.push(L(k.planOutline({ x: PICK_STOP - 23, y: 1.2, w: 46, d: 19, r: 0.6 }, 0.4, P, 2), { tone: "faint" }));
  return out.join("");
}

function walk(plan) {
  const top = WALK_H;
  const joints = [];
  for (let x = plan.x + 12; x < plan.x + plan.w - 4; x += 12) joints.push(k.lineOnTop([x, plan.y], [x, plan.y + plan.d], top, P));
  return S(k.slabOf(plan, 0, top, P, 3, 0.3), { tone: "lo" }) + L(joints.join(""), { tone: "faint" });
}

const kerb = (plan) => S(k.slabOf(plan, 0, KERB_H, P, 3, 0.4), { tone: "mid" });

// ---------- buildings across the road (always behind the cab: their y is smaller) ----------
function building({ x, y, w, d, h, rows, cols, xcols = 3 }) {
  const plan = { x, y, w, d, r: 1.4 };
  const out = [halo(plan, 0, 1, 6), S(k.slabOf(plan, 0, h, P, 4, 0.8), { tone: "mid", inner: L(k.sideSeam(plan, 6, P, 4), { tone: "faint" }) })];
  const fy = y + d;
  const fx = x + w;
  const wins = [];
  const rowH = (h - 12) / rows;
  for (let row = 0; row < rows; row++) {
    const z0 = 9 + row * rowH;
    const z1 = z0 + rowH * 0.58;
    const span = (w - 8) / cols;
    for (let col = 0; col < cols; col++) wins.push(winY(fy, x + 4 + col * span + 1, x + 4 + (col + 1) * span - 1, z0, z1));
    const yspan = (d - 8) / xcols;
    for (let col = 0; col < xcols; col++) wins.push(winX(fx, y + 4 + col * yspan + 1, y + 4 + (col + 1) * yspan - 1, z0, z1));
  }
  out.push(L(wins.join(""), { tone: "lo" }));
  out.push(L(winY(fy, x + w / 2 - 3, x + w / 2 + 3, 0, 6.4), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(plan, 2), h, P, 4), { tone: "faint" }));
  return { plan, out };
}

function shop() {
  const B = { x: -98, y: -66, w: 42, d: 32, h: 24, rows: 1, cols: 3 };
  const { plan, out } = building(B);
  const fy = B.y + B.d;
  out.push(L(winY(fy, B.x + 4, B.x + 15, 1.6, 10), { tone: "lo" }), L(winY(fy, B.x + 27, B.x + 38, 1.6, 10), { tone: "lo" }));
  const awning = { x: B.x + 2, y: fy, w: B.w - 4, d: 5, r: 0.4 };
  const stripes = [];
  for (let sx = awning.x + 3; sx < awning.x + awning.w - 1; sx += 3) stripes.push(k.lineOnTop([sx, awning.y], [sx, awning.y + awning.d], 12.4, P));
  out.push(S(k.slabOf(awning, 11.2, 1.2, P, 2, 0.3), { tone: "hi", crease: "lo" }), L(stripes.join(""), { tone: "faint" }));
  // Rooftop: two AC units with closed grilles.
  for (const ax of [B.x + 8, B.x + 24]) {
    const ac = { x: ax, y: B.y + 8, w: 9, d: 7, r: 0.6 };
    out.push(S(k.slabOf(ac, B.h, 4, P, 2, 0.3), { tone: "mid" }));
    out.push(L(k.ring(ax + 4.5, B.y + 11.5, 2.4, B.h + 4, P, 20), { tone: "lo" }));
    out.push(D([at([ax + 4.5, B.y + 11.5, B.h + 4])], { size: 0.45 }));
  }
  return { x: B.x, svg: out.join("") };
}

function tower() {
  const B = { x: -46, y: -68, w: 32, d: 34, h: 56, rows: 6, cols: 4 };
  const { out } = building(B);
  // Water tank on four legs, and a mast with a ball.
  const tx = B.x + 10;
  const ty = B.y + 12;
  for (const [lx, ly] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) out.push(S(k.cylinder(tx + lx, ty + ly, 0.6, B.h, 5, P, 10), { tone: "lo", crease: "none" }));
  out.push(S(k.cylinder(tx, ty, 5, B.h + 5, 7, P, 36, 0.4), { tone: "mid" }));
  out.push(L([B.h + 7.4, B.h + 9.6].map((z) => k.sideArc(tx, ty, 5, z, P, 24)).join(""), { tone: "faint" }));
  out.push(S(k.cylinder(tx, ty, 5.6, B.h + 12, 1, P, 36), { tone: "mid" }));
  const mx = B.x + B.w - 8;
  const my = B.y + B.d - 9;
  out.push(S(k.cylinder(mx, my, 1.6, B.h, 1.2, P, 16), { tone: "lo" }));
  out.push(S(k.cylinder(mx, my, 0.5, B.h + 1.2, 12, P, 10), { tone: "mid", crease: "none" }));
  out.push(S(G.sphereOf([mx, my, B.h + 13.6], 1.1, P), { tone: "hi" }));
  return { x: B.x, svg: out.join("") };
}

function flats() {
  const B = { x: -2, y: -64, w: 46, d: 30, h: 36, rows: 4, cols: 5 };
  const { out } = building(B);
  // Balconies under the windows of the front face.
  const fy = B.y + B.d;
  for (let row = 0; row < B.rows; row++) {
    const z = 9 + row * ((B.h - 12) / B.rows) - 1.4;
    if (row === 0) continue;
    out.push(S(k.slabOf({ x: B.x + 4, y: fy, w: B.w - 8, d: 2.4, r: 0.3 }, z, 0.9, P, 2), { tone: "mid", crease: "none" }));
  }
  const stair = { x: B.x + 26, y: B.y + 6, w: 12, d: 10, r: 0.6 };
  out.push(S(k.slabOf(stair, B.h, 7, P, 2, 0.4), { tone: "mid" }));
  out.push(L(winX(stair.x + stair.w, stair.y + 3, stair.y + 7, B.h, B.h + 5), { tone: "lo" }));
  return { x: B.x, svg: out.join("") };
}

function office() {
  const B = { x: 52, y: -66, w: 32, d: 32, h: 28, rows: 2, cols: 3 };
  const { out } = building(B);
  for (const [px, py] of [[B.x + 9, B.y + 10], [B.x + 21, B.y + 10], [B.x + 15, B.y + 20]]) {
    out.push(S(k.cylinder(px, py, 3, B.h, 2.4, P, 24), { tone: "lo" }));
    out.push(S(G.sphereOf([px, py, B.h + 5], 3.4, P), { tone: "mid" }));
  }
  return { x: B.x, svg: out.join("") };
}

function hotel() {
  const B = { x: 94, y: -68, w: 46, d: 34, h: 44, rows: 5, cols: 5 };
  const { out } = building(B);
  const fy = B.y + B.d;
  // Entrance canopy on two posts at the front.
  const canopy = { x: B.x + 14, y: fy, w: 18, d: 9, r: 0.6 };
  for (const cx of [canopy.x + 2, canopy.x + canopy.w - 2]) out.push(S(k.cylinder(cx, fy + 7.6, 0.6, 0, 8, P, 10), { tone: "mid", crease: "none" }));
  out.push(S(k.slabOf(canopy, 8, 1.2, P, 2, 0.3), { tone: "hi", crease: "lo" }));
  out.push(L(k.planOutline(k.insetPlan(canopy, 1.4), 9.2, P, 2), { tone: "faint" }));
  return { x: B.x, svg: out.join("") };
}

// ---------- street furniture ----------
function lamp(x, y, toward) {
  // toward: -1 reaches over the road from the near walk, +1 from the far walk.
  const out = [S(k.cylinder(x, y, 2, WALK_H, 1.4, P, 20), { tone: "lo" })];
  const arm = toward < 0 ? { x: x - 0.6, y: y - 8, w: 1.2, d: 8, r: 0.3 } : { x: x - 0.6, y, w: 1.2, d: 8, r: 0.3 };
  const headY = toward < 0 ? y - 8 : y + 8;
  const parts = [
    S(k.cylinder(x, y, 0.7, WALK_H + 1.4, 22.6, P, 12), { tone: "mid", crease: "none" }),
    S(k.slabOf(arm, 24.2, 1, P, 2), { tone: "mid", crease: "none" }),
    S(k.slabOf({ x: x - 1.8, y: headY - 1.8, w: 3.6, d: 3.6, r: 0.8 }, 22.4, 2.4, P, 3, 0.3), { tone: "hi", crease: "lo" }),
  ];
  // Paint the arm and head in depth order around the pole.
  out.push(...(toward < 0 ? [parts[1], parts[2], parts[0]] : parts));
  return { x, svg: out.join("") };
}

function tree(x, y) {
  const out = [L(k.ring(x, y, 3.2, WALK_H, P, 24), { tone: "lo" }), S(k.cylinder(x, y, 1, WALK_H, 9, P, 14), { tone: "mid", crease: "none" })];
  out.push(S(G.sphereOf([x, y, 15], 6, P), { tone: "mid" }));
  return { x, svg: out.join("") };
}

function bollard(x, y) {
  return { x, svg: S(k.cylinder(x, y, 0.9, WALK_H, 4, P, 14), { tone: "mid", crease: "none" }) + S(G.sphereOf([x, y, WALK_H + 4], 0.9, P), { tone: "hi" }) };
}

function hydrant(x, y) {
  const out = [S(k.cylinder(x, y, 1.6, WALK_H, 0.8, P, 16), { tone: "lo" }), S(k.cylinder(x, y, 1.1, WALK_H + 0.8, 4.4, P, 16), { tone: "mid" })];
  out.push(L(k.sideArc(x, y, 1.1, WALK_H + 3, P, 12), { tone: "faint" }));
  out.push(S(G.sphereOf([x, y, WALK_H + 5.2], 1.1, P), { tone: "mid" }));
  return { x, svg: out.join("") };
}

function shelter() {
  // The taxi stand's shelter on the far walk, facing the stand bay.
  const x0 = STAND_X - 14;
  const y0 = FAR_WALK.y + 2;
  const out = [];
  out.push(S(k.slabOf({ x: x0, y: y0, w: 28, d: 1, r: 0.2 }, WALK_H, 15, P, 2), { tone: "lo", crease: "none" }));
  for (const px of [x0 + 1.2, x0 + 26.8]) out.push(S(k.cylinder(px, y0 + 8, 0.6, WALK_H, 15, P, 10), { tone: "mid", crease: "none" }));
  const bench = { x: x0 + 5, y: y0 + 1.4, w: 18, d: 3.6, r: 0.4 };
  for (const lx of [bench.x + 2, bench.x + bench.w - 2]) out.push(S(k.slabOf({ x: lx - 0.5, y: bench.y + 1.3, w: 1, d: 1, r: 0.2 }, WALK_H, 3, P, 2), { tone: "lo", crease: "none" }));
  out.push(S(k.slabOf(bench, WALK_H + 3, 0.8, P, 2, 0.2), { tone: "mid" }));
  const roof = { x: x0 - 1, y: y0 - 0.6, w: 30, d: 10.4, r: 0.8 };
  out.push(S(k.slabOf(roof, WALK_H + 15, 1.4, P, 3, 0.4), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(roof, 1.6), WALK_H + 16.4, P, 3), { tone: "faint" }));
  // Stand sign: a post with a plate carrying the checker band.
  const sx = x0 + 32;
  const sy = y0 + 9;
  out.push(S(k.cylinder(sx, sy, 0.5, WALK_H, 14, P, 10), { tone: "mid", crease: "none" }));
  const plate = { x: sx - 3.5, y: sy + 0.5, w: 7, d: 0.8, r: 0.1 };
  out.push(S(k.slabOf(plate, WALK_H + 10, 4.6, P, 1), { tone: "hi", crease: "lo" }));
  const fy = plate.y + plate.d;
  const checks = [];
  for (let cx = plate.x + 1; cx < plate.x + plate.w; cx += 1) checks.push(k.segment([cx, fy, WALK_H + 12.2], [cx, fy, WALK_H + 13.4], P));
  checks.push(k.segment([plate.x, fy, WALK_H + 12.2], [plate.x + plate.w, fy, WALK_H + 12.2], P), k.segment([plate.x, fy, WALK_H + 13.4], [plate.x + plate.w, fy, WALK_H + 13.4], P));
  out.push(L(checks.join(""), { tone: "mid" }));
  return { x: x0, svg: out.join("") };
}

function pickupPin(ping) {
  const [x, y] = PIN;
  const out = [S(k.cylinder(x, y, 9.4, WALK_H, 0.8, P, 48, 0.3), { tone: "lo" })];
  out.push(L(k.ring(x, y, 8.4, WALK_H + 0.8, P, 48), { tone: "faint" }));
  out.push(ping);
  out.push(S(k.cylinder(x, y, 1.8, WALK_H + 0.8, 1.2, P, 20), { tone: "mid" }));
  out.push(S(k.cylinder(x, y, 0.8, WALK_H + 2, 14, P, 12), { tone: "hi", crease: "none" }));
  // The head: a cone into a ball, the map pin everyone knows.
  out.push(S(G.solidOf([[0, 0.8], [5.2, 3.3]], vertical(x, y, WALK_H + 15), P), { tone: "hi", crease: "lo" }));
  out.push(S(G.sphereOf([x, y, WALK_H + 21.6], 4.2, P), { tone: "hi" }));
  return { x: x - 9.4, svg: out.join("") };
}

function destinationFlag(flagSvg) {
  const [x, y] = FLAG;
  const out = [S(k.cylinder(x, y, 3.2, WALK_H, 1, P, 24, 0.3), { tone: "lo" })];
  out.push(S(k.cylinder(x, y, 0.7, WALK_H + 1, 30, P, 12), { tone: "mid", crease: "none" }));
  out.push(S(G.sphereOf([x, y, WALK_H + 31.6], 1.1, P), { tone: "hi" }));
  out.push(flagSvg);
  return { x: x - 3.2, svg: out.join("") };
}

// The flag, built at z = 0 and raised by translating along z.
const FLAG_PLAN = { x: FLAG[0] + 0.9, y: FLAG[1] - 0.3, w: 12, d: 0.6, r: 0.1 };
function flagCloth() {
  const fy = FLAG_PLAN.y + FLAG_PLAN.d;
  const x0 = FLAG_PLAN.x;
  const x1 = FLAG_PLAN.x + FLAG_PLAN.w;
  const grid = [];
  for (const gx of [x0 + 3, x0 + 6, x0 + 9]) grid.push(k.segment([gx, fy, 0], [gx, fy, 7], P));
  for (const gz of [2.33, 4.67]) grid.push(k.segment([x0, fy, gz], [x1, fy, gz], P));
  return S(k.slabOf(FLAG_PLAN, 0, 7, P, 1), { tone: "hi", crease: "lo" }) + L(grid.join(""), { tone: "mid" });
}

function bench(x, y) {
  const seat = { x: x - 7, y: y - 1.6, w: 14, d: 3.2, r: 0.4 };
  const out = [];
  for (const lx of [seat.x + 1.5, seat.x + seat.w - 1.5]) out.push(S(k.slabOf({ x: lx - 0.5, y: y - 0.5, w: 1, d: 1, r: 0.2 }, WALK_H, 2.6, P, 2), { tone: "lo", crease: "none" }));
  out.push(S(k.slabOf(seat, WALK_H + 2.6, 0.8, P, 2, 0.2), { tone: "mid" }));
  out.push(S(k.slabOf({ x: seat.x, y: seat.y + seat.d - 0.6, w: seat.w, d: 0.6, r: 0.1 }, WALK_H + 3.4, 3.2, P, 1), { tone: "mid", crease: "none" }));
  return { x: seat.x, svg: out.join("") };
}

// ---------- the lawn in front: hedges, ruler strip, label plate ----------
function lawn() {
  const out = [];
  const LAWN = { x: -146, y: 43, w: 292, d: 12, r: 2 };
  out.push(L(k.planOutline(LAWN, 0, P, 3), { tone: "faint" }));
  const strip = { x: -146, y: PLATE.y + PLATE.d - 9, w: 214, d: 5.6, r: 1 };
  out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(strip.x + 4, strip.x + strip.w - 4, 4, 5, strip.y + 0.6, 0.6, [1.6, 3.2], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(D([at([strip.x + 2, strip.y + 2.8, 0.6]), at([strip.x + strip.w - 2, strip.y + 2.8, 0.6])], { size: 0.4 }));
  const label = { x: 84, y: PLATE.y + PLATE.d - 13, w: 56, d: 9.6, r: 1 };
  out.push(S(k.slabOf(label, 0, 0.8, P, 3, 0.3), { tone: "lo" }));
  out.push(L(k.planOutline(k.insetPlan(label, 1.4), 0.8, P, 3), { tone: "faint" }));
  const rules = [[label.x + 5, 34], [label.x + 5, 24], [label.x + 5, 30]].map(([x0, len], index) => k.lineOnTop([x0, label.y + 3 + index * 1.8], [x0 + len, label.y + 3 + index * 1.8], 0.8, P));
  out.push(L(rules.join(""), { tone: "lo", free: true }));
  out.push(D([at([label.x + 2.6, label.y + label.d / 2, 0.8]), at([label.x + label.w - 2.6, label.y + label.d / 2, 0.8])], { size: 0.45 }));
  return out.join("");
}

// Hedges stand on the lawn, nearer than anything on the walk, so they paint last.
function hedges() {
  const out = [];
  for (const hx of [-130, -86, -6, 38, 120]) {
    const plan = { x: hx, y: 45, w: 26, d: 6, r: 2.6 };
    out.push(halo(plan, 0, 1, 3), S(k.slabOf(plan, 0, 3.2, P, 4, 0.3), { tone: "mid" }));
    out.push(L(k.planOutline(k.insetPlan(plan, 1.4), 3.2, P, 4), { tone: "faint" }));
  }
  return out.join("");
}

// ---------- the cab ----------
function wheel([s0, s1], x) {
  const F = G.frameAlong([x, 0, WHEEL_Z], [0, 1, 0]);
  return S(G.disc(s0, s1, WHEEL_R, F, P), { tone: "lo" });
}

function cab() {
  const out = [halo({ x: -14, y: 2, w: 28, d: 13.6, r: 3 }, 0.4, 0.1, 3)];
  for (const x of WHEELS_X) out.push(wheel(FAR_WHEEL, x));
  out.push(S(k.slabOf({ x: -14.4, y: 3.2, w: 1.6, d: 10.6, r: 0.5 }, 3.4, 2.4, P, 2), { tone: "mid", crease: "none" }));
  // Body with its belt band: two seams round the corners and checker ticks between them on the near side.
  const fy = BODY.y + BODY.d;
  const checks = [];
  for (let x = -11; x <= 11; x += 2) checks.push(k.segment([x, fy, 6], [x, fy, 7.4], P));
  const door = [k.segment([-0.8, fy, BODY_Z], [-0.8, fy, BODY_TOP], P), k.segment([-7.6, fy, BODY_Z], [-7.6, fy, BODY_TOP], P)];
  const inner = L(k.sideSeam(BODY, 6, P, 4) + k.sideSeam(BODY, 7.4, P, 4), { tone: "lo" }) + L(checks.join("") + door.join(""), { tone: "lo" });
  out.push(S(k.slabOf(BODY, BODY_Z, BODY_TOP - BODY_Z, P, 4, 0.6), { tone: "hi", crease: "lo", lit: true, inner }));
  out.push(D([at([-4.2, fy, 8.6]), at([3, fy, 8.6])], { size: 0.4, tone: "mid" }));
  const front = BODY.x + BODY.w;
  out.push(S(k.slabOf({ x: front - 0.2, y: 3.2, w: 1.6, d: 10.6, r: 0.5 }, 3.4, 2.4, P, 2), { tone: "mid", crease: "none" }));
  out.push(L(k.planOutline({ x: front - 0.1, y: 3.6, w: 0.2, d: 2.6, r: 0 }, 7.8, P, 1) + winX(front, 4, 6.4, 7, 8.2) + winX(front, 10.6, 13, 7, 8.2), { tone: "mid" }));
  // Cabin: windshield and two side windows, closed outlines on their faces.
  const cy = CABIN.y + CABIN.d;
  const cx = CABIN.x + CABIN.w;
  out.push(S(k.slabOf(CABIN, BODY_TOP, CABIN_TOP - BODY_TOP, P, 3, 0.4), { tone: "hi", crease: "lo" }));
  out.push(L(winY(cy, -6.4, -1.4, 10.4, 13.8) + winY(cy, -0.4, 4.6, 10.4, 13.8) + winX(cx, 4.4, 12.4, 10.4, 13.8), { tone: "mid" }));
  out.push(S(k.slabOf({ x: 4.2, y: cy, w: 1.4, d: 1.2, r: 0.3 }, BODY_TOP + 0.2, 1.2, P, 2), { tone: "mid", crease: "none" }));
  // Roof sign: unlit and lit copies, crossfaded by the stage.
  const sign = k.slabOf(SIGN, CABIN_TOP, SIGN_TOP - CABIN_TOP, P, 2, 0.3);
  out.push(S(sign, { tone: "mid" }));
  out.push(`<g data-part="sign-lit" style="transition:opacity .6s var(--anatomy-ease)">${S(sign, { tone: "hi", crease: "lo", lit: true })}</g>`);
  for (const x of WHEELS_X) {
    out.push(wheel(NEAR_WHEEL, x));
    const F = G.frameAlong([x, 0, WHEEL_Z], [0, 1, 0]);
    out.push(S(G.disc(NEAR_WHEEL[1], HUB_FACE, HUB_R, F, P), { tone: "mid", crease: "none" }));
    out.push(`<path class="iso-line" data-tone="hi" data-part="spokes" data-x="${x}" d=""/>`);
    out.push(D([at([x, HUB_FACE, WHEEL_Z])], { size: 0.4, tone: "hi" }));
  }
  return out.join("");
}

function cabScale() {
  const [ax, ay] = at([0, 8.5, 0.4]);
  const [bx, by] = at([0, CAB_Y, 0.4]);
  return `translate(${bx.toFixed(2)} ${by.toFixed(2)}) scale(${CAB_SCALE}) translate(${(-ax).toFixed(2)} ${(-ay).toFixed(2)})`;
}

// ---------- assembly ----------
const ping = `<g data-part="ping">${[0, 1].map(() => `<path class="iso-line" data-tone="hi" d="${k.ring(PIN[0], PIN[1], 4, WALK_H + 0.8, P, 48)}" opacity="0"/>`).join("")}</g>`;
const flag = `<g data-part="flag" transform="${k.translateAlong(P, [0, 0, FLAG_LOW])}">${flagCloth()}</g>`;

const farItems = byX([shop(), tower(), flats(), office(), hotel()]);
const farStreet = byX([shelter(), lamp(-60, -24, 1), tree(-28, -23), lamp(28, -24, 1), hydrant(48, -21), tree(88, -23), lamp(132, -24, 1)]);
const nearStreet = byX([
  lamp(-142, 34, -1),
  hydrant(-104, 30),
  tree(-82, 35),
  bollard(PICK_X - 13, 27.4),
  pickupPin(ping),
  bollard(PICK_X + 13, 27.4),
  bench(4, 36),
  lamp(34, 34, -1),
  tree(66, 35),
  destinationFlag(flag),
  bollard(144, 27.4),
]);

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label: "A tabletop street model. A cab waits at a taxi stand, drives to the pickup pin, then on to the destination flag.",
  body: [
    `<g data-part="scene" style="transition:opacity .9s var(--anatomy-ease)">`,
    plate(),
    lawn(),
    walk(FAR_WALK),
    farItems,
    farStreet,
    road(),
    kerb(FAR_KERB),
    `<g data-part="cab" style="transition:opacity .6s var(--anatomy-ease)" transform="${k.translateAlong(P, [STAND_X, 0, 0])}"><g transform="${cabScale()}">${cab()}</g></g>`,
    kerb(NEAR_KERB),
    walk(NEAR_WALK),
    nearStreet,
    hedges(),
    `</g>`,
  ],
});

// Order: flat plate markings, then everything by y band. Rays run toward −x and −y, so a band whose
// y lies wholly beyond the cab's (1.8–15.6) is always behind it, and one wholly nearer is in front.

const card = k.plateHtml({
  fig: "Fig 3",
  title: "Trip route",
  hint: "Live booking status",
  readout: "SEARCHING · finding a driver",
  body: `<div class="iso-stage" role="img" aria-label="Trip status">${svg}</div><span data-part="sr" aria-live="polite" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap"></span>`,
});

const live = `
const CARD = ${JSON.stringify(card)};
const P = ${JSON.stringify(P)};
const X = { stand: ${STAND_X}, pick: ${PICK_STOP}, dest: ${DEST_X} };
const PIN = ${JSON.stringify(PIN)}, PING_Z = ${WALK_H + 0.8}, FLAG_LOW = ${FLAG_LOW}, FLAG_HIGH = ${FLAG_HIGH};
const WHEEL_R = ${WHEEL_R}, WHEEL_Z = ${WHEEL_Z}, HUB_FACE = ${HUB_FACE}, HUB_R = ${HUB_R};
const ACC = 34, VMAX = 46;
const TEXT = {
  SEARCHING: ["SEARCHING · finding a driver"],
  ACCEPTED: ["ACCEPTED · driver to pickup", "ACCEPTED · driver at pickup"],
  STARTED: ["STARTED · on the way", "STARTED · at destination"],
  COMPLETED: ["COMPLETED · arrived, fare due"],
  CANCELLED: ["CANCELLED · booking cancelled"],
};
const TOUR = [["SEARCHING", 3.4], ["ACCEPTED", 1.6], ["STARTED", 1.8], ["COMPLETED", 3.2]];

function mount(el, opts = {}) {
  el.innerHTML = CARD;
  el.classList.add("iso");
  const scheme = matchMedia("(prefers-color-scheme: light)");
  const paint = () => { el.dataset.theme = opts.theme || (scheme.matches ? "light" : "dark"); };
  paint();
  if (!opts.theme) scheme.addEventListener("change", paint);
  const still = matchMedia("(prefers-reduced-motion: reduce)");
  const q = (part) => el.querySelector('[data-part="' + part + '"]');
  const stageEl = el.querySelector(".iso-stage");
  const readout = el.querySelector("[data-readout]");
  const sr = q("sr"), scene = q("scene"), cabEl = q("cab"), signLit = q("sign-lit"), flagEl = q("flag");
  const rings = [...q("ping").children];
  const spokes = [...el.querySelectorAll('[data-part="spokes"]')];

  let stage = "SEARCHING", info = {}, touring = true, tourAt = 0, tourStep = 0, resetting = 0;
  let x = X.stand, v = 0, target = X.stand, flagZ = FLAG_LOW, pingT = 0, arrivedFor = 0;
  let frame = 0, last = 0, visible = false;

  const goal = (s) => (s === "SEARCHING" ? X.stand : s === "ACCEPTED" ? X.pick : s === "STARTED" || s === "COMPLETED" ? X.dest : null);
  function enter(next, snap) {
    stage = next;
    arrivedFor = 0;
    const g = goal(next);
    // A cancelled cab brakes to a stop from wherever it is.
    target = g === null ? x + Math.sign(v) * (v * v) / (2 * ACC) : g;
    if (snap) { x = target; v = 0; }
    if (next === "COMPLETED" && snap) flagZ = FLAG_HIGH;
    scene.style.opacity = next === "CANCELLED" ? "0.5" : "1";
    signLit.style.opacity = next === "SEARCHING" || next === "COMPLETED" ? "1" : "0";
    describe();
    run();
  }
  function describe() {
    const lines = TEXT[stage];
    const arrived = Math.abs(target - x) < 0.05 && v === 0;
    const text = lines[arrived && lines[1] ? 1 : 0];
    if (readout.textContent !== text) readout.textContent = text;
    const label = "Trip status: " + text + (info.pickup ? ". Pickup: " + info.pickup : "") + (info.destination ? ". Destination: " + info.destination : "");
    if (stageEl.getAttribute("aria-label") !== label) { stageEl.setAttribute("aria-label", label); sr.textContent = label; }
  }
  function draw() {
    cabEl.setAttribute("transform", translateAlong(P, [x, 0, 0]));
    flagEl.setAttribute("transform", translateAlong(P, [0, 0, flagZ]));
    const turn = x / WHEEL_R;
    for (const path of spokes) {
      const cx = +path.dataset.x;
      let d = "";
      for (let i = 0; i < 3; i++) {
        const a = turn + (i * Math.PI * 2) / 3;
        const tip = iso([cx + Math.sin(a) * (HUB_R - 0.1), HUB_FACE, WHEEL_Z + Math.cos(a) * (HUB_R - 0.1)], P);
        const hub = iso([cx, HUB_FACE, WHEEL_Z], P);
        d += "M" + hub[0].toFixed(2) + " " + hub[1].toFixed(2) + "L" + tip[0].toFixed(2) + " " + tip[1].toFixed(2);
      }
      path.setAttribute("d", d);
    }
    const searching = stage === "SEARCHING";
    rings.forEach((ring, i) => {
      const phase = still.matches ? 0.45 : (pingT / 2.4 + i / 2) % 1;
      const r = 2.6 + phase * 5.6;
      const alpha = searching ? (still.matches ? 0.6 : Math.sin(Math.PI * phase) * 0.9) : 0;
      ring.setAttribute("d", ringPath(r));
      ring.setAttribute("opacity", alpha.toFixed(3));
    });
    describe();
  }
  const ringPath = (r) => ring(PIN[0], PIN[1], r, PING_Z, P, 48);

  function tick(now) {
    const dt = last ? Math.min((now - last) / 1000, 1 / 20) : 1 / 60;
    last = now;
    pingT += dt;
    if (still.matches) { x = target; v = 0; flagZ = stage === "COMPLETED" ? FLAG_HIGH : FLAG_LOW; }
    else {
      const d = target - x;
      const want = Math.sign(d) * Math.min(VMAX, Math.sqrt(2 * ACC * Math.abs(d)));
      v += Math.max(-ACC * dt, Math.min(ACC * dt, want - v));
      x += v * dt;
      if (Math.abs(target - x) < 0.05 && Math.abs(v) < 1.2) { x = target; v = 0; }
      const flagGoal = stage === "COMPLETED" && x === target ? FLAG_HIGH : FLAG_LOW;
      flagZ += (flagGoal - flagZ) * (1 - Math.exp(-dt / 0.45));
      if (Math.abs(flagGoal - flagZ) < 0.01) flagZ = flagGoal;
    }
    if (x === target && v === 0) arrivedFor += dt;
    if (touring && !still.matches) tour(dt);
    draw();
    const resting = !touring && x === target && v === 0 && (flagZ === FLAG_LOW || flagZ === FLAG_HIGH) && (stage !== "SEARCHING" || still.matches);
    frame = visible && !resting ? requestAnimationFrame(tick) : 0;
  }
  function tour(dt) {
    if (resetting) {
      resetting -= dt;
      if (resetting <= 0.6 && cabEl.style.opacity !== "1" && x !== X.stand) { x = X.stand; v = 0; flagZ = FLAG_LOW; enter("SEARCHING", true); cabEl.style.opacity = "1"; }
      if (resetting <= 0) { resetting = 0; tourStep = 0; tourAt = 0; }
      return;
    }
    const [name, hold] = TOUR[tourStep];
    tourAt += dt;
    const moving = goal(name) !== null && (x !== target || v !== 0);
    if (!moving && arrivedFor >= hold) {
      if (tourStep === TOUR.length - 1) { resetting = 1.4; cabEl.style.opacity = "0"; return; }
      tourStep += 1;
      enter(TOUR[tourStep][0]);
    }
  }
  function run() { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } }
  const io = new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" });
  io.observe(stageEl);
  if (still.matches) touring = false;
  enter("SEARCHING", true);
  draw();

  let first = true;
  return {
    set(next, detail) {
      if (!TEXT[next]) return;
      if (detail) info = detail;
      const wasTouring = touring;
      touring = false;
      resetting = 0;
      cabEl.style.opacity = "1";
      if (next === stage && !wasTouring) { describe(); return; }
      // The first real status places the cab where that stage begins, then drives.
      if (first) {
        first = false;
        const start = next === "ACCEPTED" ? X.stand : next === "STARTED" ? X.pick : next === "COMPLETED" ? X.dest : next === "CANCELLED" ? X.stand : X.stand;
        x = start; v = 0; flagZ = FLAG_LOW;
        enter(next, next === "COMPLETED" || next === "CANCELLED" || next === "SEARCHING");
        draw();
        return;
      }
      enter(next);
    },
    destroy() {
      cancelAnimationFrame(frame);
      frame = 0;
      io.disconnect();
      scheme.removeEventListener("change", paint);
      el.innerHTML = "";
      el.classList.remove("iso");
    },
  };
}
window.CabFig = window.CabFig || {};
window.CabFig.tripRoute = { mount };
`;

const script = `/* Generated by figures-src/trip-route/build.mjs — do not edit. */\n(function () {\n${kitScript()}\n${live}\n})();\n`;
writeFileSync(OUT, script);

const preview = (theme) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Trip route</title>
<link rel="stylesheet" href="../../figures/iso.css">
<style>*{box-sizing:border-box}body{margin:0;background:${theme === "light" ? "#f2f2ef" : "#0b0b0b"};color:#888;font:14px/1.6 system-ui,sans-serif}main{width:min(640px,100% - 32px);margin:48px auto}</style></head>
<body><main><div id="fig"></div></main>
<script src="../../figures/trip-route.js"></script>
<script>window.__trip = CabFig.tripRoute.mount(document.getElementById("fig"), { theme: "${theme}" });
const s = new URLSearchParams(location.search).get("stage"); if (s) __trip.set(s, { pickup: "T. Nagar", destination: "Chennai Airport" });</script>
</body></html>`;
writeFileSync(join(HERE, "preview.html"), preview("dark"));
writeFileSync(join(HERE, "preview-light.html"), preview("light"));
console.log("wrote", OUT, (script.length / 1024).toFixed(0) + " KB");
