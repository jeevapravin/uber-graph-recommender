/* Receipt printer figure — built by figures-src/receipt-printer/build.mjs; do not edit by hand. */
(function () {
"use strict";
const AZIMUTH = 45;
const ELEVATION = 30;
const SHADES = 4;
const RADIANS = Math.PI / 180;
const UNIT = Math.sqrt(1.6);
function cameraOf({ scale, azimuth = AZIMUTH, elevation = ELEVATION }) {
    const a = azimuth * RADIANS;
    const e = elevation * RADIANS;
    return { sinA: Math.sin(a), cosA: Math.cos(a), sinE: Math.sin(e), cosE: Math.cos(e), k: scale * UNIT };
}
function iso([x, y, z], projection) {
    const { origin } = projection;
    const { sinA, cosA, sinE, cosE, k } = cameraOf(projection);
    return [origin[0] + (x * sinA - y * cosA) * k, origin[1] + ((x * cosA + y * sinA) * sinE - z * cosE) * k];
}
function towardViewer(projection) {
    const { sinA, cosA } = cameraOf(projection);
    return [cosA, sinA];
}
function depthOf([x, y, z], projection) {
    const { sinA, cosA, sinE, cosE } = cameraOf(projection);
    return (x * cosA + y * sinA) * cosE + z * sinE;
}
const tenth = (value) => {
    const text = (Math.round(value * 10) / 10).toFixed(1).replace(/\.0$/, "");
    return text === "-0" ? "0" : text;
};
function pathOf(points, closed = false) {
    if (!points.length)
        return "";
    return points.map(([x, y], at) => `${at ? "L" : "M"}${tenth(x)} ${tenth(y)}`).join("") + (closed ? "Z" : "");
}
const joinPaths = (paths) => paths.filter(Boolean).join("");
function roundedPlan({ x, y, w, d, r }, steps = 8) {
    const radius = Math.max(0, Math.min(r, w / 2, d / 2));
    const corners = [
        [x + w - radius, y + radius, -90],
        [x + w - radius, y + d - radius, 0],
        [x + radius, y + d - radius, 90],
        [x + radius, y + radius, 180],
    ];
    const out = [];
    for (const [cx, cy, start] of corners) {
        const count = radius > 0 ? steps : 0;
        for (let step = 0; step <= count; step++) {
            const angle = (start + (count ? (90 * step) / count : 45)) * RADIANS;
            out.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
        }
    }
    return out;
}
function signedArea(points) {
    let area = 0;
    for (let index = 0; index < points.length; index++) {
        const [ax, ay] = points[index];
        const [bx, by] = points[(index + 1) % points.length];
        area += ax * by - bx * ay;
    }
    return area / 2;
}
const oriented = (points) => (signedArea(points) < 0 ? [...points].reverse() : points);
function convexHull(points) {
    const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (sorted.length < 3)
        return sorted;
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [];
    for (const point of sorted) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0)
            lower.pop();
        lower.push(point);
    }
    const upper = [];
    for (let index = sorted.length - 1; index >= 0; index--) {
        const point = sorted[index];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0)
            upper.pop();
        upper.push(point);
    }
    return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
function runsOf(flags, want) {
    const count = flags.length;
    const runs = [];
    const start = flags.findIndex((flag, index) => flag !== flags[(index + count - 1) % count]);
    if (start < 0)
        return flags[0] === want ? [Array.from({ length: count + 1 }, (_, index) => index % count)] : [];
    let run = null;
    for (let step = 0; step < count; step++) {
        const index = (start + step) % count;
        if (flags[index] === want) {
            if (!run)
                run = [index];
            run.push((index + 1) % count);
        }
        else if (run) {
            runs.push(run);
            run = null;
        }
    }
    if (run)
        runs.push(run);
    return runs;
}
function extrude(ring, z, height, projection, options = {}) {
    const convex = options.convex ?? true;
    const count = ring.length;
    const counter = signedArea(ring) > 0;
    const [vx, vy] = towardViewer(projection);
    const { sinA, cosA } = cameraOf(projection);
    const normals = ring.map(([ax, ay], index) => {
        const [bx, by] = ring[(index + 1) % count];
        const dx = bx - ax;
        const dy = by - ay;
        const length = Math.hypot(dx, dy) || 1;
        return (counter ? [dy / length, -dx / length] : [-dy / length, dx / length]);
    });
    const facing = normals.map(([nx, ny]) => nx * vx + ny * vy > 1e-9);
    const top = ring.map(([x, y]) => iso([x, y, z + height], projection));
    const bottom = ring.map(([x, y]) => iso([x, y, z], projection));
    const outline = [];
    const crease = [];
    for (const run of runsOf(facing, false))
        outline.push(pathOf(run.map((index) => top[index])));
    for (const run of runsOf(facing, true)) {
        crease.push(pathOf(run.map((index) => top[index])));
        if (height > 0)
            outline.push(pathOf(run.map((index) => bottom[index])));
    }
    if (height > 0) {
        for (let index = 0; index < count; index++) {
            if (facing[(index + count - 1) % count] !== facing[index])
                outline.push(pathOf([top[index], bottom[index]]));
        }
    }
    let fill;
    if (convex) {
        fill = pathOf(convexHull([...top, ...bottom]), true);
    }
    else {
        const parts = [pathOf(oriented(top), true), pathOf(oriented(bottom), true)];
        for (let index = 0; index < count; index++) {
            if (!facing[index])
                continue;
            const next = (index + 1) % count;
            parts.push(pathOf(oriented([top[index], top[next], bottom[next], bottom[index]]), true));
        }
        fill = parts.join("");
    }
    const buckets = Array.from({ length: SHADES }, () => []);
    if (height > 0) {
        const [lx, ly] = [-sinA, cosA];
        for (let index = 0; index < count; index++) {
            if (!facing[index])
                continue;
            const [nx, ny] = normals[index];
            const lit = (nx * lx + ny * ly + 1) / 2;
            const shade = Math.min(SHADES - 1, Math.max(0, Math.floor(lit * SHADES)));
            const next = (index + 1) % count;
            buckets[shade].push(pathOf(oriented([top[index], top[next], bottom[next], bottom[index]]), true));
        }
    }
    let bevel;
    if (options.bevel && options.bevel > 0) {
        const by = options.bevel;
        const inset = ring.map(([x, y], index) => {
            const [ax, ay] = normals[(index + count - 1) % count];
            const [bx, by2] = normals[index];
            const mx = ax + bx;
            const my = ay + by2;
            const length = Math.hypot(mx, my) || 1;
            return [x - (mx / length) * by, y - (my / length) * by];
        });
        const insetTop = inset.map(([x, y]) => iso([x, y, z + height], projection));
        bevel = runsOf(facing, true)
            .map((run) => pathOf([top[run[0]], ...run.slice(1, -1).map((index) => insetTop[index]), top[run[run.length - 1]]]))
            .join("");
    }
    return {
        fill,
        outline: outline.join(""),
        crease: crease.join(""),
        top: pathOf(oriented(top), true),
        shades: buckets.map((paths) => paths.join("")),
        bevel,
    };
}
const ringOf = (plan, steps = 8) => roundedPlan(plan, steps);
function slabOf(plan, z, height, projection, steps = 8, bevel = 0) {
    return extrude(ringOf(plan, steps), z, height, projection, { convex: true, bevel });
}
function circleRing(cx, cy, radius, steps = 40) {
    return Array.from({ length: steps }, (_, step) => {
        const angle = (step / steps) * Math.PI * 2;
        return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
    });
}
function cylinder(cx, cy, radius, z, height, projection, steps = 32, bevel = 0) {
    return extrude(circleRing(cx, cy, radius, steps), z, height, projection, { convex: true, bevel });
}
const insetPlan = ({ x, y, w, d, r }, by) => ({ x: x + by, y: y + by, w: w - by * 2, d: d - by * 2, r: Math.max(0, r - by) });
function onTop(points, z, projection, closed = false) {
    return pathOf(points.map(([x, y]) => iso([x, y, z], projection)), closed);
}
const planOutline = (plan, z, projection, steps = 8) => onTop(ringOf(plan, steps), z, projection, true);
const lineOnTop = (from, to, z, projection) => onTop([from, to], z, projection);
const segment = (from, to, projection) => pathOf([iso(from, projection), iso(to, projection)]);
const rise = (at, from, to, projection) => segment([at[0], at[1], from], [at[0], at[1], to], projection);
const ring = (cx, cy, radius, z, projection, steps = 40) => onTop(circleRing(cx, cy, radius, steps), z, projection, true);
const pointsAt = (points, projection) => points.map((point) => iso(point, projection));
function dotGrid(x, y, columns, rows, gap, z, projection) {
    const dots = [];
    for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++)
            dots.push(iso([x + column * gap, y + row * gap, z], projection));
    }
    return dots;
}
function corners({ x, y, w, d }, inset = 0) {
    return [
        [x + inset, y + inset],
        [x + w - inset, y + inset],
        [x + inset, y + d - inset],
        [x + w - inset, y + d - inset],
    ];
}
function boxCorners({ x, y, w, d }, z0, z1) {
    const out = [];
    for (const px of [x, x + w])
        for (const py of [y, y + d])
            for (const z of [z0, z1])
                out.push([px, py, z]);
    return out;
}
function knurl(cx, cy, radius, z0, z1, count, projection, inset = 0.4) {
    const [vx, vy] = towardViewer(projection);
    const lines = [];
    for (let index = 0; index < count; index++) {
        const angle = (index / count) * Math.PI * 2;
        const nx = Math.cos(angle);
        const ny = Math.sin(angle);
        if (nx * vx + ny * vy < 0.15)
            continue;
        lines.push(segment([cx + radius * nx, cy + radius * ny, z0 + inset], [cx + radius * nx, cy + radius * ny, z1 - inset], projection));
    }
    return lines.join("");
}
function sideArc(cx, cy, radius, z, projection, steps = 24) {
    const [vx, vy] = towardViewer(projection);
    const facing = Math.atan2(vy, vx);
    const points = [];
    for (let step = 0; step <= steps; step++) {
        const angle = facing - Math.PI / 2 + (step / steps) * Math.PI;
        points.push(iso([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle), z], projection));
    }
    return pathOf(points);
}
function ringSeam(ring, z, projection) {
    const count = ring.length;
    const counter = signedArea(ring) > 0;
    const [vx, vy] = towardViewer(projection);
    const facing = ring.map(([ax, ay], index) => {
        const [bx, by] = ring[(index + 1) % count];
        const dx = bx - ax;
        const dy = by - ay;
        const [nx, ny] = counter ? [dy, -dx] : [-dy, dx];
        return nx * vx + ny * vy > 1e-9;
    });
    return runsOf(facing, true).map((run) => pathOf(run.map((index) => iso([ring[index][0], ring[index][1], z], projection)))).join("");
}
const sideSeam = (plan, z, projection, steps = 8) => ringSeam(ringOf(plan, steps), z, projection);
function sideRing(center, radius, axis, projection, steps = 20) {
    const [px, py, pz] = center;
    const points = [];
    for (let step = 0; step < steps; step++) {
        const angle = (step / steps) * Math.PI * 2;
        const u = radius * Math.cos(angle);
        const v = radius * Math.sin(angle);
        points.push(iso(axis === "x" ? [px, py + u, pz + v] : [px + u, py, pz + v], projection));
    }
    return pathOf(points, true);
}
function coil(from, to, center, radius, turns, axis, projection, perTurn = 16) {
    const count = Math.max(1, Math.round(turns * perTurn));
    const back = [];
    const front = [];
    let run = [];
    let near = null;
    for (let index = 0; index <= count; index++) {
        const share = index / count;
        const angle = share * turns * Math.PI * 2;
        const u = radius * Math.cos(angle);
        const v = radius * Math.sin(angle);
        const along = from + (to - from) * share;
        const point = axis === "x" ? [along, center[0] + u, center[1] + v] : [center[0] + u, along, center[1] + v];
        const normal = axis === "x" ? [0, Math.cos(angle), Math.sin(angle)] : [Math.cos(angle), 0, Math.sin(angle)];
        const facing = depthOf(normal, projection) > 0;
        const flat = iso(point, projection);
        if (near === null)
            near = facing;
        if (facing !== near) {
            run.push(flat);
            (near ? front : back).push(pathOf(run));
            run = [flat];
            near = facing;
            continue;
        }
        run.push(flat);
    }
    if (run.length > 1)
        (near ? front : back).push(pathOf(run));
    return { back: back.join(""), front: front.join("") };
}
function topTicks(from, to, step, every, edge, z, lengths, projection, axis = "x") {
    const minor = [];
    const major = [];
    const first = Math.ceil(from / step) * step;
    for (let at = first, index = Math.round(first / step); at <= to + 1e-9; at += step, index++) {
        const big = index % every === 0;
        const length = big ? lengths[1] : lengths[0];
        const a = axis === "x" ? [at, edge] : [edge, at];
        const b = axis === "x" ? [at, edge + length] : [edge + length, at];
        (big ? major : minor).push(lineOnTop(a, b, z, projection));
    }
    return { minor: minor.join(""), major: major.join("") };
}
function sideTicks(from, to, step, every, face, top, lengths, projection, axis = "x") {
    const minor = [];
    const major = [];
    const first = Math.ceil(from / step) * step;
    for (let at = first, index = Math.round(first / step); at <= to + 1e-9; at += step, index++) {
        const big = index % every === 0;
        const length = big ? lengths[1] : lengths[0];
        const a = axis === "x" ? [at, face, top] : [face, at, top];
        const b = axis === "x" ? [at, face, top - length] : [face, at, top - length];
        (big ? major : minor).push(segment(a, b, projection));
    }
    return { minor: minor.join(""), major: major.join("") };
}
function radialTicks(cx, cy, radius, count, every, z, lengths, projection, from = 0, span = Math.PI * 2) {
    const minor = [];
    const major = [];
    const closed = Math.abs(span - Math.PI * 2) < 1e-9;
    const steps = closed ? count : count + 1;
    for (let index = 0; index < steps; index++) {
        const angle = from + (index / count) * span;
        const big = index % every === 0;
        const inner = radius - (big ? lengths[1] : lengths[0]);
        const sx = Math.sin(angle);
        const sy = -Math.cos(angle);
        (big ? major : minor).push(lineOnTop([cx + sx * inner, cy + sy * inner], [cx + sx * radius, cy + sy * radius], z, projection));
    }
    return { minor: minor.join(""), major: major.join("") };
}
const haloOf = (plan, z, height, projection) => slabOf(plan, z, height, projection).fill;
function axisVector(projection, [dx, dy, dz]) {
    const origin = iso([0, 0, 0], projection);
    const moved = iso([dx, dy, dz], projection);
    return [moved[0] - origin[0], moved[1] - origin[1]];
}
const fine = (value) => Math.round(value * 100) / 100;
function translateAlong(projection, by) {
    const [x, y] = axisVector(projection, by);
    return `translate(${fine(x)} ${fine(y)})`;
}
const thousandth = (value) => Math.round(value * 1000) / 1000;
function axesAt(at, z, projection) {
    const origin = iso([at[0], at[1], z], projection);
    const along = (point) => {
        const [px, py] = iso(point, projection);
        return [px - origin[0], py - origin[1]];
    };
    return { origin, x: along([at[0] + 1, at[1], z]), y: along([at[0], at[1] + 1, z]), z: along([at[0], at[1], z + 1]) };
}
const matrixOf = (u, v, origin) => `matrix(${thousandth(u[0])} ${thousandth(u[1])} ${thousandth(v[0])} ${thousandth(v[1])} ${thousandth(origin[0])} ${thousandth(origin[1])})`;
function holdStill(element, [dx, dy]) {
    const text = dx || dy ? `translate(${-dx} ${-dy})` : "";
    element.querySelectorAll("[data-hold]").forEach((node) => (text ? node.setAttribute("transform", text) : node.removeAttribute("transform")));
}
function topMatrix(at, z, projection, along = "x") {
    const { origin, x, y } = axesAt(at, z, projection);
    return along === "x" ? matrixOf(x, y, origin) : matrixOf([-y[0], -y[1]], x, origin);
}
function sideMatrix(at, z, projection, face) {
    const { origin, x, y, z: up } = axesAt(at, z, projection);
    const down = [-up[0], -up[1]];
    return face === "left" ? matrixOf(x, down, origin) : matrixOf([-y[0], -y[1]], down, origin);
}
function screenRise(height, projection) {
    const { cosE, k } = cameraOf(projection);
    return height * cosE * k;
}
function fitProjection(points, width, height, { pad = 24, headroom = 0, azimuth = AZIMUTH, elevation = ELEVATION } = {}) {
    const unit = { origin: [0, 0], scale: 1, azimuth, elevation };
    const flat = points.map((point) => iso(point, unit));
    const xs = flat.map(([x]) => x);
    const ys = flat.map(([, y]) => y);
    const left = Math.min(...xs);
    const right = Math.max(...xs);
    const up = Math.min(...ys);
    const down = Math.max(...ys);
    const scale = Math.min((width - pad * 2) / (right - left), (height - pad * 2 - headroom) / (down - up));
    return {
        origin: [width / 2 - ((left + right) / 2) * scale, headroom + (height - headroom) / 2 - ((up + down) / 2) * scale],
        scale,
        azimuth,
        elevation,
    };
}
const escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const attrs = (pairs) => Object.entries(pairs)
    .filter(([, value]) => value !== undefined && value !== false)
    .map(([key, value]) => ` ${key}="${escape(String(value))}"`)
    .join("");
function solidSvg(paths, { tone = "hi", crease = "faint", halo = false, lit = false, flat = false, className, inner = "" } = {}) {
    const parts = [];
    if (halo)
        parts.push(`<path class="iso-halo" d="${paths.fill}"/>`);
    parts.push(`<path class="iso-fill" d="${paths.fill}"/>`);
    if (!flat) {
        paths.shades.forEach((d, shade) => {
            if (d)
                parts.push(`<path class="iso-shade" data-shade="${shade}" d="${d}"/>`);
        });
        parts.push(`<path class="iso-top" d="${paths.top}"/>`);
    }
    if (crease !== "none" && paths.crease)
        parts.push(`<path class="iso-line iso-crease" data-tone="${crease}" d="${paths.crease}"/>`);
    if (crease !== "none" && paths.bevel)
        parts.push(`<path class="iso-line iso-bevel" data-tone="${crease}" d="${paths.bevel}"/>`);
    if (inner)
        parts.push(inner);
    parts.push(`<path class="iso-line iso-edge" data-tone="${tone}" d="${paths.outline}"/>`);
    return `<g${attrs({ class: className ? `iso-solid ${className}` : "iso-solid", "data-lit": lit ? "" : undefined, "data-seamless": paths.seamless ? "" : undefined })}>${parts.join("")}</g>`;
}
function lineSvg(d, { tone = "lo", dotted = false, dashed = false, flow = false, className, free } = {}) {
    if (!d)
        return "";
    return `<path${attrs({
        class: className ? `iso-line ${className}` : "iso-line",
        "data-tone": tone,
        "data-free": free === true ? "" : free || undefined,
        "data-dotted": dotted ? "" : undefined,
        "data-dashed": dashed ? "" : undefined,
        "data-flow": flow ? "" : undefined,
        d,
    })}/>`;
}
function dotsSvg(points, { size = 0.5, tone = "mid", pulse = false } = {}) {
    const dots = points
        .map(([x, y, alpha], index) => `<circle cx="${tenth(x)}" cy="${tenth(y)}" r="${size}"${alpha !== undefined && alpha < 1 ? ` fill-opacity="${Math.max(0, alpha).toFixed(2)}"` : ""}${pulse ? ` data-pulse="" style="--pulse-at:${(index * 137) % 1600}ms"` : ""}/>`)
        .join("");
    return `<g class="iso-dots" data-tone="${tone}">${dots}</g>`;
}
function fadedSvg(list, style = {}) {
    const groups = new Map();
    for (const entry of list) {
        const [d, alpha] = Array.isArray(entry) ? entry : [entry.d, entry.alpha];
        if (!d || !(alpha > 0.02))
            continue;
        const level = Math.min(1, Math.round(alpha * 20) / 20);
        groups.set(level, (groups.get(level) ?? "") + d);
    }
    return [...groups].map(([alpha, d]) => (alpha >= 1 ? lineSvg(d, style) : `<g opacity="${alpha.toFixed(2)}">${lineSvg(d, style)}</g>`)).join("");
}
function fadeLineSvg(points, { fade = [0, 0], tone = "lo", className, stops = 6 } = {}) {
    if (points.length < 2)
        return "";
    const ease = (t) => t * t * (3 - 2 * t);
    const hashOf = (text) => {
        let hash = 2166136261;
        for (let index = 0; index < text.length; index++)
            hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
        return (hash >>> 0).toString(36);
    };
    const lengths = [0];
    for (let index = 1; index < points.length; index++)
        lengths.push(lengths[index - 1] + Math.hypot(points[index][0] - points[index - 1][0], points[index][1] - points[index - 1][1]));
    const at = (length) => {
        let index = 1;
        while (index < points.length - 1 && lengths[index] < length)
            index++;
        const span = lengths[index] - lengths[index - 1] || 1;
        const t = Math.max(0, Math.min(1, (length - lengths[index - 1]) / span));
        return [points[index - 1][0] + (points[index][0] - points[index - 1][0]) * t, points[index - 1][1] + (points[index][1] - points[index - 1][1]) * t];
    };
    const pieceOf = (from, to) => [at(from), ...points.filter((_, index) => lengths[index] > from + 1e-6 && lengths[index] < to - 1e-6), at(to)];
    const total = lengths[lengths.length - 1];
    if (total < 1e-6)
        return "";
    let [start, end] = Array.isArray(fade) ? fade : [fade, fade];
    if (start + end > total) {
        const share = total / (start + end);
        start *= share;
        end *= share;
    }
    const paint = `var(--anatomy-${tone})`;
    const ramp = (piece, rising) => {
        const d = pathOf(piece);
        const [x1, y1] = piece[0];
        const [x2, y2] = piece[piece.length - 1];
        const id = `iso-fade-${hashOf(`${d}|${tone}|${rising}`)}`;
        const marks = Array.from({ length: stops + 1 }, (_, index) => {
            const t = index / stops;
            const alpha = ease(rising ? t : 1 - t);
            return `<stop offset="${t.toFixed(3)}" stop-opacity="${alpha.toFixed(3)}" style="stop-color:${paint}"/>`;
        }).join("");
        const gradient = `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${tenth(x1)}" y1="${tenth(y1)}" x2="${tenth(x2)}" y2="${tenth(y2)}">${marks}</linearGradient>`;
        return `<defs>${gradient}</defs><path${attrs({ class: className ? `iso-line ${className}` : "iso-line", "data-tone": tone, "data-free": rising ? "start" : "end", d, style: `stroke:url(#${id})` })}/>`;
    };
    const parts = [];
    if (start > 0.05)
        parts.push(ramp(pieceOf(0, start), true));
    if (total - end - start > 0.05)
        parts.push(lineSvg(pathOf(pieceOf(start, total - end)), { tone, className }));
    if (end > 0.05)
        parts.push(ramp(pieceOf(total - end, total), false));
    return `<g class="iso-fade">${parts.join("")}</g>`;
}
function wireSvg(from, to, { via = [], tone = "lo", dotted = false, dashed = false, flow = false, ends = "both", size = 1.2 } = {}) {
    const d = pathOf([from, ...via, to]);
    const end = ([x, y]) => `<circle class="iso-wire-end" cx="${tenth(x)}" cy="${tenth(y)}" r="${size}"/>`;
    return `<g class="iso-wire" data-tone="${tone}">${lineSvg(d, { tone, dotted, dashed, flow })}${ends === "both" || ends === "from" ? end(from) : ""}${ends === "both" || ends === "to" ? end(to) : ""}</g>`;
}
function faceTextSvg(transform, text, { size = 3, tone = "mid", anchor = "start" } = {}) {
    return `<text class="iso-face-text" data-tone="${tone}" transform="${transform}" font-size="${size}" text-anchor="${anchor}">${escape(text)}</text>`;
}
function groupSvg(children, extra = {}) {
    return `<g${attrs(extra)}>${Array.isArray(children) ? children.join("") : children}</g>`;
}
function figureSvg({ width, height, label, body, standalone = false, className }) {
    const style = standalone ? `<style>${ISO_CSS}</style>` : "";
    return `<svg${attrs({
        xmlns: "http://www.w3.org/2000/svg",
        class: `iso-svg${standalone ? " iso" : ""}${className ? ` ${className}` : ""}`,
        "data-theme": standalone || undefined,
        viewBox: `0 0 ${width} ${height}`,
        role: "img",
        "aria-label": label,
    })}>${style}${Array.isArray(body) ? body.join("") : body}</svg>`;
}
function swatchSvg(mark) {
    if (mark === "raised" || mark === "flat" || mark === "lit") {
        const body = mark === "flat" ? "M2 6.5 8 3.5 14 6.5 8 9.5Z" : "M2 4.5 8 1.5 14 4.5 14 6 8 9 2 6Z";
        const crease = mark === "flat" ? "" : `<path class="iso-swatch-crease" d="M2 4.5 8 7.5 14 4.5"/>`;
        return `<svg class="iso-swatch" data-mark="${mark}" viewBox="0 0 16 10" aria-hidden="true"><path d="${body}"/>${crease}</svg>`;
    }
    return `<svg class="iso-swatch" data-mark="${mark}" viewBox="0 0 16 10" aria-hidden="true"><path d="M1.5 5h13"/></svg>`;
}
function plateHtml({ fig, title, hint, readout = "", keys = [], caption, body }) {
    const corner = (name, text, extra = "") => `<span class="iso-plate-corner" data-corner="${name}"${extra}>${escape(text)}</span>`;
    const legend = keys.length || caption
        ? `<figcaption class="iso-legend">${keys.length ? `<span class="iso-keys">${keys.map((key) => `<span class="iso-key">${swatchSvg(key.mark)}${escape(key.label)}</span>`).join("")}</span>` : ""}${caption ? `<span class="iso-caption">${escape(caption)}</span>` : ""}</figcaption>`
        : "";
    return `<figure class="iso-figure"><div class="iso-plate"><div class="iso-plate-corners" aria-hidden="true">${corner("fig", fig)}${title ? corner("title", title) : ""}${hint ? corner("hint", hint) : ""}${corner("readout", readout, " data-readout")}</div>${body}</div>${legend}</figure>`;
}
function pageHtml({ title, theme = "dark", body, script = "", width = 650 }) {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)}</title><style>${ISO_CSS}${PAGE_CSS.replace("__WIDTH__", String(width))}</style></head><body class="iso" data-theme="${theme}"><main class="iso-page">${body}</main>${script ? `<script type="module">${script.replace(/<\/(script)/gi, "<\\/$1")}</script>` : ""}</body></html>`;
}
const PAGE_CSS = `
*{box-sizing:border-box}
html{color-scheme:dark}
body[data-theme="light"]{color-scheme:light}
body{margin:0;background:var(--anatomy-page);color:var(--anatomy-text);font:14px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
.iso-page{width:min(__WIDTH__px,100% - 32px);margin:64px auto 96px}
`;
const ISO_CSS = `
.iso{
  --anatomy-page:#0b0b0b;--anatomy-card:#131313;--anatomy-text:#a3a3a3;--anatomy-strong:#e6e6e6;--anatomy-muted:#6e6e6e;
  --anatomy-paper:#131313;--anatomy-face:#1b1b1b;--anatomy-top:#1c1c1c;
  --anatomy-shade-0:#0f0f0f;--anatomy-shade-1:#121212;--anatomy-shade-2:#151515;--anatomy-shade-3:#181818;
  --anatomy-lit-top:#262626;--anatomy-lit-shade:#1d1d1d;
  --anatomy-hi:#d4d4d4;--anatomy-mid:#6a6a6a;--anatomy-lo:#3e3e3e;--anatomy-faint:#2a2a2a;--anatomy-lit:#ffffff;
  --anatomy-halo:#050505;--anatomy-halo-opacity:.9;--anatomy-dot:#e6e6e6;
  --anatomy-red:#ff6b6b;--anatomy-green:#6be0a0;--anatomy-blue:#6b9bff;
  --anatomy-weight:.6px;--anatomy-ease:cubic-bezier(.32,.72,0,1);
  --anatomy-mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
  --anatomy-lift:inset 0 1px 0 0 #ffffff0a,inset 0 0 0 1px #ffffff06,0 0 0 1px #00000026,0 1px 1px -.5px #00000014,0 3px 3px -1.5px #00000014,0 6px 6px -3px #00000014,0 12px 12px -6px #00000014;
}
.iso[data-theme="light"]{
  --anatomy-page:#f2f2ef;--anatomy-card:#fbfbfa;--anatomy-text:#57575a;--anatomy-strong:#18181a;--anatomy-muted:#8c8c90;
  --anatomy-paper:#fbfbfa;--anatomy-face:#ffffff;--anatomy-top:#ffffff;
  --anatomy-shade-0:#dcdcd9;--anatomy-shade-1:#e5e5e2;--anatomy-shade-2:#ededea;--anatomy-shade-3:#f4f4f1;
  --anatomy-lit-top:#ffffff;--anatomy-lit-shade:#eeeeeb;
  --anatomy-hi:#26262a;--anatomy-mid:#8a8a8f;--anatomy-lo:#b4b4b8;--anatomy-faint:#d4d4d6;--anatomy-lit:#000000;
  --anatomy-halo:#8a8a80;--anatomy-halo-opacity:.32;--anatomy-dot:#3a3a3e;
  --anatomy-red:#e5484d;--anatomy-green:#30a46c;--anatomy-blue:#3e63dd;
  --anatomy-lift:inset 0 1px 0 0 #ffffff,0 0 0 1px #0000000f,0 1px 1px -.5px #0000000a,0 3px 3px -1.5px #0000000a,0 6px 6px -3px #0000000a,0 12px 12px -6px #0000000a;
}
.iso-svg{display:block;width:100%;height:auto;overflow:visible}
.iso-svg path,.iso-svg circle{vector-effect:non-scaling-stroke}
.iso-fill{fill:var(--anatomy-paper);stroke:none}
.iso-solid[data-lit]>.iso-fill{fill:var(--anatomy-face)}
.iso-shade,.iso-top{stroke:none}
.iso-shade[data-shade="0"]{fill:var(--anatomy-shade-0)}
.iso-shade[data-shade="1"]{fill:var(--anatomy-shade-1)}
.iso-shade[data-shade="2"]{fill:var(--anatomy-shade-2)}
.iso-shade[data-shade="3"]{fill:var(--anatomy-shade-3)}
.iso-top{fill:var(--anatomy-top)}
.iso-solid[data-lit]>.iso-top{fill:var(--anatomy-lit-top)}
.iso-solid[data-lit]>.iso-shade{fill:var(--anatomy-lit-shade)}
.iso-solid[data-seamless]>.iso-shade,.iso-solid[data-seamless]>.iso-top{stroke-width:.4;stroke-linejoin:round}
.iso-solid[data-seamless]>.iso-shade[data-shade="0"]{stroke:var(--anatomy-shade-0)}
.iso-solid[data-seamless]>.iso-shade[data-shade="1"]{stroke:var(--anatomy-shade-1)}
.iso-solid[data-seamless]>.iso-shade[data-shade="2"]{stroke:var(--anatomy-shade-2)}
.iso-solid[data-seamless]>.iso-shade[data-shade="3"]{stroke:var(--anatomy-shade-3)}
.iso-solid[data-seamless]>.iso-top{stroke:var(--anatomy-top)}
.iso-solid[data-seamless][data-lit]>.iso-top{stroke:var(--anatomy-lit-top)}
.iso-solid[data-seamless][data-lit]>.iso-shade{stroke:var(--anatomy-lit-shade)}
.iso-solid[data-lit]>.iso-edge{stroke:var(--anatomy-lit)}
.iso-halo{fill:var(--anatomy-halo);stroke:none;filter:blur(9px);opacity:var(--anatomy-halo-opacity);transform:translateY(3px)}
.iso-line{fill:none;stroke:var(--anatomy-lo);stroke-width:var(--anatomy-weight);stroke-linecap:round;stroke-linejoin:round}
.iso-line[data-tone="hi"]{stroke:var(--anatomy-hi)}
.iso-line[data-tone="mid"]{stroke:var(--anatomy-mid)}
.iso-line[data-tone="lo"]{stroke:var(--anatomy-lo)}
.iso-line[data-tone="faint"]{stroke:var(--anatomy-faint)}
.iso-line[data-tone="lit"]{stroke:var(--anatomy-lit)}
.iso-line[data-tone="red"]{stroke:var(--anatomy-red)}
.iso-line[data-tone="green"]{stroke:var(--anatomy-green)}
.iso-line[data-tone="blue"]{stroke:var(--anatomy-blue)}
.iso-line[data-dotted]{stroke-dasharray:.01 3.5;stroke-width:1}
.iso-line[data-dashed]{stroke-dasharray:3 3}
.iso-line[data-flow]{stroke-dasharray:2 6}
.iso-wire-end{fill:var(--anatomy-paper);stroke:var(--anatomy-lo);stroke-width:var(--anatomy-weight)}
.iso-wire[data-tone="hi"] .iso-wire-end{stroke:var(--anatomy-hi)}
.iso-wire[data-tone="mid"] .iso-wire-end{stroke:var(--anatomy-mid)}
.iso-wire[data-tone="faint"] .iso-wire-end{stroke:var(--anatomy-faint)}
.iso-wire[data-tone="lit"] .iso-wire-end{stroke:var(--anatomy-lit)}
.iso-dots circle{fill:var(--anatomy-dot);stroke:none;opacity:.32}
.iso-dots[data-tone="hi"] circle{opacity:.85}
.iso-dots[data-tone="mid"] circle{opacity:.45}
.iso-dots[data-tone="lo"] circle{opacity:.22}
.iso-dots[data-tone="faint"] circle{opacity:.12}
.iso-face-text{fill:var(--anatomy-mid);font-family:var(--anatomy-mono);letter-spacing:.04em}
.iso-face-text[data-tone="hi"]{fill:var(--anatomy-hi)}
.iso-face-text[data-tone="lo"]{fill:var(--anatomy-lo)}
.iso-face-text[data-tone="faint"]{fill:var(--anatomy-faint)}
.tb-body{fill:var(--anatomy-shade-2);stroke:none}
.tb-shine{fill:var(--anatomy-top);stroke:none}
.tb-shade{fill:var(--anatomy-shade-0);stroke:none}
.tb-ring{fill:none;stroke:var(--anatomy-lo);stroke-width:.45;stroke-linecap:butt;stroke-linejoin:round}
.tb-ring[data-tone="mid"]{stroke:var(--anatomy-mid)}
.tb-ring[data-tone="faint"]{stroke:var(--anatomy-faint)}
.tb-ring[data-tone="hi"]{stroke:var(--anatomy-hi)}
@keyframes iso-flow{to{stroke-dashoffset:-32}}
@keyframes iso-pulse{0%,100%{opacity:.18}12%{opacity:1}40%{opacity:.18}}
.iso-line[data-flow]{animation:iso-flow 1600ms linear infinite}
.iso-dots circle[data-pulse]{animation:iso-pulse 1600ms steps(1,end) infinite;animation-delay:var(--pulse-at,0ms)}
.iso-figure{margin:32px 0 36px}
.iso-plate{position:relative;padding:52px 24px;border-radius:0;background:var(--anatomy-card);box-shadow:0 0 0 1px var(--anatomy-mid);--anatomy-paper:var(--anatomy-card)}
.iso-plate-corners{position:absolute;inset:18px 20px;pointer-events:none}
.iso-plate-corner{position:absolute;color:var(--anatomy-muted);font-family:var(--anatomy-mono);font-size:10.5px;line-height:1;letter-spacing:.04em;white-space:nowrap}
.iso-plate-corner[data-corner="fig"]{top:0;left:0;color:var(--anatomy-text)}
.iso-plate-corner[data-corner="title"]{top:0;right:0;text-transform:uppercase;letter-spacing:.1em}
.iso-plate-corner[data-corner="hint"]{bottom:0;left:0;text-transform:uppercase;letter-spacing:.1em}
.iso-plate-corner[data-corner="readout"]{right:0;bottom:0;color:var(--anatomy-text);font-variant-numeric:tabular-nums}
.iso-plate .iso-svg{margin:0 auto}
.iso-legend{display:grid;gap:8px;margin-top:12px;color:var(--anatomy-muted);font-size:13px;line-height:1.55}
.iso-keys{display:flex;flex-wrap:wrap;gap:6px 18px}
.iso-key{display:inline-flex;align-items:center;gap:7px}
.iso-swatch{width:16px;height:10px;flex:none;overflow:visible}
.iso-swatch path{fill:none;stroke:var(--anatomy-hi);stroke-width:1;vector-effect:non-scaling-stroke;stroke-linejoin:round;stroke-linecap:round}
.iso-swatch[data-mark="raised"] path,.iso-swatch[data-mark="flat"] path{stroke:var(--anatomy-mid)}
.iso-swatch[data-mark="lit"] path{stroke:var(--anatomy-lit)}
.iso-swatch[data-mark="dim"] path{stroke:var(--anatomy-lo)}
.iso-swatch[data-mark="dotted"] path{stroke-dasharray:.01 3;stroke-width:1.4}
.iso-swatch[data-mark="dashed"] path{stroke-dasharray:3 2.5}
.iso-swatch[data-mark="red"] path{stroke:var(--anatomy-red)}
.iso-swatch[data-mark="green"] path{stroke:var(--anatomy-green)}
.iso-swatch[data-mark="blue"] path{stroke:var(--anatomy-blue)}
.iso-swatch-crease{stroke:var(--anatomy-lo)!important}
@media (max-width:560px){.iso-plate{padding:48px 12px 70px}.iso-plate-corner[data-corner="hint"]{bottom:18px}}
@media (prefers-reduced-motion:reduce){.iso-line[data-flow],.iso-dots circle[data-pulse]{animation:none}}
`;


const P = {"origin":[300,329.45083502675],"scale":2.4610738428796832,"azimuth":58,"elevation":32};
const C = {"TOP":32,"PAPER":{"x0":-23,"x1":23,"y":0.2},"R":{"lead":15,"curl":12,"bend":10,"maxLines":7},"ROLL":{"x0":-33,"len":66,"y":-18,"z":18,"r":13},"WIN":{"x":-27,"y":-28,"w":54,"d":20,"r":3},"LID_TOP":33.6,"MAX_FLAT":65.1,"DISP_W":34.8};
const WIN_POLY = [[409.5506433214131,222.55532574195877],[412.2047858443548,223.87841118957658],[413.70142205964936,225.63901982782164],[413.81270267055936,227.5691149514781],[412.52168621283494,229.37485707432518],[389.4264515462861,248.9607268635778],[386.92968357252244,250.36720811650514],[383.60727437346713,251.16030447853882],[379.96503063196184,251.21927421799563],[376.55745094062905,250.53513972660537],[249.8371029639982,208.57419197189415],[247.18296044105654,207.2511065242763],[245.68632422576195,205.49049788603125],[245.57504361485198,203.5604027623748],[246.8660600725764,201.75466063952769],[269.96129473912526,182.1687908502751],[272.4580627128889,180.76230959734775],[275.78047191194423,179.96921323531407],[279.42271565344953,179.91024349585723],[282.83029534478226,180.59437798724753]];
const HTML = "<figure class=\"iso-figure\"><div class=\"iso-plate\"><div class=\"iso-plate-corners\" aria-hidden=\"true\"><span class=\"iso-plate-corner\" data-corner=\"fig\">Fig 4</span><span class=\"iso-plate-corner\" data-corner=\"title\">Receipt printer</span><span class=\"iso-plate-corner\" data-corner=\"hint\">Waiting for payment</span><span class=\"iso-plate-corner\" data-corner=\"readout\" data-readout>PENDING</span></div><div class=\"iso-stage\" tabindex=\"0\" role=\"button\" aria-label=\"Receipt printer\"><svg xmlns=\"http://www.w3.org/2000/svg\" class=\"iso-svg\" viewBox=\"0 0 600 500\" role=\"img\" aria-label=\"An in-cab receipt printer on a dashboard mount. While a fare is due the contactless pad on its deck pulses; once the trip is paid, a paper receipt with the fare lines feeds out of the slot behind the tear bar, unwinding the roll seen through the lid window.\"><defs><clipPath id=\"__ID__-win\"><path d=\"M409.6 222.6L412.2 223.9L413.7 225.6L413.8 227.6L412.5 229.4L389.4 249L386.9 250.4L383.6 251.2L380 251.2L376.6 250.5L249.8 208.6L247.2 207.3L245.7 205.5L245.6 203.6L246.9 201.8L270 182.2L272.5 180.8L275.8 180L279.4 179.9L282.8 180.6Z\"/></clipPath><clipPath id=\"__ID__-disp\"><path d=\"M276.9 246.9L278 247.5L278.4 248.3L277.9 249.2L269.6 256.1L268.5 256.7L266.9 256.9L265.4 256.7L170.3 225.2L169.2 224.6L168.9 223.7L169.3 222.9L177.6 215.9L178.8 215.4L180.3 215.2L181.9 215.4Z\"/></clipPath><clipPath id=\"__ID__-ink\"><rect data-part=\"inkclip\" x=\"-23\" y=\"-65.1\" width=\"46\" height=\"65.1\"/></clipPath><linearGradient id=\"__ID__-curl\" data-part=\"curlgrad\" gradientUnits=\"userSpaceOnUse\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" style=\"stop-color:var(--anatomy-lit-top)\" stop-opacity=\"0\"/><stop offset=\"1\" style=\"stop-color:var(--anatomy-lit-top)\" stop-opacity=\".9\"/></linearGradient></defs><path class=\"iso-halo\" d=\"M63.3 352L63.6 349.4L64.9 346.9L67 344.6L205.6 227.1L208.6 225L212.3 223.3L216.5 222L221.1 221.2L226 220.9L230.8 221L235.5 221.7L239.9 222.9L525 317.3L528.9 318.8L532.1 320.8L534.6 323L536.1 325.5L536.7 328.1L536.7 343.9L536.4 346.5L535.1 349L533 351.3L394.4 468.8L391.4 470.9L387.7 472.6L383.5 473.8L378.9 474.7L374 475L369.2 474.8L364.5 474.2L360.1 473L75 378.6L71.1 377L67.9 375.1L65.4 372.8L63.9 370.4L63.3 367.8Z\"/><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M214.7 264L215.6 261.3L217.8 258.8L221.1 256.7L225.3 255.1L230.2 254.1L235.3 253.8L240.5 254.3L245.2 255.4L249.2 257.2L252.2 259.4L254.1 262L254.6 264.7L254.6 268.4L253.7 271.2L251.5 273.7L248.2 275.8L244 277.4L239.1 278.4L234 278.6L228.8 278.2L224.1 277L220.1 275.3L217.1 273L215.2 270.4L214.7 267.7Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M251.5 273.7L248.2 275.8L248.2 272.1L251.5 270ZM248.2 275.8L244 277.4L244 273.7L248.2 272.1ZM254.6 268.4L253.7 271.2L253.7 267.5L254.6 264.7ZM253.7 271.2L251.5 273.7L251.5 270L253.7 267.5Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M244 277.4L239.1 278.4L239.1 274.7L244 273.7ZM239.1 278.4L234 278.6L234 274.9L239.1 274.7Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M234 278.6L228.8 278.2L228.8 274.5L234 274.9ZM228.8 278.2L224.1 277L224.1 273.3L228.8 274.5Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M224.1 277L220.1 275.3L220.1 271.6L224.1 273.3ZM220.1 275.3L217.1 273L217.1 269.3L220.1 271.6ZM217.1 273L215.2 270.4L215.2 266.8L217.1 269.3ZM215.2 270.4L214.7 267.7L214.7 264L215.2 266.8Z\"/><path class=\"iso-top\" d=\"M251.5 270L248.2 272.1L244 273.7L239.1 274.7L234 274.9L228.8 274.5L224.1 273.3L220.1 271.6L217.1 269.3L215.2 266.8L214.7 264L215.6 261.3L217.8 258.8L221.1 256.7L225.3 255.1L230.2 254.1L235.3 253.8L240.5 254.3L245.2 255.4L249.2 257.2L252.2 259.4L254.1 262L254.6 264.7L253.7 267.5Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M254.6 264.7L253.7 267.5L251.5 270L248.2 272.1L244 273.7L239.1 274.7L234 274.9L228.8 274.5L224.1 273.3L220.1 271.6L217.1 269.3L215.2 266.8L214.7 264\"/><path class=\"iso-line iso-edge\" data-tone=\"lo\" d=\"M214.7 264L215.6 261.3L217.8 258.8L221.1 256.7L225.3 255.1L230.2 254.1L235.3 253.8L240.5 254.3L245.2 255.4L249.2 257.2L252.2 259.4L254.1 262L254.6 264.7M254.6 268.4L253.7 271.2L251.5 273.7L248.2 275.8L244 277.4L239.1 278.4L234 278.6L228.8 278.2L224.1 277L220.1 275.3L217.1 273L215.2 270.4L214.7 267.7M214.7 264L214.7 267.7M254.6 264.7L254.6 268.4\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M219.1 257.2L219.8 255.1L221.4 253.1L224 251.5L227.3 250.2L231.1 249.5L235.2 249.3L239.2 249.6L242.9 250.5L246 251.9L248.4 253.6L249.8 255.7L250.2 257.8L250.2 264.7L249.5 266.8L247.8 268.7L245.3 270.4L242 271.7L238.1 272.4L234.1 272.6L230.1 272.3L226.4 271.4L223.3 270L220.9 268.2L219.5 266.2L219.1 264.1Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M247.8 268.7L245.3 270.4L245.3 263.5L247.8 261.9ZM245.3 270.4L242 271.7L242 264.8L245.3 263.5ZM250.2 264.7L249.5 266.8L249.5 259.9L250.2 257.8ZM249.5 266.8L247.8 268.7L247.8 261.9L249.5 259.9Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M242 271.7L238.1 272.4L238.1 265.5L242 264.8ZM238.1 272.4L234.1 272.6L234.1 265.8L238.1 265.5Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M234.1 272.6L230.1 272.3L230.1 265.4L234.1 265.8ZM230.1 272.3L226.4 271.4L226.4 264.5L230.1 265.4Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M226.4 271.4L223.3 270L223.3 263.1L226.4 264.5ZM223.3 270L220.9 268.2L220.9 261.4L223.3 263.1ZM220.9 268.2L219.5 266.2L219.5 259.4L220.9 261.4ZM219.5 266.2L219.1 264.1L219.1 257.2L219.5 259.4Z\"/><path class=\"iso-top\" d=\"M247.8 261.9L245.3 263.5L242 264.8L238.1 265.5L234.1 265.8L230.1 265.4L226.4 264.5L223.3 263.1L220.9 261.4L219.5 259.4L219.1 257.2L219.8 255.1L221.4 253.1L224 251.5L227.3 250.2L231.1 249.5L235.2 249.3L239.2 249.6L242.9 250.5L246 251.9L248.4 253.6L249.8 255.7L250.2 257.8L249.5 259.9Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M250.2 257.8L249.5 259.9L247.8 261.9L245.3 263.5L242 264.8L238.1 265.5L234.1 265.8L230.1 265.4L226.4 264.5L223.3 263.1L220.9 261.4L219.5 259.4L219.1 257.2\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M219.1 257.2L219.8 255.1L221.4 253.1L224 251.5L227.3 250.2L231.1 249.5L235.2 249.3L239.2 249.6L242.9 250.5L246 251.9L248.4 253.6L249.8 255.7L250.2 257.8M250.2 264.7L249.5 266.8L247.8 268.7L245.3 270.4L242 271.7L238.1 272.4L234.1 272.6L230.1 272.3L226.4 271.4L223.3 270L220.9 268.2L219.5 266.2L219.1 264.1M219.1 257.2L219.1 264.1M250.2 257.8L250.2 264.7\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M457.6 344.4L458.5 341.7L460.6 339.2L463.9 337.1L468.2 335.5L473 334.5L478.2 334.3L483.4 334.7L488.1 335.8L492.1 337.6L495.1 339.8L496.9 342.4L497.4 345.2L497.4 348.9L496.6 351.6L494.4 354.1L491.1 356.2L486.9 357.8L482 358.8L476.8 359L471.7 358.6L467 357.5L463 355.7L459.9 353.5L458.1 350.9L457.6 348.1Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M494.4 354.1L491.1 356.2L491.1 352.5L494.4 350.4ZM491.1 356.2L486.9 357.8L486.9 354.1L491.1 352.5ZM497.4 348.9L496.6 351.6L496.6 347.9L497.4 345.2ZM496.6 351.6L494.4 354.1L494.4 350.4L496.6 347.9Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M486.9 357.8L482 358.8L482 355.1L486.9 354.1ZM482 358.8L476.8 359L476.8 355.4L482 355.1Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M476.8 359L471.7 358.6L471.7 354.9L476.8 355.4ZM471.7 358.6L467 357.5L467 353.8L471.7 354.9Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M467 357.5L463 355.7L463 352L467 353.8ZM463 355.7L459.9 353.5L459.9 349.8L463 352ZM459.9 353.5L458.1 350.9L458.1 347.2L459.9 349.8ZM458.1 350.9L457.6 348.1L457.6 344.4L458.1 347.2Z\"/><path class=\"iso-top\" d=\"M494.4 350.4L491.1 352.5L486.9 354.1L482 355.1L476.8 355.4L471.7 354.9L467 353.8L463 352L459.9 349.8L458.1 347.2L457.6 344.4L458.5 341.7L460.6 339.2L463.9 337.1L468.2 335.5L473 334.5L478.2 334.3L483.4 334.7L488.1 335.8L492.1 337.6L495.1 339.8L496.9 342.4L497.4 345.2L496.6 347.9Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M497.4 345.2L496.6 347.9L494.4 350.4L491.1 352.5L486.9 354.1L482 355.1L476.8 355.4L471.7 354.9L467 353.8L463 352L459.9 349.8L458.1 347.2L457.6 344.4\"/><path class=\"iso-line iso-edge\" data-tone=\"lo\" d=\"M457.6 344.4L458.5 341.7L460.6 339.2L463.9 337.1L468.2 335.5L473 334.5L478.2 334.3L483.4 334.7L488.1 335.8L492.1 337.6L495.1 339.8L496.9 342.4L497.4 345.2M497.4 348.9L496.6 351.6L494.4 354.1L491.1 356.2L486.9 357.8L482 358.8L476.8 359L471.7 358.6L467 357.5L463 355.7L459.9 353.5L458.1 350.9L457.6 348.1M457.6 344.4L457.6 348.1M497.4 345.2L497.4 348.9\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M462 337.6L462.6 335.5L464.3 333.6L466.9 331.9L470.2 330.7L474 329.9L478.1 329.7L482.1 330L485.8 330.9L488.9 332.3L491.3 334.1L492.7 336.1L493.1 338.2L493.1 345.1L492.4 347.2L490.7 349.2L488.1 350.8L484.8 352.1L481 352.8L477 353L473 352.7L469.3 351.8L466.1 350.4L463.8 348.7L462.4 346.7L462 344.5Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M490.7 349.2L488.1 350.8L488.1 344L490.7 342.3ZM488.1 350.8L484.8 352.1L484.8 345.2L488.1 344ZM493.1 345.1L492.4 347.2L492.4 340.3L493.1 338.2ZM492.4 347.2L490.7 349.2L490.7 342.3L492.4 340.3Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M484.8 352.1L481 352.8L481 346L484.8 345.2ZM481 352.8L477 353L477 346.2L481 346Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M477 353L473 352.7L473 345.8L477 346.2ZM473 352.7L469.3 351.8L469.3 344.9L473 345.8Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M469.3 351.8L466.1 350.4L466.1 343.6L469.3 344.9ZM466.1 350.4L463.8 348.7L463.8 341.8L466.1 343.6ZM463.8 348.7L462.4 346.7L462.4 339.8L463.8 341.8ZM462.4 346.7L462 344.5L462 337.6L462.4 339.8Z\"/><path class=\"iso-top\" d=\"M490.7 342.3L488.1 344L484.8 345.2L481 346L477 346.2L473 345.8L469.3 344.9L466.1 343.6L463.8 341.8L462.4 339.8L462 337.6L462.6 335.5L464.3 333.6L466.9 331.9L470.2 330.7L474 329.9L478.1 329.7L482.1 330L485.8 330.9L488.9 332.3L491.3 334.1L492.7 336.1L493.1 338.2L492.4 340.3Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M493.1 338.2L492.4 340.3L490.7 342.3L488.1 344L484.8 345.2L481 346L477 346.2L473 345.8L469.3 344.9L466.1 343.6L463.8 341.8L462.4 339.8L462 337.6\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M462 337.6L462.6 335.5L464.3 333.6L466.9 331.9L470.2 330.7L474 329.9L478.1 329.7L482.1 330L485.8 330.9L488.9 332.3L491.3 334.1L492.7 336.1L493.1 338.2M493.1 345.1L492.4 347.2L490.7 349.2L488.1 350.8L484.8 352.1L481 352.8L477 353L473 352.7L469.3 351.8L466.1 350.4L463.8 348.7L462.4 346.7L462 344.5M462 337.6L462 344.5M493.1 338.2L493.1 345.1\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M102.6 359.1L103.4 356.4L105.6 353.9L108.9 351.8L113.1 350.2L118 349.2L123.2 349L128.3 349.4L133 350.6L137 352.3L140.1 354.6L141.9 357.1L142.4 359.9L142.4 363.6L141.5 366.3L139.4 368.8L136.1 370.9L131.8 372.5L127 373.5L121.8 373.8L116.6 373.3L111.9 372.2L107.9 370.4L104.9 368.2L103.1 365.6L102.6 362.8Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M139.4 368.8L136.1 370.9L136.1 367.2L139.4 365.1ZM136.1 370.9L131.8 372.5L131.8 368.8L136.1 367.2ZM142.4 363.6L141.5 366.3L141.5 362.6L142.4 359.9ZM141.5 366.3L139.4 368.8L139.4 365.1L141.5 362.6Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M131.8 372.5L127 373.5L127 369.8L131.8 368.8ZM127 373.5L121.8 373.8L121.8 370.1L127 369.8Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M121.8 373.8L116.6 373.3L116.6 369.6L121.8 370.1ZM116.6 373.3L111.9 372.2L111.9 368.5L116.6 369.6Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M111.9 372.2L107.9 370.4L107.9 366.7L111.9 368.5ZM107.9 370.4L104.9 368.2L104.9 364.5L107.9 366.7ZM104.9 368.2L103.1 365.6L103.1 361.9L104.9 364.5ZM103.1 365.6L102.6 362.8L102.6 359.1L103.1 361.9Z\"/><path class=\"iso-top\" d=\"M139.4 365.1L136.1 367.2L131.8 368.8L127 369.8L121.8 370.1L116.6 369.6L111.9 368.5L107.9 366.7L104.9 364.5L103.1 361.9L102.6 359.1L103.4 356.4L105.6 353.9L108.9 351.8L113.1 350.2L118 349.2L123.2 349L128.3 349.4L133 350.6L137 352.3L140.1 354.6L141.9 357.1L142.4 359.9L141.5 362.6Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M142.4 359.9L141.5 362.6L139.4 365.1L136.1 367.2L131.8 368.8L127 369.8L121.8 370.1L116.6 369.6L111.9 368.5L107.9 366.7L104.9 364.5L103.1 361.9L102.6 359.1\"/><path class=\"iso-line iso-edge\" data-tone=\"lo\" d=\"M102.6 359.1L103.4 356.4L105.6 353.9L108.9 351.8L113.1 350.2L118 349.2L123.2 349L128.3 349.4L133 350.6L137 352.3L140.1 354.6L141.9 357.1L142.4 359.9M142.4 363.6L141.5 366.3L139.4 368.8L136.1 370.9L131.8 372.5L127 373.5L121.8 373.8L116.6 373.3L111.9 372.2L107.9 370.4L104.9 368.2L103.1 365.6L102.6 362.8M102.6 359.1L102.6 362.8M142.4 359.9L142.4 363.6\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M106.9 352.4L107.6 350.2L109.3 348.3L111.9 346.6L115.2 345.4L119 344.6L123 344.4L127 344.8L130.7 345.6L133.9 347L136.2 348.8L137.6 350.8L138 352.9L138 359.8L137.4 361.9L135.7 363.9L133.1 365.5L129.8 366.8L126 367.5L121.9 367.8L117.9 367.4L114.2 366.5L111.1 365.1L108.7 363.4L107.3 361.4L106.9 359.2Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M135.7 363.9L133.1 365.5L133.1 358.7L135.7 357ZM133.1 365.5L129.8 366.8L129.8 359.9L133.1 358.7ZM138 359.8L137.4 361.9L137.4 355.1L138 352.9ZM137.4 361.9L135.7 363.9L135.7 357L137.4 355.1Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M129.8 366.8L126 367.5L126 360.7L129.8 359.9ZM126 367.5L121.9 367.8L121.9 360.9L126 360.7Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M121.9 367.8L117.9 367.4L117.9 360.5L121.9 360.9ZM117.9 367.4L114.2 366.5L114.2 359.6L117.9 360.5Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M114.2 366.5L111.1 365.1L111.1 358.3L114.2 359.6ZM111.1 365.1L108.7 363.4L108.7 356.5L111.1 358.3ZM108.7 363.4L107.3 361.4L107.3 354.5L108.7 356.5ZM107.3 361.4L106.9 359.2L106.9 352.4L107.3 354.5Z\"/><path class=\"iso-top\" d=\"M135.7 357L133.1 358.7L129.8 359.9L126 360.7L121.9 360.9L117.9 360.5L114.2 359.6L111.1 358.3L108.7 356.5L107.3 354.5L106.9 352.4L107.6 350.2L109.3 348.3L111.9 346.6L115.2 345.4L119 344.6L123 344.4L127 344.8L130.7 345.6L133.9 347L136.2 348.8L137.6 350.8L138 352.9L137.4 355.1Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M138 352.9L137.4 355.1L135.7 357L133.1 358.7L129.8 359.9L126 360.7L121.9 360.9L117.9 360.5L114.2 359.6L111.1 358.3L108.7 356.5L107.3 354.5L106.9 352.4\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M106.9 352.4L107.6 350.2L109.3 348.3L111.9 346.6L115.2 345.4L119 344.6L123 344.4L127 344.8L130.7 345.6L133.9 347L136.2 348.8L137.6 350.8L138 352.9M138 359.8L137.4 361.9L135.7 363.9L133.1 365.5L129.8 366.8L126 367.5L121.9 367.8L117.9 367.4L114.2 366.5L111.1 365.1L108.7 363.4L107.3 361.4L106.9 359.2M106.9 352.4L106.9 359.2M138 352.9L138 359.8\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M345.4 439.6L346.3 436.8L348.5 434.3L351.8 432.2L356 430.6L360.9 429.6L366 429.4L371.2 429.8L375.9 431L379.9 432.7L382.9 435L384.8 437.6L385.3 440.3L385.3 444L384.4 446.7L382.2 449.2L378.9 451.4L374.7 453L369.8 453.9L364.7 454.2L359.5 453.7L354.8 452.6L350.8 450.8L347.8 448.6L345.9 446L345.4 443.3Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M382.2 449.2L378.9 451.4L378.9 447.7L382.2 445.5ZM378.9 451.4L374.7 453L374.7 449.3L378.9 447.7ZM385.3 444L384.4 446.7L384.4 443L385.3 440.3ZM384.4 446.7L382.2 449.2L382.2 445.5L384.4 443Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M374.7 453L369.8 453.9L369.8 450.2L374.7 449.3ZM369.8 453.9L364.7 454.2L364.7 450.5L369.8 450.2Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M364.7 454.2L359.5 453.7L359.5 450L364.7 450.5ZM359.5 453.7L354.8 452.6L354.8 448.9L359.5 450Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M354.8 452.6L350.8 450.8L350.8 447.1L354.8 448.9ZM350.8 450.8L347.8 448.6L347.8 444.9L350.8 447.1ZM347.8 448.6L345.9 446L345.9 442.3L347.8 444.9ZM345.9 446L345.4 443.3L345.4 439.6L345.9 442.3Z\"/><path class=\"iso-top\" d=\"M382.2 445.5L378.9 447.7L374.7 449.3L369.8 450.2L364.7 450.5L359.5 450L354.8 448.9L350.8 447.1L347.8 444.9L345.9 442.3L345.4 439.6L346.3 436.8L348.5 434.3L351.8 432.2L356 430.6L360.9 429.6L366 429.4L371.2 429.8L375.9 431L379.9 432.7L382.9 435L384.8 437.6L385.3 440.3L384.4 443Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M385.3 440.3L384.4 443L382.2 445.5L378.9 447.7L374.7 449.3L369.8 450.2L364.7 450.5L359.5 450L354.8 448.9L350.8 447.1L347.8 444.9L345.9 442.3L345.4 439.6\"/><path class=\"iso-line iso-edge\" data-tone=\"lo\" d=\"M345.4 439.6L346.3 436.8L348.5 434.3L351.8 432.2L356 430.6L360.9 429.6L366 429.4L371.2 429.8L375.9 431L379.9 432.7L382.9 435L384.8 437.6L385.3 440.3M385.3 444L384.4 446.7L382.2 449.2L378.9 451.4L374.7 453L369.8 453.9L364.7 454.2L359.5 453.7L354.8 452.6L350.8 450.8L347.8 448.6L345.9 446L345.4 443.3M345.4 439.6L345.4 443.3M385.3 440.3L385.3 444\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M349.8 432.8L350.5 430.7L352.2 428.7L354.7 427L358 425.8L361.9 425L365.9 424.8L369.9 425.2L373.6 426.1L376.7 427.4L379.1 429.2L380.5 431.2L380.9 433.4L380.9 440.2L380.2 442.3L378.6 444.3L376 446L372.7 447.2L368.9 448L364.8 448.2L360.8 447.8L357.1 446.9L354 445.6L351.6 443.8L350.2 441.8L349.8 439.6Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M378.6 444.3L376 446L376 439.1L378.6 437.4ZM376 446L372.7 447.2L372.7 440.4L376 439.1ZM380.9 440.2L380.2 442.3L380.2 435.5L380.9 433.4ZM380.2 442.3L378.6 444.3L378.6 437.4L380.2 435.5Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M372.7 447.2L368.9 448L368.9 441.1L372.7 440.4ZM368.9 448L364.8 448.2L364.8 441.3L368.9 441.1Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M364.8 448.2L360.8 447.8L360.8 441L364.8 441.3ZM360.8 447.8L357.1 446.9L357.1 440.1L360.8 441Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M357.1 446.9L354 445.6L354 438.7L357.1 440.1ZM354 445.6L351.6 443.8L351.6 436.9L354 438.7ZM351.6 443.8L350.2 441.8L350.2 434.9L351.6 436.9ZM350.2 441.8L349.8 439.6L349.8 432.8L350.2 434.9Z\"/><path class=\"iso-top\" d=\"M378.6 437.4L376 439.1L372.7 440.4L368.9 441.1L364.8 441.3L360.8 441L357.1 440.1L354 438.7L351.6 436.9L350.2 434.9L349.8 432.8L350.5 430.7L352.2 428.7L354.7 427L358 425.8L361.9 425L365.9 424.8L369.9 425.2L373.6 426.1L376.7 427.4L379.1 429.2L380.5 431.2L380.9 433.4L380.2 435.5Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M380.9 433.4L380.2 435.5L378.6 437.4L376 439.1L372.7 440.4L368.9 441.1L364.8 441.3L360.8 441L357.1 440.1L354 438.7L351.6 436.9L350.2 434.9L349.8 432.8\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M349.8 432.8L350.5 430.7L352.2 428.7L354.7 427L358 425.8L361.9 425L365.9 424.8L369.9 425.2L373.6 426.1L376.7 427.4L379.1 429.2L380.5 431.2L380.9 433.4M380.9 440.2L380.2 442.3L378.6 444.3L376 446L372.7 447.2L368.9 448L364.8 448.2L360.8 447.8L357.1 446.9L354 445.6L351.6 443.8L350.2 441.8L349.8 439.6M349.8 432.8L349.8 439.6M380.9 433.4L380.9 440.2\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M63.3 341.4L63.6 338.8L64.9 336.3L67 334L205.6 216.5L208.6 214.4L212.3 212.7L216.5 211.5L221.1 210.6L226 210.3L230.8 210.5L235.5 211.1L239.9 212.3L525 306.7L528.9 308.3L532.1 310.2L534.6 312.5L536.1 314.9L536.7 317.5L536.7 333.3L536.4 335.9L535.1 338.4L533 340.7L394.4 458.2L391.4 460.3L387.7 462L383.5 463.3L378.9 464.1L374 464.4L369.2 464.3L364.5 463.6L360.1 462.4L75 368L71.1 366.5L67.9 364.5L65.4 362.3L63.9 359.8L63.3 357.2Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M536.7 333.3L536.4 335.9L536.4 320.1L536.7 317.5ZM536.4 335.9L535.1 338.4L535.1 322.6L536.4 320.1ZM535.1 338.4L533 340.7L533 324.9L535.1 322.6ZM533 340.7L394.4 458.2L394.4 442.4L533 324.9ZM394.4 458.2L391.4 460.3L391.4 444.5L394.4 442.4ZM391.4 460.3L387.7 462L387.7 446.2L391.4 444.5Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M387.7 462L383.5 463.3L383.5 447.4L387.7 446.2ZM383.5 463.3L378.9 464.1L378.9 448.3L383.5 447.4ZM378.9 464.1L374 464.4L374 448.6L378.9 448.3Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M374 464.4L369.2 464.3L369.2 448.4L374 448.6ZM369.2 464.3L364.5 463.6L364.5 447.8L369.2 448.4ZM364.5 463.6L360.1 462.4L360.1 446.6L364.5 447.8Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M360.1 462.4L75 368L75 352.2L360.1 446.6ZM75 368L71.1 366.5L71.1 350.6L75 352.2ZM71.1 366.5L67.9 364.5L67.9 348.7L71.1 350.6ZM67.9 364.5L65.4 362.3L65.4 346.4L67.9 348.7ZM65.4 362.3L63.9 359.8L63.9 344L65.4 346.4ZM63.9 359.8L63.3 357.2L63.3 341.4L63.9 344Z\"/><path class=\"iso-top\" d=\"M525 306.7L528.9 308.3L532.1 310.2L534.6 312.5L536.1 314.9L536.7 317.5L536.4 320.1L535.1 322.6L533 324.9L394.4 442.4L391.4 444.5L387.7 446.2L383.5 447.4L378.9 448.3L374 448.6L369.2 448.4L364.5 447.8L360.1 446.6L75 352.2L71.1 350.6L67.9 348.7L65.4 346.4L63.9 344L63.3 341.4L63.6 338.8L64.9 336.3L67 334L205.6 216.5L208.6 214.4L212.3 212.7L216.5 211.5L221.1 210.6L226 210.3L230.8 210.5L235.5 211.1L239.9 212.3Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M536.7 317.5L536.4 320.1L535.1 322.6L533 324.9L394.4 442.4L391.4 444.5L387.7 446.2L383.5 447.4L378.9 448.3L374 448.6L369.2 448.4L364.5 447.8L360.1 446.6L75 352.2L71.1 350.6L67.9 348.7L65.4 346.4L63.9 344L63.3 341.4\"/><path class=\"iso-line iso-bevel\" data-tone=\"faint\" d=\"M536.7 317.5L532.1 319.7L531.1 321.8L529.2 323.8L390.8 441.1L388.2 442.9L385.2 444.3L381.7 445.3L377.9 446L373.9 446.3L369.9 446.2L366 445.6L362.2 444.6L77.4 350.3L74.1 348.9L71.4 347.3L69.4 345.5L68.1 343.5L63.3 341.4\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M63.3 341.4L63.6 338.8L64.9 336.3L67 334L205.6 216.5L208.6 214.4L212.3 212.7L216.5 211.5L221.1 210.6L226 210.3L230.8 210.5L235.5 211.1L239.9 212.3L525 306.7L528.9 308.3L532.1 310.2L534.6 312.5L536.1 314.9L536.7 317.5M536.7 333.3L536.4 335.9L535.1 338.4L533 340.7L394.4 458.2L391.4 460.3L387.7 462L383.5 463.3L378.9 464.1L374 464.4L369.2 464.3L364.5 463.6L360.1 462.4L75 368L71.1 366.5L67.9 364.5L65.4 362.3L63.9 359.8L63.3 357.2M536.7 317.5L536.7 333.3M63.3 341.4L63.3 357.2\"/></g><path class=\"iso-line\" data-tone=\"lo\" d=\"M518.4 312.3L520.4 313.1L522 314.1L523.2 315.2L524 316.4L524.3 317.7L524.1 319L523.5 320.2L522.4 321.4L383.8 438.9L382.3 439.9L380.5 440.8L378.4 441.4L376.1 441.8L373.7 442L371.2 441.9L368.9 441.6L366.7 441L81.6 346.6L79.6 345.8L78 344.8L76.8 343.7L76 342.5L75.7 341.2L75.9 339.9L76.5 338.7L77.6 337.5L216.2 220L217.7 219L219.5 218.1L221.6 217.5L223.9 217.1L226.3 216.9L228.8 217L231.1 217.3L233.3 217.9Z\"/><path class=\"iso-line\" data-tone=\"lo\" d=\"M231 223L229.4 223.9L227.1 224.4L224.7 224.5L222.4 224L220.7 223.1L219.7 222L219.6 220.7L220.5 219.5L222.1 218.5L224.3 218L226.8 218L229 218.4L230.8 219.3L231.8 220.5L231.9 221.8ZM521.4 319.1L519.8 320.1L517.5 320.6L515.1 320.6L512.8 320.2L511.1 319.3L510.1 318.1L510 316.8L510.9 315.6L512.5 314.7L514.7 314.2L517.2 314.1L519.4 314.6L521.2 315.5L522.2 316.6L522.3 317.9ZM89.1 343.3L87.5 344.2L85.3 344.7L82.8 344.8L80.6 344.3L78.8 343.4L77.8 342.3L77.7 341L78.6 339.8L80.2 338.8L82.5 338.3L84.9 338.3L87.2 338.7L88.9 339.6L89.9 340.8L90 342.1ZM379.5 439.4L377.9 440.4L375.7 440.9L373.2 440.9L371 440.5L369.2 439.6L368.2 438.4L368.1 437.1L369 435.9L370.6 435L372.9 434.5L375.3 434.4L377.6 434.9L379.3 435.8L380.3 436.9L380.4 438.2Z\"/><g class=\"iso-dots\" data-tone=\"mid\"><circle cx=\"225.7\" cy=\"221.2\" r=\"0.5\"/><circle cx=\"516.1\" cy=\"317.4\" r=\"0.5\"/><circle cx=\"83.9\" cy=\"341.5\" r=\"0.5\"/><circle cx=\"374.3\" cy=\"437.7\" r=\"0.5\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M123.9 278.3L124.4 277.3L153.5 252.7L154.9 252L156.8 251.8L158.6 252.1L168.1 255.2L169.5 256L169.9 257L169.9 291.3L169.3 292.3L140.3 316.9L138.9 317.6L137 317.8L135.1 317.5L125.6 314.4L124.3 313.6L123.9 312.6Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M169.9 291.3L169.3 292.3L169.3 257.9L169.9 257ZM169.3 292.3L140.3 316.9L140.3 282.6L169.3 257.9ZM140.3 316.9L138.9 317.6L138.9 283.3L140.3 282.6Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M138.9 317.6L137 317.8L137 283.5L138.9 283.3Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M137 317.8L135.1 317.5L135.1 283.2L137 283.5Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M135.1 317.5L125.6 314.4L125.6 280L135.1 283.2ZM125.6 314.4L124.3 313.6L124.3 279.3L125.6 280ZM124.3 313.6L123.9 312.6L123.9 278.3L124.3 279.3Z\"/><path class=\"iso-top\" d=\"M168.1 255.2L169.5 256L169.9 257L169.3 257.9L140.3 282.6L138.9 283.3L137 283.5L135.1 283.2L125.6 280L124.3 279.3L123.9 278.3L124.4 277.3L153.5 252.7L154.9 252L156.8 251.8L158.6 252.1Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M169.9 257L169.3 257.9L140.3 282.6L138.9 283.3L137 283.5L135.1 283.2L125.6 280L124.3 279.3L123.9 278.3\"/><path class=\"iso-line iso-bevel\" data-tone=\"faint\" d=\"M169.9 257L168.2 257.7L139.3 282.1L138.3 282.7L137 282.8L135.7 282.6L126.4 279.5L125.4 279L123.9 278.3\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M123.9 278.3L124.4 277.3L153.5 252.7L154.9 252L156.8 251.8L158.6 252.1L168.1 255.2L169.5 256L169.9 257M169.9 291.3L169.3 292.3L140.3 316.9L138.9 317.6L137 317.8L135.1 317.5L125.6 314.4L124.3 313.6L123.9 312.6M169.9 257L169.9 291.3M123.9 278.3L123.9 312.6\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M107.9 330.9L108.6 328.7L110.3 326.8L225.7 228.9L228.3 227.2L231.6 225.9L235.4 225.2L239.5 225L243.5 225.3L247.2 226.2L484.8 304.9L487.9 306.3L490.3 308L491.7 310L492.1 312.2L492.1 320.1L491.4 322.2L489.7 324.2L374.3 422.1L371.7 423.8L368.4 425L364.6 425.8L360.5 426L356.5 425.6L352.8 424.7L115.2 346.1L112.1 344.7L109.7 342.9L108.3 340.9L107.9 338.8Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M492.1 320.1L491.4 322.2L491.4 314.3L492.1 312.2ZM491.4 322.2L489.7 324.2L489.7 316.3L491.4 314.3ZM489.7 324.2L374.3 422.1L374.3 414.2L489.7 316.3ZM374.3 422.1L371.7 423.8L371.7 415.9L374.3 414.2ZM371.7 423.8L368.4 425L368.4 417.1L371.7 415.9Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M368.4 425L364.6 425.8L364.6 417.9L368.4 417.1ZM364.6 425.8L360.5 426L360.5 418.1L364.6 417.9Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M360.5 426L356.5 425.6L356.5 417.7L360.5 418.1ZM356.5 425.6L352.8 424.7L352.8 416.8L356.5 417.7Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M352.8 424.7L115.2 346.1L115.2 338.2L352.8 416.8ZM115.2 346.1L112.1 344.7L112.1 336.8L115.2 338.2ZM112.1 344.7L109.7 342.9L109.7 335L112.1 336.8ZM109.7 342.9L108.3 340.9L108.3 333L109.7 335ZM108.3 340.9L107.9 338.8L107.9 330.9L108.3 333Z\"/><path class=\"iso-top\" d=\"M484.8 304.9L487.9 306.3L490.3 308L491.7 310L492.1 312.2L491.4 314.3L489.7 316.3L374.3 414.2L371.7 415.9L368.4 417.1L364.6 417.9L360.5 418.1L356.5 417.7L352.8 416.8L115.2 338.2L112.1 336.8L109.7 335L108.3 333L107.9 330.9L108.6 328.7L110.3 326.8L225.7 228.9L228.3 227.2L231.6 225.9L235.4 225.2L239.5 225L243.5 225.3L247.2 226.2Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M492.1 312.2L491.4 314.3L489.7 316.3L374.3 414.2L371.7 415.9L368.4 417.1L364.6 417.9L360.5 418.1L356.5 417.7L352.8 416.8L115.2 338.2L112.1 336.8L109.7 335L108.3 333L107.9 330.9\"/><path class=\"iso-line iso-bevel\" data-tone=\"faint\" d=\"M492.1 312.2L489.6 314L488.1 315.8L372.7 413.6L370.4 415.1L367.5 416.2L364.1 416.9L360.6 417.1L357.1 416.8L353.7 416L116.3 337.3L113.4 336.1L111.4 334.6L110.1 332.8L107.9 330.9\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M107.9 330.9L108.6 328.7L110.3 326.8L225.7 228.9L228.3 227.2L231.6 225.9L235.4 225.2L239.5 225L243.5 225.3L247.2 226.2L484.8 304.9L487.9 306.3L490.3 308L491.7 310L492.1 312.2M492.1 320.1L491.4 322.2L489.7 324.2L374.3 422.1L371.7 423.8L368.4 425L364.6 425.8L360.5 426L356.5 425.6L352.8 424.7L115.2 346.1L112.1 344.7L109.7 342.9L108.3 340.9L107.9 338.8M492.1 312.2L492.1 320.1M107.9 330.9L107.9 338.8\"/></g><path class=\"iso-line\" data-tone=\"faint\" d=\"M480.8 308.3L482.5 309L483.7 309.9L484.4 310.9L484.6 312.1L484.3 313.2L483.4 314.2L367.9 412.1L366.6 413L364.9 413.6L362.9 414L360.8 414.1L358.7 413.9L356.8 413.5L119.2 334.8L117.5 334.1L116.3 333.2L115.6 332.1L115.4 331L115.7 329.9L116.6 328.9L232.1 231L233.4 230.1L235.1 229.4L237.1 229L239.2 228.9L241.3 229.1L243.2 229.6Z\"/><g class=\"iso-dots\" data-tone=\"mid\"><circle cx=\"237.9\" cy=\"231\" r=\"0.45\"/><circle cx=\"480.8\" cy=\"311.4\" r=\"0.45\"/><circle cx=\"119.2\" cy=\"331.7\" r=\"0.45\"/><circle cx=\"362.1\" cy=\"412.1\" r=\"0.45\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M123.1 323.6L123.4 321.3L124.5 319.2L126.4 317.1L225.4 233.2L228 231.4L231.2 229.9L234.9 228.8L239 228.1L243.2 227.8L247.5 227.9L251.6 228.5L255.4 229.5L466.6 299.5L470 300.8L472.8 302.5L475 304.5L476.3 306.7L476.9 308.9L476.9 314.2L476.6 316.4L475.5 318.6L473.6 320.6L374.6 404.6L372 406.4L368.8 407.9L365.1 409L361 409.7L356.8 410L352.5 409.9L348.4 409.3L344.6 408.3L133.4 338.3L130 336.9L127.2 335.2L125 333.3L123.7 331.1L123.1 328.9Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M476.9 314.2L476.6 316.4L476.6 311.2L476.9 308.9ZM476.6 316.4L475.5 318.6L475.5 313.3L476.6 311.2ZM475.5 318.6L473.6 320.6L473.6 315.4L475.5 313.3ZM473.6 320.6L374.6 404.6L374.6 399.3L473.6 315.4ZM374.6 404.6L372 406.4L372 401.1L374.6 399.3ZM372 406.4L368.8 407.9L368.8 402.6L372 401.1Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M368.8 407.9L365.1 409L365.1 403.7L368.8 402.6ZM365.1 409L361 409.7L361 404.4L365.1 403.7ZM361 409.7L356.8 410L356.8 404.7L361 404.4Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M356.8 410L352.5 409.9L352.5 404.6L356.8 404.7ZM352.5 409.9L348.4 409.3L348.4 404L352.5 404.6ZM348.4 409.3L344.6 408.3L344.6 403L348.4 404Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M344.6 408.3L133.4 338.3L133.4 333L344.6 403ZM133.4 338.3L130 336.9L130 331.7L133.4 333ZM130 336.9L127.2 335.2L127.2 330L130 331.7ZM127.2 335.2L125 333.3L125 328L127.2 330ZM125 333.3L123.7 331.1L123.7 325.9L125 328ZM123.7 331.1L123.1 328.9L123.1 323.6L123.7 325.9Z\"/><path class=\"iso-top\" d=\"M466.6 299.5L470 300.8L472.8 302.5L475 304.5L476.3 306.7L476.9 308.9L476.6 311.2L475.5 313.3L473.6 315.4L374.6 399.3L372 401.1L368.8 402.6L365.1 403.7L361 404.4L356.8 404.7L352.5 404.6L348.4 404L344.6 403L133.4 333L130 331.7L127.2 330L125 328L123.7 325.9L123.1 323.6L123.4 321.3L124.5 319.2L126.4 317.1L225.4 233.2L228 231.4L231.2 229.9L234.9 228.8L239 228.1L243.2 227.8L247.5 227.9L251.6 228.5L255.4 229.5Z\"/><path class=\"iso-line iso-edge\" data-tone=\"lo\" d=\"M123.1 323.6L123.4 321.3L124.5 319.2L126.4 317.1L225.4 233.2L228 231.4L231.2 229.9L234.9 228.8L239 228.1L243.2 227.8L247.5 227.9L251.6 228.5L255.4 229.5L466.6 299.5L470 300.8L472.8 302.5L475 304.5L476.3 306.7L476.9 308.9M476.9 314.2L476.6 316.4L475.5 318.6L473.6 320.6L374.6 404.6L372 406.4L368.8 407.9L365.1 409L361 409.7L356.8 410L352.5 409.9L348.4 409.3L344.6 408.3L133.4 338.3L130 336.9L127.2 335.2L125 333.3L123.7 331.1L123.1 328.9M476.9 308.9L476.9 314.2M123.1 323.6L123.1 328.9\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M74.2 344.7L74.6 344.1L82.9 337.1L83.7 336.7L84.8 336.4L86 336.4L87.2 336.6L150.5 357.6L151.4 358L151.9 358.6L151.9 359.3L151.9 361.4L151.5 362L143.3 369L142.4 369.4L141.3 369.7L140.1 369.7L139 369.5L75.6 348.5L74.7 348.1L74.2 347.5L74.2 346.9Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M151.9 361.4L151.5 362L151.5 359.9L151.9 359.3ZM151.5 362L143.3 369L143.3 366.9L151.5 359.9ZM143.3 369L142.4 369.4L142.4 367.3L143.3 366.9Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M142.4 369.4L141.3 369.7L141.3 367.6L142.4 367.3ZM141.3 369.7L140.1 369.7L140.1 367.6L141.3 367.6Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M140.1 369.7L139 369.5L139 367.4L140.1 367.6Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M139 369.5L75.6 348.5L75.6 346.4L139 367.4ZM75.6 348.5L74.7 348.1L74.7 346L75.6 346.4ZM74.7 348.1L74.2 347.5L74.2 345.4L74.7 346ZM74.2 347.5L74.2 346.9L74.2 344.7L74.2 345.4Z\"/><path class=\"iso-top\" d=\"M150.5 357.6L151.4 358L151.9 358.6L151.9 359.3L151.5 359.9L143.3 366.9L142.4 367.3L141.3 367.6L140.1 367.6L139 367.4L75.6 346.4L74.7 346L74.2 345.4L74.2 344.7L74.6 344.1L82.9 337.1L83.7 336.7L84.8 336.4L86 336.4L87.2 336.6Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M151.9 359.3L151.5 359.9L143.3 366.9L142.4 367.3L141.3 367.6L140.1 367.6L139 367.4L75.6 346.4L74.7 346L74.2 345.4L74.2 344.7\"/><path class=\"iso-line iso-edge\" data-tone=\"lo\" d=\"M74.2 344.7L74.6 344.1L82.9 337.1L83.7 336.7L84.8 336.4L86 336.4L87.2 336.6L150.5 357.6L151.4 358L151.9 358.6L151.9 359.3M151.9 361.4L151.5 362L143.3 369L142.4 369.4L141.3 369.7L140.1 369.7L139 369.5L75.6 348.5L74.7 348.1L74.2 347.5L74.2 346.9M151.9 359.3L151.9 361.4M74.2 344.7L74.2 346.9\"/></g><path class=\"iso-line\" data-tone=\"faint\" d=\"M148 359.1L140.4 365.5L78.1 344.9L85.7 338.5Z\"/><path class=\"iso-line\" data-tone=\"lo\" data-free=\"\" d=\"M92.1 341.8L142.3 358.4\"/><path class=\"iso-line\" data-tone=\"lo\" data-free=\"\" d=\"M89.1 344.3L126.1 356.5\"/><path class=\"iso-line\" data-tone=\"lo\" data-free=\"\" d=\"M86.2 346.8L129.7 361.2\"/><g class=\"iso-dots\" data-tone=\"mid\"><circle cx=\"84.6\" cy=\"342.6\" r=\"0.4\"/><circle cx=\"141.6\" cy=\"361.4\" r=\"0.4\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M130.5 251.1L131.3 248.6L133.4 246.2L229 165.1L232.1 163.1L236.1 161.6L240.7 160.7L245.5 160.4L250.3 160.8L254.8 161.9L460.7 230.1L464.5 231.7L467.3 233.8L469 236.3L469.5 238.8L469.5 310.1L468.7 312.7L466.6 315L371 396.2L367.9 398.2L363.9 399.7L359.3 400.6L354.5 400.8L349.7 400.4L345.2 399.3L139.3 331.1L135.5 329.5L132.7 327.4L131 325L130.5 322.4Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M469.5 310.1L468.7 312.7L468.7 241.4L469.5 238.8ZM468.7 312.7L466.6 315L466.6 243.7L468.7 241.4ZM466.6 315L371 396.2L371 324.9L466.6 243.7ZM371 396.2L367.9 398.2L367.9 326.9L371 324.9ZM367.9 398.2L363.9 399.7L363.9 328.4L367.9 326.9Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M363.9 399.7L359.3 400.6L359.3 329.3L363.9 328.4ZM359.3 400.6L354.5 400.8L354.5 329.5L359.3 329.3Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M354.5 400.8L349.7 400.4L349.7 329.1L354.5 329.5ZM349.7 400.4L345.2 399.3L345.2 328L349.7 329.1Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M345.2 399.3L139.3 331.1L139.3 259.8L345.2 328ZM139.3 331.1L135.5 329.5L135.5 258.2L139.3 259.8ZM135.5 329.5L132.7 327.4L132.7 256.1L135.5 258.2ZM132.7 327.4L131 325L131 253.7L132.7 256.1ZM131 325L130.5 322.4L130.5 251.1L131 253.7Z\"/><path class=\"iso-top\" d=\"M460.7 230.1L464.5 231.7L467.3 233.8L469 236.3L469.5 238.8L468.7 241.4L466.6 243.7L371 324.9L367.9 326.9L363.9 328.4L359.3 329.3L354.5 329.5L349.7 329.1L345.2 328L139.3 259.8L135.5 258.2L132.7 256.1L131 253.7L130.5 251.1L131.3 248.6L133.4 246.2L229 165.1L232.1 163.1L236.1 161.6L240.7 160.7L245.5 160.4L250.3 160.8L254.8 161.9Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M469.5 238.8L468.7 241.4L466.6 243.7L371 324.9L367.9 326.9L363.9 328.4L359.3 329.3L354.5 329.5L349.7 329.1L345.2 328L139.3 259.8L135.5 258.2L132.7 256.1L131 253.7L130.5 251.1\"/><path class=\"iso-line iso-bevel\" data-tone=\"faint\" d=\"M469.5 238.8L465.7 240.9L463.9 243L368.4 323.9L365.7 325.7L362.4 326.9L358.6 327.7L354.6 327.9L350.6 327.5L346.7 326.6L141.1 258.5L137.8 257.1L135.5 255.3L134 253.3L130.5 251.1\"/><path class=\"iso-line\" data-tone=\"faint\" d=\"M469.5 275.8L468.7 278.3L466.6 280.7L371 361.8L367.9 363.8L363.9 365.3L359.3 366.2L354.5 366.5L349.7 366.1L345.2 365L139.3 296.8L135.5 295.2L132.7 293.1L131 290.6L130.5 288.1\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M130.5 251.1L131.3 248.6L133.4 246.2L229 165.1L232.1 163.1L236.1 161.6L240.7 160.7L245.5 160.4L250.3 160.8L254.8 161.9L460.7 230.1L464.5 231.7L467.3 233.8L469 236.3L469.5 238.8M469.5 310.1L468.7 312.7L466.6 315L371 396.2L367.9 398.2L363.9 399.7L359.3 400.6L354.5 400.8L349.7 400.4L345.2 399.3L139.3 331.1L135.5 329.5L132.7 327.4L131 325L130.5 322.4M469.5 238.8L469.5 310.1M130.5 251.1L130.5 322.4\"/></g><path class=\"iso-shade\" data-shade=\"0\" d=\"M298 366.2L298.9 366.4L299.6 366.1L300.2 365.5L300.3 364.6L300.3 364.6L300.2 363.7L299.6 362.7L298.9 362L298 361.5L186.6 324.6L185.6 324.5L184.9 324.7L184.4 325.3L184.2 326.2L184.2 326.2L184.4 327.2L184.9 328.1L185.6 328.9L186.6 329.3Z\"/><path class=\"iso-line\" data-tone=\"lo\" d=\"M298 366.2L298.9 366.4L299.6 366.1L300.2 365.5L300.3 364.6L300.3 364.6L300.2 363.7L299.6 362.7L298.9 362L298 361.5L186.6 324.6L185.6 324.5L184.9 324.7L184.4 325.3L184.2 326.2L184.2 326.2L184.4 327.2L184.9 328.1L185.6 328.9L186.6 329.3Z\"/><text class=\"iso-face-text\" data-tone=\"lo\" transform=\"matrix(2.64 0.874 0 2.64 136.662 275.864)\" font-size=\"2.6\" text-anchor=\"start\">CABGO POS</text><path class=\"iso-shade\" data-shade=\"0\" d=\"M439.1 298.8L438.6 299L438.2 298.7L438.1 298L438.1 280.1L438.2 279.2L438.6 278.3L439.1 277.7L439.3 277.5L439.8 277.3L440.1 277.6L440.2 278.3L440.2 296.2L440.1 297.1L439.8 298L439.3 298.6ZM434.8 302.4L434.3 302.6L433.9 302.4L433.8 301.7L433.8 283.7L433.9 282.8L434.3 281.9L434.8 281.3L435 281.2L435.5 281L435.8 281.2L436 281.9L436 299.9L435.8 300.8L435.5 301.6L435 302.3ZM430.5 306.1L430 306.3L429.7 306L429.5 305.3L429.5 287.4L429.7 286.5L430 285.6L430.5 284.9L430.7 284.8L431.2 284.6L431.5 284.9L431.7 285.5L431.7 303.5L431.5 304.4L431.2 305.3L430.7 305.9ZM426.2 309.7L425.7 309.9L425.4 309.6L425.2 308.9L425.2 291L425.4 290.1L425.7 289.2L426.2 288.6L426.4 288.4L426.9 288.2L427.2 288.5L427.4 289.2L427.4 307.1L427.2 308L426.9 308.9L426.4 309.6ZM421.9 313.3L421.4 313.5L421.1 313.3L420.9 312.6L420.9 294.6L421.1 293.7L421.4 292.8L421.9 292.2L422.1 292.1L422.6 291.9L423 292.1L423.1 292.8L423.1 310.8L423 311.7L422.6 312.6L422.1 313.2Z\"/><path class=\"iso-line\" data-tone=\"lo\" d=\"M439.1 298.8L438.6 299L438.2 298.7L438.1 298L438.1 280.1L438.2 279.2L438.6 278.3L439.1 277.7L439.3 277.5L439.8 277.3L440.1 277.6L440.2 278.3L440.2 296.2L440.1 297.1L439.8 298L439.3 298.6ZM434.8 302.4L434.3 302.6L433.9 302.4L433.8 301.7L433.8 283.7L433.9 282.8L434.3 281.9L434.8 281.3L435 281.2L435.5 281L435.8 281.2L436 281.9L436 299.9L435.8 300.8L435.5 301.6L435 302.3ZM430.5 306.1L430 306.3L429.7 306L429.5 305.3L429.5 287.4L429.7 286.5L430 285.6L430.5 284.9L430.7 284.8L431.2 284.6L431.5 284.9L431.7 285.5L431.7 303.5L431.5 304.4L431.2 305.3L430.7 305.9ZM426.2 309.7L425.7 309.9L425.4 309.6L425.2 308.9L425.2 291L425.4 290.1L425.7 289.2L426.2 288.6L426.4 288.4L426.9 288.2L427.2 288.5L427.4 289.2L427.4 307.1L427.2 308L426.9 308.9L426.4 309.6ZM421.9 313.3L421.4 313.5L421.1 313.3L420.9 312.6L420.9 294.6L421.1 293.7L421.4 292.8L421.9 292.2L422.1 292.1L422.6 291.9L423 292.1L423.1 292.8L423.1 310.8L423 311.7L422.6 312.6L422.1 313.2Z\"/><path class=\"iso-line\" data-tone=\"lo\" d=\"M143.5 254.4L142.1 255.1L140.3 255.5L138.4 255.4L136.7 254.8L135.7 254L135.5 252.9L136.1 252L137.5 251.2L139.3 250.9L141.2 251L142.9 251.6L143.9 252.4L144.1 253.5ZM360 326.1L358.6 326.8L356.8 327.2L354.8 327.1L353.2 326.5L352.2 325.6L351.9 324.6L352.6 323.7L353.9 322.9L355.8 322.6L357.7 322.7L359.4 323.2L360.4 324.1L360.6 325.1Z\"/><g class=\"iso-dots\" data-tone=\"mid\"><circle cx=\"139.8\" cy=\"253.2\" r=\"0.4\"/><circle cx=\"356.3\" cy=\"324.9\" r=\"0.4\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M194 197.7L195.7 195.3L234.3 162.6L237.6 160.7L242.1 159.7L246.9 159.6L251.5 160.5L457.4 228.7L460.9 230.4L462.9 232.8L463.1 235.4L463.1 239.6L461.4 242L422.8 274.7L419.4 276.6L415 277.7L410.1 277.7L405.6 276.8L199.7 208.6L196.1 206.9L194.1 204.5L194 202Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M463.1 239.6L461.4 242L461.4 237.8L463.1 235.4ZM461.4 242L422.8 274.7L422.8 270.5L461.4 237.8ZM422.8 274.7L419.4 276.6L419.4 272.4L422.8 270.5Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M419.4 276.6L415 277.7L415 273.4L419.4 272.4ZM415 277.7L410.1 277.7L410.1 273.5L415 273.4Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M410.1 277.7L405.6 276.8L405.6 272.6L410.1 273.5Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M405.6 276.8L199.7 208.6L199.7 204.4L405.6 272.6ZM199.7 208.6L196.1 206.9L196.1 202.7L199.7 204.4ZM196.1 206.9L194.1 204.5L194.1 200.3L196.1 202.7ZM194.1 204.5L194 202L194 197.7L194.1 200.3Z\"/><path class=\"iso-top\" d=\"M457.4 228.7L460.9 230.4L462.9 232.8L463.1 235.4L461.4 237.8L422.8 270.5L419.4 272.4L415 273.4L410.1 273.5L405.6 272.6L199.7 204.4L196.1 202.7L194.1 200.3L194 197.7L195.7 195.3L234.3 162.6L237.6 160.7L242.1 159.7L246.9 159.6L251.5 160.5Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M463.1 235.4L461.4 237.8L422.8 270.5L419.4 272.4L415 273.4L410.1 273.5L405.6 272.6L199.7 204.4L196.1 202.7L194.1 200.3L194 197.7\"/><path class=\"iso-line iso-bevel\" data-tone=\"faint\" d=\"M463.1 235.4L460 237.4L421.5 270L418.5 271.7L414.6 272.6L410.4 272.7L406.3 271.9L200.6 203.8L197.4 202.2L195.7 200.1L194 197.7\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M194 197.7L195.7 195.3L234.3 162.6L237.6 160.7L242.1 159.7L246.9 159.6L251.5 160.5L457.4 228.7L460.9 230.4L462.9 232.8L463.1 235.4M463.1 239.6L461.4 242L422.8 274.7L419.4 276.6L415 277.7L410.1 277.7L405.6 276.8L199.7 208.6L196.1 206.9L194.1 204.5L194 202M463.1 235.4L463.1 239.6M194 197.7L194 202\"/></g><path class=\"iso-line\" data-tone=\"faint\" d=\"M453.3 232.2L454.6 232.8L455.4 233.7L455.4 234.7L454.8 235.6L416.2 268.3L414.9 269L413.2 269.4L411.4 269.4L409.7 269.1L203.8 200.9L202.5 200.3L201.7 199.4L201.7 198.4L202.3 197.5L240.9 164.8L242.2 164.1L243.8 163.7L245.7 163.6L247.4 164Z\"/><g class=\"iso-dots\" data-tone=\"mid\"><circle cx=\"244.9\" cy=\"166.1\" r=\"0.4\"/><circle cx=\"450.8\" cy=\"234.3\" r=\"0.4\"/></g><g clip-path=\"url(#__ID__-win)\"><path class=\"iso-shade\" data-shade=\"0\" d=\"M409.6 222.6L412.2 223.9L413.7 225.6L413.8 227.6L412.5 229.4L389.4 249L386.9 250.4L383.6 251.2L380 251.2L376.6 250.5L249.8 208.6L247.2 207.3L245.7 205.5L245.6 203.6L246.9 201.8L270 182.2L272.5 180.8L275.8 180L279.4 179.9L282.8 180.6Z\"/><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M221.1 246.1L221.1 244.8L221.2 243.5L221.3 242.2L221.4 240.8L221.5 239.5L221.7 238.1L221.8 236.7L222.1 235.3L222.3 233.9L222.6 232.5L222.9 231L223.2 229.6L223.6 228.2L223.9 226.7L224.3 225.3L224.8 223.9L225.2 222.4L225.7 221L226.2 219.6L226.7 218.2L227.3 216.8L227.8 215.5L228.4 214.1L229 212.8L229.6 211.5L230.3 210.2L230.9 208.9L231.6 207.7L232.3 206.5L233 205.3L233.7 204.1L234.5 203L235.2 201.9L235.9 200.9L236.7 199.9L237.5 198.9L238.2 198L239 197.1L239.8 196.2L240.6 195.4L241.4 194.6L242.2 193.9L243 193.3L243.8 192.6L244.6 192L245.3 191.5L246.1 191L246.9 190.6L247.7 190.2L248.4 189.9L249.2 189.6L249.9 189.4L250.7 189.3L251.4 189.1L252.1 189.1L252.8 189.1L253.5 189.1L254.2 189.2L254.9 189.4L255.5 189.6L429.7 247.2L430.4 247.5L431 247.8L431.6 248.2L432.1 248.6L432.7 249L433.2 249.5L433.7 250.1L434.2 250.7L434.6 251.4L435 252.1L435.5 252.8L435.8 253.6L436.2 254.4L436.5 255.3L436.8 256.2L437.1 257.2L437.3 258.2L437.5 259.2L437.7 260.3L437.9 261.4L438 262.6L438.1 263.7L438.2 264.9L438.2 266.2L438.3 267.4L438.2 268.7L438.2 270L438.1 271.3L438 272.7L437.9 274L437.7 275.4L437.5 276.8L437.3 278.2L437.1 279.6L436.8 281L436.5 282.5L436.2 283.9L435.8 285.3L435.5 286.8L435 288.2L434.6 289.6L434.2 291.1L433.7 292.5L433.2 293.9L432.7 295.3L432.1 296.7L431.6 298L431 299.4L430.4 300.7L429.7 302L429.1 303.3L428.4 304.6L427.8 305.8L427.1 307L426.4 308.2L425.7 309.4L424.9 310.5L424.2 311.6L423.4 312.6L422.7 313.6L421.9 314.6L421.1 315.5L420.4 316.4L419.6 317.3L418.8 318.1L418 318.9L417.2 319.6L416.4 320.2L415.6 320.9L414.8 321.4L414 322L413.3 322.5L412.5 322.9L411.7 323.3L410.9 323.6L410.2 323.9L409.4 324.1L408.7 324.2L408 324.4L407.3 324.4L406.6 324.4L405.9 324.4L405.2 324.3L404.5 324.1L403.9 323.9L229.6 266.2L229 266L228.4 265.7L227.8 265.3L227.3 264.9L226.7 264.5L226.2 264L225.7 263.4L225.2 262.8L224.8 262.1L224.3 261.4L223.9 260.7L223.6 259.9L223.2 259.1L222.9 258.2L222.6 257.3L222.3 256.3L222.1 255.3L221.8 254.3L221.7 253.2L221.5 252.1L221.4 250.9L221.3 249.8L221.2 248.6L221.1 247.3Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M230.3 266.5L229 266L227.8 265.3L226.7 264.5L225.7 263.4L224.8 262.1L223.9 260.7L223.2 259.1L397.4 316.8L398.2 318.4L399 319.8L399.9 321.1L401 322.2L402.1 323L403.3 323.7L404.5 324.1ZM395.4 303.8L395.4 301.2L395.6 298.5L395.9 295.8L396.3 293L396.8 290.2L397.4 287.3L398.2 284.4L399 281.6L399.9 278.7L401 275.9L402.1 273.2L403.3 270.5L404.5 267.9L405.9 265.4L407.3 263L408.7 260.7L410.2 258.6L411.7 256.6L413.3 254.8L414.8 253.1L416.4 251.6L418 250.3L419.6 249.2L421.1 248.3L422.7 247.6L424.2 247.1L425.7 246.8L427.1 246.8L428.4 246.9L429.7 247.2L431 247.8L432.1 248.6L433.2 249.5L434.2 250.7L435 252.1L435.8 253.6L436.5 255.3L437.1 257.2L437.5 259.2L437.9 261.4L438.1 263.7L438.2 266.2L438.2 268.7L438.1 271.3L437.9 274L437.5 276.8L437.1 279.6L436.5 282.5L435.8 285.3L435 288.2L434.2 291.1L433.2 293.9L432.1 296.7L431 299.4L429.7 302L428.4 304.6L427.1 307L425.7 309.4L424.2 311.6L422.7 313.6L421.1 315.5L419.6 317.3L418 318.9L416.4 320.2L414.8 321.4L413.3 322.5L411.7 323.3L410.2 323.9L408.7 324.2L407.3 324.4L405.9 324.4L404.5 324.1L403.3 323.7L402.1 323L401 322.2L399.9 321.1L399 319.8L398.2 318.4L397.4 316.8L396.8 315L396.3 313L395.9 310.9L395.6 308.6L395.4 306.3L395.4 303.8L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6L416.8 285.6Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M223.2 259.1L222.6 257.3L222.1 255.3L221.7 253.2L221.4 250.9L395.6 308.6L395.9 310.9L396.3 313L396.8 315L397.4 316.8Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M221.4 250.9L221.2 248.6L221.1 246.1L221.2 243.5L395.4 301.2L395.4 303.8L395.4 306.3L395.6 308.6Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M221.2 243.5L221.4 240.8L221.7 238.1L222.1 235.3L222.6 232.5L223.2 229.6L397.4 287.3L396.8 290.2L396.3 293L395.9 295.8L395.6 298.5L395.4 301.2ZM249.9 189.4L251.4 189.1L252.8 189.1L254.2 189.2L255.5 189.6L429.7 247.2L428.4 246.9L427.1 246.8L425.7 246.8L424.2 247.1Z\"/><path class=\"iso-top\" d=\"M223.2 229.6L223.9 226.7L224.8 223.9L225.7 221L226.7 218.2L227.8 215.5L229 212.8L230.3 210.2L231.6 207.7L233 205.3L234.5 203L235.9 200.9L237.5 198.9L239 197.1L240.6 195.4L242.2 193.9L243.8 192.6L245.3 191.5L246.9 190.6L248.4 189.9L249.9 189.4L424.2 247.1L422.7 247.6L421.1 248.3L419.6 249.2L418 250.3L416.4 251.6L414.8 253.1L413.3 254.8L411.7 256.6L410.2 258.6L408.7 260.7L407.3 263L405.9 265.4L404.5 267.9L403.3 270.5L402.1 273.2L401 275.9L399.9 278.7L399 281.6L398.2 284.4L397.4 287.3Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" d=\"M404.1 324L403.5 323.8L402.9 323.5L402.3 323.1L401.7 322.8L401.1 322.3L400.6 321.8L400.1 321.3L399.6 320.7L399.2 320L398.7 319.4L398.3 318.6L397.9 317.8L397.6 317L397.2 316.2L396.9 315.3L396.6 314.3L396.4 313.3L396.1 312.3L396 311.2L395.8 310.1L395.6 309L395.5 307.8L395.4 306.7L395.4 305.4L395.4 304.2L395.4 302.9L395.4 301.6L395.5 300.3L395.6 299L395.7 297.6L395.8 296.2L396 294.8L396.2 293.4L396.5 292L396.7 290.6L397 289.2L397.3 287.8L397.7 286.3L398.1 284.9L398.4 283.4L398.9 282L399.3 280.6L399.8 279.2L400.3 277.8L400.8 276.4L401.3 275L401.9 273.6L402.5 272.2L403.1 270.9L403.7 269.6L404.3 268.3L405 267L405.6 265.8L406.3 264.5L407 263.4L407.7 262.2L408.5 261.1L409.2 260L409.9 258.9L410.7 257.9L411.5 256.9L412.2 255.9L413 255L413.8 254.2L414.6 253.4L415.4 252.6L416.2 251.8L417 251.2L417.8 250.5L418.5 249.9L419.3 249.4L420.1 248.9L420.9 248.4L421.7 248L422.4 247.7L423.2 247.4L424 247.2L424.7 247L425.4 246.9L426.1 246.8L426.9 246.8L427.5 246.8L428.2 246.9L428.9 247L429.5 247.2\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" d=\"M221.1 246.1L221.1 244.8L221.2 243.5L221.3 242.2L221.4 240.8L221.5 239.5L221.7 238.1L221.8 236.7L222.1 235.3L222.3 233.9L222.6 232.5L222.9 231L223.2 229.6L223.6 228.2L223.9 226.7L224.3 225.3L224.8 223.9L225.2 222.4L225.7 221L226.2 219.6L226.7 218.2L227.3 216.8L227.8 215.5L228.4 214.1L229 212.8L229.6 211.5L230.3 210.2L230.9 208.9L231.6 207.7L232.3 206.5L233 205.3L233.7 204.1L234.5 203L235.2 201.9L235.9 200.9L236.7 199.9L237.5 198.9L238.2 198L239 197.1L239.8 196.2L240.6 195.4L241.4 194.6L242.2 193.9L243 193.3L243.8 192.6L244.6 192L245.3 191.5L246.1 191L246.9 190.6L247.7 190.2L248.4 189.9L249.2 189.6L249.9 189.4L250.7 189.3L251.4 189.1L252.1 189.1L252.8 189.1L253.5 189.1L254.2 189.2L254.9 189.4L255.5 189.6L429.7 247.2L430.4 247.5L431 247.8L431.6 248.2L432.1 248.6L432.7 249L433.2 249.5L433.7 250.1L434.2 250.7L434.6 251.4L435 252.1L435.5 252.8L435.8 253.6L436.2 254.4L436.5 255.3L436.8 256.2L437.1 257.2L437.3 258.2L437.5 259.2L437.7 260.3L437.9 261.4L438 262.6L438.1 263.7L438.2 264.9L438.2 266.2L438.3 267.4L438.2 268.7L438.2 270L438.1 271.3L438 272.7L437.9 274L437.7 275.4L437.5 276.8L437.3 278.2L437.1 279.6L436.8 281L436.5 282.5L436.2 283.9L435.8 285.3L435.5 286.8L435 288.2L434.6 289.6L434.2 291.1L433.7 292.5L433.2 293.9L432.7 295.3L432.1 296.7L431.6 298L431 299.4L430.4 300.7L429.7 302L429.1 303.3L428.4 304.6L427.8 305.8L427.1 307L426.4 308.2L425.7 309.4L424.9 310.5L424.2 311.6L423.4 312.6L422.7 313.6L421.9 314.6L421.1 315.5L420.4 316.4L419.6 317.3L418.8 318.1L418 318.9L417.2 319.6L416.4 320.2L415.6 320.9L414.8 321.4L414 322L413.3 322.5L412.5 322.9L411.7 323.3L410.9 323.6L410.2 323.9L409.4 324.1L408.7 324.2L408 324.4L407.3 324.4L406.6 324.4L405.9 324.4L405.2 324.3L404.5 324.1L403.9 323.9L229.6 266.2L229 266L228.4 265.7L227.8 265.3L227.3 264.9L226.7 264.5L226.2 264L225.7 263.4L225.2 262.8L224.8 262.1L224.3 261.4L223.9 260.7L223.6 259.9L223.2 259.1L222.9 258.2L222.6 257.3L222.3 256.3L222.1 255.3L221.8 254.3L221.7 253.2L221.5 252.1L221.4 250.9L221.3 249.8L221.2 248.6L221.1 247.3Z\"/></g><path data-part=\"rollline\" class=\"iso-line\" data-tone=\"mid\" d=\"\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M245.6 203.6L246.9 201.8L246.9 207.6L245.6 209.4ZM246.9 201.8L270 182.2L270 188L246.9 207.6ZM270 182.2L272.5 180.8L272.5 186.6L270 188Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M272.5 180.8L275.8 180L275.8 185.8L272.5 186.6ZM275.8 180L279.4 179.9L279.4 185.7L275.8 185.8Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M279.4 179.9L282.8 180.6L282.8 186.4L279.4 185.7Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M282.8 180.6L409.6 222.6L409.6 228.4L282.8 186.4ZM409.6 222.6L412.2 223.9L412.2 229.7L409.6 228.4ZM412.2 223.9L413.7 225.6L413.7 231.4L412.2 229.7ZM413.7 225.6L413.8 227.6L413.8 233.4L413.7 231.4Z\"/><path class=\"iso-line\" data-tone=\"faint\" d=\"M245.6 203.6L245.6 209.4L246.9 207.6L270 188L272.5 186.6L275.8 185.8L279.4 185.7L282.8 186.4L409.6 228.4L412.2 229.7L413.7 231.4L413.8 233.4L413.8 227.6\"/></g><path class=\"iso-line\" data-tone=\"lo\" d=\"M409.6 222.6L412.2 223.9L413.7 225.6L413.8 227.6L412.5 229.4L389.4 249L386.9 250.4L383.6 251.2L380 251.2L376.6 250.5L249.8 208.6L247.2 207.3L245.7 205.5L245.6 203.6L246.9 201.8L270 182.2L272.5 180.8L275.8 180L279.4 179.9L282.8 180.6Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M366 263.7L367.1 264.3L367.5 265.2L367 266L365.7 267.1L364.5 267.7L362.9 267.9L361.4 267.6L234.7 225.7L233.6 225L233.2 224.2L233.7 223.4L235 222.3L236.2 221.7L237.7 221.5L239.3 221.8Z\"/><path class=\"iso-line\" data-tone=\"lo\" d=\"M366 263.7L367.1 264.3L367.5 265.2L367 266L365.7 267.1L364.5 267.7L362.9 267.9L361.4 267.6L234.7 225.7L233.6 225L233.2 224.2L233.7 223.4L235 222.3L236.2 221.7L237.7 221.5L239.3 221.8Z\"/><g data-part=\"paper\" class=\"iso-solid\"><path class=\"iso-fill\" data-part=\"pfill\" d=\"\"/><path class=\"iso-shade\" data-part=\"pface\" data-shade=\"3\" d=\"\"/><path data-part=\"pcurl\" fill=\"url(#__ID__-curl)\" stroke=\"none\" d=\"\"/><g transform=\"matrix(2.64 0.874 0 2.64 299.67 245.25)\" clip-path=\"url(#__ID__-ink)\"><g data-part=\"ink\"></g></g><path class=\"iso-line iso-edge\" data-part=\"pedge\" data-tone=\"hi\" d=\"\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M224.2 219.4L224.4 218.7L225.8 217.5L226.9 217.1L228.3 217.2L367.7 263.4L368.5 264L368.5 270.3L368.3 271.1L367 272.2L365.8 272.7L364.4 272.5L225 226.4L224.2 225.8Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M368.5 270.3L368.3 271.1L368.3 264.8L368.5 264ZM368.3 271.1L367 272.2L367 265.9L368.3 264.8ZM367 272.2L365.8 272.7L365.8 266.3L367 265.9Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M365.8 272.7L364.4 272.5L364.4 266.2L365.8 266.3Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M364.4 272.5L225 226.4L225 220L364.4 266.2ZM225 226.4L224.2 225.8L224.2 219.4L225 220Z\"/><path class=\"iso-top\" d=\"M367.7 263.4L368.5 264L368.3 264.8L367 265.9L365.8 266.3L364.4 266.2L225 220L224.2 219.4L224.4 218.7L225.8 217.5L226.9 217.1L228.3 217.2Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M368.5 264L368.3 264.8L367 265.9L365.8 266.3L364.4 266.2L225 220L224.2 219.4\"/><path class=\"iso-line iso-bevel\" data-tone=\"faint\" d=\"M368.5 264L367.4 264.6L366.3 265.5L365.6 265.8L364.7 265.7L225.7 219.7L224.2 219.4\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M224.2 219.4L224.4 218.7L225.8 217.5L226.9 217.1L228.3 217.2L367.7 263.4L368.5 264M368.5 270.3L368.3 271.1L367 272.2L365.8 272.7L364.4 272.5L225 226.4L224.2 225.8M368.5 264L368.5 270.3M224.2 219.4L224.2 225.8\"/></g><path class=\"iso-line\" data-tone=\"lo\" d=\"M228.3 217.2L231.3 219.6L236.5 219.9L239.5 222.3L244.7 222.7L247.7 225L252.9 225.4L255.9 227.7L261.1 228.1L264.1 230.4L269.3 230.8L272.3 233.1L277.5 233.5L280.5 235.9L285.7 236.2L288.7 238.6L293.9 239L296.9 241.3L302.1 241.7L305.1 244L310.3 244.4L313.3 246.7L318.5 247.1L321.5 249.4L326.7 249.8L329.7 252.2L334.9 252.5L337.9 254.9L343.1 255.2L346.1 257.6L351.3 258L354.3 260.3L359.5 260.7L362.5 263L367.7 263.4\"/><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M163.9 223.7L165.1 221.5L173.3 214.5L176.4 213L180.5 212.5L184.5 213.2L279.5 244.6L282.4 246.3L283.3 248.4L283.3 250.5L282.1 252.7L273.9 259.7L270.8 261.2L266.7 261.7L262.7 261L167.7 229.6L164.8 227.9L163.9 225.8Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M283.3 250.5L282.1 252.7L282.1 250.6L283.3 248.4ZM282.1 252.7L273.9 259.7L273.9 257.5L282.1 250.6ZM273.9 259.7L270.8 261.2L270.8 259.1L273.9 257.5Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M270.8 261.2L266.7 261.7L266.7 259.6L270.8 259.1Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M266.7 261.7L262.7 261L262.7 258.9L266.7 259.6Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M262.7 261L167.7 229.6L167.7 227.4L262.7 258.9ZM167.7 229.6L164.8 227.9L164.8 225.8L167.7 227.4ZM164.8 227.9L163.9 225.8L163.9 223.7L164.8 225.8Z\"/><path class=\"iso-top\" d=\"M279.5 244.6L282.4 246.3L283.3 248.4L282.1 250.6L273.9 257.5L270.8 259.1L266.7 259.6L262.7 258.9L167.7 227.4L164.8 225.8L163.9 223.7L165.1 221.5L173.3 214.5L176.4 213L180.5 212.5L184.5 213.2Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M283.3 248.4L282.1 250.6L273.9 257.5L270.8 259.1L266.7 259.6L262.7 258.9L167.7 227.4L164.8 225.8L163.9 223.7\"/><path class=\"iso-line iso-bevel\" data-tone=\"faint\" d=\"M283.3 248.4L281.3 250.3L273.1 257.2L270.4 258.6L266.8 259.1L263.1 258.5L168.3 227.1L165.6 225.6L163.9 223.7\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M163.9 223.7L165.1 221.5L173.3 214.5L176.4 213L180.5 212.5L184.5 213.2L279.5 244.6L282.4 246.3L283.3 248.4M283.3 250.5L282.1 252.7L273.9 259.7L270.8 261.2L266.7 261.7L262.7 261L167.7 229.6L164.8 227.9L163.9 225.8M283.3 248.4L283.3 250.5M163.9 223.7L163.9 225.8\"/></g><g clip-path=\"url(#__ID__-disp)\"><path class=\"iso-shade\" data-shade=\"0\" d=\"M276.9 246.9L278 247.5L278.4 248.3L277.9 249.2L269.6 256.1L268.5 256.7L266.9 256.9L265.4 256.7L170.3 225.2L169.2 224.6L168.9 223.7L169.3 222.9L177.6 215.9L178.8 215.4L180.3 215.2L181.9 215.4Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M179.2 214.5L279.5 247.8L279.5 249.3L179.2 216.1Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M179.2 214.5L167.7 224.3L167.7 225.9L179.2 216.1Z\"/><text class=\"iso-face-text\" data-part=\"display\" data-tone=\"hi\" transform=\"matrix(2.64 0.874 -1.65 1.399 300 244.443)\" x=\"-5.6\" y=\"11\" font-size=\"4.2\" text-anchor=\"end\"></text></g><path class=\"iso-line\" data-tone=\"lo\" d=\"M276.9 246.9L278 247.5L278.4 248.3L277.9 249.2L269.6 256.1L268.5 256.7L266.9 256.9L265.4 256.7L170.3 225.2L169.2 224.6L168.9 223.7L169.3 222.9L177.6 215.9L178.8 215.4L180.3 215.2L181.9 215.4Z\"/><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M161.9 232.1L162.2 231L164.5 229L166.3 228.4L168.4 228.6L191.1 236.1L192.4 237L192.4 240.2L192 241.3L189.7 243.3L187.9 243.9L185.8 243.7L163.1 236.2L161.9 235.3Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M192.4 240.2L192 241.3L192 238.1L192.4 237ZM192 241.3L189.7 243.3L189.7 240.1L192 238.1ZM189.7 243.3L187.9 243.9L187.9 240.8L189.7 240.1Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M187.9 243.9L185.8 243.7L185.8 240.6L187.9 240.8Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M185.8 243.7L163.1 236.2L163.1 233L185.8 240.6ZM163.1 236.2L161.9 235.3L161.9 232.1L163.1 233Z\"/><path class=\"iso-top\" d=\"M191.1 236.1L192.4 237L192 238.1L189.7 240.1L187.9 240.8L185.8 240.6L163.1 233L161.9 232.1L162.2 231L164.5 229L166.3 228.4L168.4 228.6Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M192.4 237L192 238.1L189.7 240.1L187.9 240.8L185.8 240.6L163.1 233L161.9 232.1\"/><path class=\"iso-line iso-bevel\" data-tone=\"faint\" d=\"M192.4 237L191.1 238L189 239.8L187.7 240.3L186.2 240.1L163.8 232.7L161.9 232.1\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M161.9 232.1L162.2 231L164.5 229L166.3 228.4L168.4 228.6L191.1 236.1L192.4 237M192.4 240.2L192 241.3L189.7 243.3L187.9 243.9L185.8 243.7L163.1 236.2L161.9 235.3M192.4 237L192.4 240.2M161.9 232.1L161.9 235.3\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M154.6 238.3L155 237.2L157.3 235.2L159 234.5L161.1 234.7L183.8 242.2L185.1 243.2L185.1 246.3L184.7 247.5L182.4 249.4L180.7 250.1L178.6 249.9L155.9 242.4L154.6 241.4Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M185.1 246.3L184.7 247.5L184.7 244.3L185.1 243.2ZM184.7 247.5L182.4 249.4L182.4 246.2L184.7 244.3ZM182.4 249.4L180.7 250.1L180.7 246.9L182.4 246.2Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M180.7 250.1L178.6 249.9L178.6 246.7L180.7 246.9Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M178.6 249.9L155.9 242.4L155.9 239.2L178.6 246.7ZM155.9 242.4L154.6 241.4L154.6 238.3L155.9 239.2Z\"/><path class=\"iso-top\" d=\"M183.8 242.2L185.1 243.2L184.7 244.3L182.4 246.2L180.7 246.9L178.6 246.7L155.9 239.2L154.6 238.3L155 237.2L157.3 235.2L159 234.5L161.1 234.7Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M185.1 243.2L184.7 244.3L182.4 246.2L180.7 246.9L178.6 246.7L155.9 239.2L154.6 238.3\"/><path class=\"iso-line iso-bevel\" data-tone=\"faint\" d=\"M185.1 243.2L183.9 244.1L181.7 245.9L180.5 246.4L178.9 246.3L156.5 238.8L154.6 238.3\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M154.6 238.3L155 237.2L157.3 235.2L159 234.5L161.1 234.7L183.8 242.2L185.1 243.2M185.1 246.3L184.7 247.5L182.4 249.4L180.7 250.1L178.6 249.9L155.9 242.4L154.6 241.4M185.1 243.2L185.1 246.3M154.6 238.3L154.6 241.4\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M194.6 243L195 241.8L197.3 239.9L199 239.2L201.1 239.4L223.8 246.9L225.1 247.9L225.1 251L224.7 252.1L222.4 254.1L220.7 254.8L218.6 254.6L195.9 247.1L194.6 246.1Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M225.1 251L224.7 252.1L224.7 249L225.1 247.9ZM224.7 252.1L222.4 254.1L222.4 250.9L224.7 249ZM222.4 254.1L220.7 254.8L220.7 251.6L222.4 250.9Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M220.7 254.8L218.6 254.6L218.6 251.4L220.7 251.6Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M218.6 254.6L195.9 247.1L195.9 243.9L218.6 251.4ZM195.9 247.1L194.6 246.1L194.6 243L195.9 243.9Z\"/><path class=\"iso-top\" d=\"M223.8 246.9L225.1 247.9L224.7 249L222.4 250.9L220.7 251.6L218.6 251.4L195.9 243.9L194.6 243L195 241.8L197.3 239.9L199 239.2L201.1 239.4Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M225.1 247.9L224.7 249L222.4 250.9L220.7 251.6L218.6 251.4L195.9 243.9L194.6 243\"/><path class=\"iso-line iso-bevel\" data-tone=\"faint\" d=\"M225.1 247.9L223.9 248.8L221.7 250.6L220.5 251.1L218.9 250.9L196.5 243.5L194.6 243\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M194.6 243L195 241.8L197.3 239.9L199 239.2L201.1 239.4L223.8 246.9L225.1 247.9M225.1 251L224.7 252.1L222.4 254.1L220.7 254.8L218.6 254.6L195.9 247.1L194.6 246.1M225.1 247.9L225.1 251M194.6 243L194.6 246.1\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M147.4 244.4L147.7 243.3L150 241.4L151.8 240.7L153.9 240.9L176.6 248.4L177.8 249.3L177.8 252.5L177.5 253.6L175.2 255.6L173.4 256.2L171.3 256L148.6 248.5L147.4 247.6Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M177.8 252.5L177.5 253.6L177.5 250.4L177.8 249.3ZM177.5 253.6L175.2 255.6L175.2 252.4L177.5 250.4ZM175.2 255.6L173.4 256.2L173.4 253.1L175.2 252.4Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M173.4 256.2L171.3 256L171.3 252.9L173.4 253.1Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M171.3 256L148.6 248.5L148.6 245.4L171.3 252.9ZM148.6 248.5L147.4 247.6L147.4 244.4L148.6 245.4Z\"/><path class=\"iso-top\" d=\"M176.6 248.4L177.8 249.3L177.5 250.4L175.2 252.4L173.4 253.1L171.3 252.9L148.6 245.4L147.4 244.4L147.7 243.3L150 241.4L151.8 240.7L153.9 240.9Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M177.8 249.3L177.5 250.4L175.2 252.4L173.4 253.1L171.3 252.9L148.6 245.4L147.4 244.4\"/><path class=\"iso-line iso-bevel\" data-tone=\"faint\" d=\"M177.8 249.3L176.6 250.3L174.5 252.1L173.2 252.6L171.6 252.4L149.2 245L147.4 244.4\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M147.4 244.4L147.7 243.3L150 241.4L151.8 240.7L153.9 240.9L176.6 248.4L177.8 249.3M177.8 252.5L177.5 253.6L175.2 255.6L173.4 256.2L171.3 256L148.6 248.5L147.4 247.6M177.8 249.3L177.8 252.5M147.4 244.4L147.4 247.6\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M187.4 249.1L187.7 248L190 246L191.8 245.4L193.9 245.6L216.6 253.1L217.8 254L217.8 257.2L217.5 258.3L215.2 260.3L213.4 260.9L211.3 260.7L188.6 253.2L187.4 252.3Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M217.8 257.2L217.5 258.3L217.5 255.1L217.8 254ZM217.5 258.3L215.2 260.3L215.2 257.1L217.5 255.1ZM215.2 260.3L213.4 260.9L213.4 257.7L215.2 257.1Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M213.4 260.9L211.3 260.7L211.3 257.6L213.4 257.7Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M211.3 260.7L188.6 253.2L188.6 250L211.3 257.6ZM188.6 253.2L187.4 252.3L187.4 249.1L188.6 250Z\"/><path class=\"iso-top\" d=\"M216.6 253.1L217.8 254L217.5 255.1L215.2 257.1L213.4 257.7L211.3 257.6L188.6 250L187.4 249.1L187.7 248L190 246L191.8 245.4L193.9 245.6Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M217.8 254L217.5 255.1L215.2 257.1L213.4 257.7L211.3 257.6L188.6 250L187.4 249.1\"/><path class=\"iso-line iso-bevel\" data-tone=\"faint\" d=\"M217.8 254L216.6 255L214.5 256.8L213.2 257.3L211.6 257.1L189.2 249.7L187.4 249.1\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M187.4 249.1L187.7 248L190 246L191.8 245.4L193.9 245.6L216.6 253.1L217.8 254M217.8 257.2L217.5 258.3L215.2 260.3L213.4 260.9L211.3 260.7L188.6 253.2L187.4 252.3M217.8 254L217.8 257.2M187.4 249.1L187.4 252.3\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M140.1 250.6L140.5 249.5L142.8 247.5L144.5 246.9L146.6 247L169.3 254.6L170.6 255.5L170.6 258.6L170.2 259.8L167.9 261.7L166.2 262.4L164.1 262.2L141.3 254.7L140.1 253.8Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M170.6 258.6L170.2 259.8L170.2 256.6L170.6 255.5ZM170.2 259.8L167.9 261.7L167.9 258.6L170.2 256.6ZM167.9 261.7L166.2 262.4L166.2 259.2L167.9 258.6Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M166.2 262.4L164.1 262.2L164.1 259L166.2 259.2Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M164.1 262.2L141.3 254.7L141.3 251.5L164.1 259ZM141.3 254.7L140.1 253.8L140.1 250.6L141.3 251.5Z\"/><path class=\"iso-top\" d=\"M169.3 254.6L170.6 255.5L170.2 256.6L167.9 258.6L166.2 259.2L164.1 259L141.3 251.5L140.1 250.6L140.5 249.5L142.8 247.5L144.5 246.9L146.6 247Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M170.6 255.5L170.2 256.6L167.9 258.6L166.2 259.2L164.1 259L141.3 251.5L140.1 250.6\"/><path class=\"iso-line iso-bevel\" data-tone=\"faint\" d=\"M170.6 255.5L169.3 256.4L167.2 258.2L166 258.7L164.4 258.6L142 251.2L140.1 250.6\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M140.1 250.6L140.5 249.5L142.8 247.5L144.5 246.9L146.6 247L169.3 254.6L170.6 255.5M170.6 258.6L170.2 259.8L167.9 261.7L166.2 262.4L164.1 262.2L141.3 254.7L140.1 253.8M170.6 255.5L170.6 258.6M140.1 250.6L140.1 253.8\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M227.3 253.8L227.7 252.7L230 250.7L231.8 250.1L233.9 250.3L256.6 257.8L257.8 258.7L257.8 261.9L257.5 263L255.2 264.9L253.4 265.6L251.3 265.4L228.6 257.9L227.3 257Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M257.8 261.9L257.5 263L257.5 259.8L257.8 258.7ZM257.5 263L255.2 264.9L255.2 261.8L257.5 259.8ZM255.2 264.9L253.4 265.6L253.4 262.4L255.2 261.8Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M253.4 265.6L251.3 265.4L251.3 262.2L253.4 262.4Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M251.3 265.4L228.6 257.9L228.6 254.7L251.3 262.2ZM228.6 257.9L227.3 257L227.3 253.8L228.6 254.7Z\"/><path class=\"iso-top\" d=\"M256.6 257.8L257.8 258.7L257.5 259.8L255.2 261.8L253.4 262.4L251.3 262.2L228.6 254.7L227.3 253.8L227.7 252.7L230 250.7L231.8 250.1L233.9 250.3Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M257.8 258.7L257.5 259.8L255.2 261.8L253.4 262.4L251.3 262.2L228.6 254.7L227.3 253.8\"/><path class=\"iso-line iso-bevel\" data-tone=\"faint\" d=\"M257.8 258.7L256.6 259.6L254.5 261.4L253.2 262L251.6 261.8L229.2 254.4L227.3 253.8\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M227.3 253.8L227.7 252.7L230 250.7L231.8 250.1L233.9 250.3L256.6 257.8L257.8 258.7M257.8 261.9L257.5 263L255.2 264.9L253.4 265.6L251.3 265.4L228.6 257.9L227.3 257M257.8 258.7L257.8 261.9M227.3 253.8L227.3 257\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M180.1 255.3L180.4 254.2L182.8 252.2L184.5 251.5L186.6 251.7L209.3 259.2L210.6 260.2L210.6 263.3L210.2 264.5L207.9 266.4L206.2 267.1L204 266.9L181.3 259.4L180.1 258.4Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M210.6 263.3L210.2 264.5L210.2 261.3L210.6 260.2ZM210.2 264.5L207.9 266.4L207.9 263.2L210.2 261.3ZM207.9 266.4L206.2 267.1L206.2 263.9L207.9 263.2Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M206.2 267.1L204 266.9L204 263.7L206.2 263.9Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M204 266.9L181.3 259.4L181.3 256.2L204 263.7ZM181.3 259.4L180.1 258.4L180.1 255.3L181.3 256.2Z\"/><path class=\"iso-top\" d=\"M209.3 259.2L210.6 260.2L210.2 261.3L207.9 263.2L206.2 263.9L204 263.7L181.3 256.2L180.1 255.3L180.4 254.2L182.8 252.2L184.5 251.5L186.6 251.7Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M210.6 260.2L210.2 261.3L207.9 263.2L206.2 263.9L204 263.7L181.3 256.2L180.1 255.3\"/><path class=\"iso-line iso-bevel\" data-tone=\"faint\" d=\"M210.6 260.2L209.3 261.1L207.2 262.9L206 263.4L204.4 263.3L182 255.8L180.1 255.3\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M180.1 255.3L180.4 254.2L182.8 252.2L184.5 251.5L186.6 251.7L209.3 259.2L210.6 260.2M210.6 263.3L210.2 264.5L207.9 266.4L206.2 267.1L204 266.9L181.3 259.4L180.1 258.4M210.6 260.2L210.6 263.3M180.1 255.3L180.1 258.4\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M220.1 260L220.4 258.8L222.8 256.9L224.5 256.2L226.6 256.4L249.3 263.9L250.6 264.9L250.6 268L250.2 269.1L247.9 271.1L246.2 271.8L244 271.6L221.3 264.1L220.1 263.1Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M250.6 268L250.2 269.1L250.2 266L250.6 264.9ZM250.2 269.1L247.9 271.1L247.9 267.9L250.2 266ZM247.9 271.1L246.2 271.8L246.2 268.6L247.9 267.9Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M246.2 271.8L244 271.6L244 268.4L246.2 268.6Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M244 271.6L221.3 264.1L221.3 260.9L244 268.4ZM221.3 264.1L220.1 263.1L220.1 260L221.3 260.9Z\"/><path class=\"iso-top\" d=\"M249.3 263.9L250.6 264.9L250.2 266L247.9 267.9L246.2 268.6L244 268.4L221.3 260.9L220.1 260L220.4 258.8L222.8 256.9L224.5 256.2L226.6 256.4Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M250.6 264.9L250.2 266L247.9 267.9L246.2 268.6L244 268.4L221.3 260.9L220.1 260\"/><path class=\"iso-line iso-bevel\" data-tone=\"faint\" d=\"M250.6 264.9L249.3 265.8L247.2 267.6L245.9 268.1L244.4 267.9L222 260.5L220.1 260\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M220.1 260L220.4 258.8L222.8 256.9L224.5 256.2L226.6 256.4L249.3 263.9L250.6 264.9M250.6 268L250.2 269.1L247.9 271.1L246.2 271.8L244 271.6L221.3 264.1L220.1 263.1M250.6 264.9L250.6 268M220.1 260L220.1 263.1\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M172.8 261.4L173.2 260.3L175.5 258.4L177.2 257.7L179.4 257.9L202.1 265.4L203.3 266.3L203.3 269.5L203 270.6L200.6 272.6L198.9 273.2L196.8 273L174.1 265.5L172.8 264.6Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M203.3 269.5L203 270.6L203 267.4L203.3 266.3ZM203 270.6L200.6 272.6L200.6 269.4L203 267.4ZM200.6 272.6L198.9 273.2L198.9 270.1L200.6 269.4Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M198.9 273.2L196.8 273L196.8 269.9L198.9 270.1Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M196.8 273L174.1 265.5L174.1 262.4L196.8 269.9ZM174.1 265.5L172.8 264.6L172.8 261.4L174.1 262.4Z\"/><path class=\"iso-top\" d=\"M202.1 265.4L203.3 266.3L203 267.4L200.6 269.4L198.9 270.1L196.8 269.9L174.1 262.4L172.8 261.4L173.2 260.3L175.5 258.4L177.2 257.7L179.4 257.9Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M203.3 266.3L203 267.4L200.6 269.4L198.9 270.1L196.8 269.9L174.1 262.4L172.8 261.4\"/><path class=\"iso-line iso-bevel\" data-tone=\"faint\" d=\"M203.3 266.3L202.1 267.3L200 269.1L198.7 269.6L197.1 269.4L174.7 262L172.8 261.4\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M172.8 261.4L173.2 260.3L175.5 258.4L177.2 257.7L179.4 257.9L202.1 265.4L203.3 266.3M203.3 269.5L203 270.6L200.6 272.6L198.9 273.2L196.8 273L174.1 265.5L172.8 264.6M203.3 266.3L203.3 269.5M172.8 261.4L172.8 264.6\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M212.8 266.1L213.2 265L215.5 263L217.2 262.4L219.4 262.6L242.1 270.1L243.3 271L243.3 274.2L243 275.3L240.6 277.3L238.9 277.9L236.8 277.7L214.1 270.2L212.8 269.3Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M243.3 274.2L243 275.3L243 272.1L243.3 271ZM243 275.3L240.6 277.3L240.6 274.1L243 272.1ZM240.6 277.3L238.9 277.9L238.9 274.7L240.6 274.1Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M238.9 277.9L236.8 277.7L236.8 274.6L238.9 274.7Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M236.8 277.7L214.1 270.2L214.1 267L236.8 274.6ZM214.1 270.2L212.8 269.3L212.8 266.1L214.1 267Z\"/><path class=\"iso-top\" d=\"M242.1 270.1L243.3 271L243 272.1L240.6 274.1L238.9 274.7L236.8 274.6L214.1 267L212.8 266.1L213.2 265L215.5 263L217.2 262.4L219.4 262.6Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M243.3 271L243 272.1L240.6 274.1L238.9 274.7L236.8 274.6L214.1 267L212.8 266.1\"/><path class=\"iso-line iso-bevel\" data-tone=\"faint\" d=\"M243.3 271L242.1 272L240 273.7L238.7 274.3L237.1 274.1L214.7 266.7L212.8 266.1\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M212.8 266.1L213.2 265L215.5 263L217.2 262.4L219.4 262.6L242.1 270.1L243.3 271M243.3 274.2L243 275.3L240.6 277.3L238.9 277.9L236.8 277.7L214.1 270.2L212.8 269.3M243.3 271L243.3 274.2M212.8 266.1L212.8 269.3\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M205.6 272.3L205.9 271.1L208.2 269.2L210 268.5L212.1 268.7L234.8 276.2L236 277.2L236 280.3L235.7 281.5L233.4 283.4L231.6 284.1L229.5 283.9L206.8 276.4L205.6 275.4Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M236 280.3L235.7 281.5L235.7 278.3L236 277.2ZM235.7 281.5L233.4 283.4L233.4 280.2L235.7 278.3ZM233.4 283.4L231.6 284.1L231.6 280.9L233.4 280.2Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M231.6 284.1L229.5 283.9L229.5 280.7L231.6 280.9Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M229.5 283.9L206.8 276.4L206.8 273.2L229.5 280.7ZM206.8 276.4L205.6 275.4L205.6 272.3L206.8 273.2Z\"/><path class=\"iso-top\" d=\"M234.8 276.2L236 277.2L235.7 278.3L233.4 280.2L231.6 280.9L229.5 280.7L206.8 273.2L205.6 272.3L205.9 271.1L208.2 269.2L210 268.5L212.1 268.7Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M236 277.2L235.7 278.3L233.4 280.2L231.6 280.9L229.5 280.7L206.8 273.2L205.6 272.3\"/><path class=\"iso-line iso-bevel\" data-tone=\"faint\" d=\"M236 277.2L234.8 278.1L232.7 279.9L231.4 280.4L229.9 280.3L207.5 272.8L205.6 272.3\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M205.6 272.3L205.9 271.1L208.2 269.2L210 268.5L212.1 268.7L234.8 276.2L236 277.2M236 280.3L235.7 281.5L233.4 283.4L231.6 284.1L229.5 283.9L206.8 276.4L205.6 275.4M236 277.2L236 280.3M205.6 272.3L205.6 275.4\"/></g><g data-part=\"pad\"><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M258.9 285.3L259.2 283.2L260.7 281.3L287.1 258.9L289.7 257.4L293 256.3L296.8 255.9L300.7 256L304.3 256.8L351.8 272.6L354.8 273.9L356.8 275.7L357.6 277.7L357.6 280.9L357.3 282.9L355.8 284.8L329.4 307.2L326.8 308.8L323.5 309.8L319.7 310.3L315.8 310.1L312.2 309.3L264.7 293.6L261.8 292.2L259.8 290.5L258.9 288.4Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M357.6 280.9L357.3 282.9L357.3 279.8L357.6 277.7ZM357.3 282.9L355.8 284.8L355.8 281.7L357.3 279.8ZM355.8 284.8L329.4 307.2L329.4 304.1L355.8 281.7ZM329.4 307.2L326.8 308.8L326.8 305.6L329.4 304.1ZM326.8 308.8L323.5 309.8L323.5 306.7L326.8 305.6Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M323.5 309.8L319.7 310.3L319.7 307.1L323.5 306.7Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M319.7 310.3L315.8 310.1L315.8 307L319.7 307.1ZM315.8 310.1L312.2 309.3L312.2 306.2L315.8 307Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M312.2 309.3L264.7 293.6L264.7 290.4L312.2 306.2ZM264.7 293.6L261.8 292.2L261.8 289.1L264.7 290.4ZM261.8 292.2L259.8 290.5L259.8 287.3L261.8 289.1ZM259.8 290.5L258.9 288.4L258.9 285.3L259.8 287.3Z\"/><path class=\"iso-top\" d=\"M351.8 272.6L354.8 273.9L356.8 275.7L357.6 277.7L357.3 279.8L355.8 281.7L329.4 304.1L326.8 305.6L323.5 306.7L319.7 307.1L315.8 307L312.2 306.2L264.7 290.4L261.8 289.1L259.8 287.3L258.9 285.3L259.2 283.2L260.7 281.3L287.1 258.9L289.7 257.4L293 256.3L296.8 255.9L300.7 256L304.3 256.8Z\"/><path class=\"iso-line iso-crease\" data-tone=\"lo\" d=\"M357.6 277.7L357.3 279.8L355.8 281.7L329.4 304.1L326.8 305.6L323.5 306.7L319.7 307.1L315.8 307L312.2 306.2L264.7 290.4L261.8 289.1L259.8 287.3L258.9 285.3\"/><path class=\"iso-line iso-bevel\" data-tone=\"lo\" d=\"M357.6 277.7L355.5 279.5L354.1 281.2L327.9 303.5L325.6 304.9L322.8 305.8L319.6 306.2L316.3 306L313.1 305.3L265.8 289.6L263.2 288.4L261.5 286.9L258.9 285.3\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" d=\"M258.9 285.3L259.2 283.2L260.7 281.3L287.1 258.9L289.7 257.4L293 256.3L296.8 255.9L300.7 256L304.3 256.8L351.8 272.6L354.8 273.9L356.8 275.7L357.6 277.7M357.6 280.9L357.3 282.9L355.8 284.8L329.4 307.2L326.8 308.8L323.5 309.8L319.7 310.3L315.8 310.1L312.2 309.3L264.7 293.6L261.8 292.2L259.8 290.5L258.9 288.4M357.6 277.7L357.6 280.9M258.9 285.3L258.9 288.4\"/></g></g><g data-part=\"rings\"><path class=\"iso-line\" data-tone=\"mid\" d=\"M316.7 284.3L315.9 284.9L315.1 285.4L314 285.8L312.9 286.2L311.7 286.4L310.5 286.6L309.2 286.8L307.9 286.8L306.6 286.7L305.3 286.5L304.1 286.3L303 286L301.9 285.6L301 285.1L300.1 284.6L299.5 284L298.9 283.3L298.6 282.7L298.3 282L298.3 281.3L298.4 280.6L298.7 280L299.2 279.3L299.8 278.7L300.6 278.1L301.5 277.6L302.5 277.2L303.6 276.8L304.8 276.6L306 276.4L307.3 276.2L308.6 276.2L309.9 276.3L311.2 276.4L312.4 276.7L313.5 277L314.6 277.4L315.5 277.9L316.4 278.4L317.1 279L317.6 279.6L318 280.3L318.2 281L318.2 281.7L318.1 282.4L317.8 283L317.3 283.7Z\"/><path class=\"iso-line\" data-tone=\"mid\" d=\"M324.6 286.9L323.1 288L321.4 289L319.5 289.8L317.3 290.5L315 291.1L312.6 291.5L310.1 291.7L307.6 291.7L305.1 291.6L302.6 291.3L300.3 290.8L298 290.2L296 289.4L294.1 288.5L292.5 287.4L291.2 286.3L290.2 285.1L289.5 283.8L289 282.5L289 281.1L289.2 279.8L289.8 278.5L290.7 277.3L291.9 276.1L293.4 275L295.1 274L297 273.2L299.2 272.5L301.5 271.9L303.9 271.5L306.4 271.3L308.9 271.3L311.4 271.4L313.9 271.7L316.3 272.2L318.5 272.8L320.5 273.6L322.4 274.5L324 275.6L325.3 276.7L326.3 277.9L327.1 279.2L327.5 280.5L327.5 281.9L327.3 283.2L326.7 284.5L325.8 285.7Z\"/><path class=\"iso-line\" data-tone=\"mid\" d=\"M332.5 289.5L330.4 291.1L327.8 292.6L324.9 293.9L321.7 294.9L318.3 295.7L314.7 296.3L311 296.6L307.3 296.7L303.5 296.5L299.9 296L296.4 295.3L293.1 294.4L290 293.2L287.3 291.8L284.9 290.3L283 288.6L281.4 286.8L280.4 284.9L279.7 283L279.6 281L280 279L280.9 277.1L282.2 275.2L284 273.5L286.2 271.8L288.7 270.4L291.6 269.1L294.8 268.1L298.2 267.3L301.8 266.7L305.5 266.4L309.3 266.3L313 266.5L316.6 267L320.1 267.7L323.4 268.6L326.5 269.8L329.2 271.1L331.6 272.7L333.5 274.4L335.1 276.2L336.2 278.1L336.8 280L336.9 282L336.5 284L335.6 285.9L334.3 287.8Z\"/></g><g class=\"iso-dots\" data-tone=\"hi\"><circle cx=\"308.3\" cy=\"281.5\" r=\"0.6\"/></g><path class=\"iso-line\" data-tone=\"lo\" d=\"M389.5 297.9L387.6 299.2L385.2 300.2L382.4 300.9L379.5 301.3L376.4 301.3L373.4 301L370.6 300.3L368.2 299.2L366.3 298L365 296.5L364.3 294.9L364.3 293.3L364.9 291.7L366.3 290.3L368.2 289L370.6 288L373.3 287.3L376.3 286.9L379.4 286.9L382.4 287.2L385.1 287.9L387.5 289L389.5 290.2L390.8 291.7L391.5 293.3L391.5 294.9L390.8 296.5Z\"/><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M368 289.3L368.5 288.1L369.4 287.1L370.8 286.2L372.6 285.4L374.6 284.9L376.7 284.6L379 284.6L381.2 284.9L383.2 285.4L384.9 286.1L386.3 287.1L387.3 288.1L387.8 289.3L387.8 290.5L387.8 294.7L387.3 295.8L386.3 296.9L384.9 297.8L383.2 298.6L381.2 299.1L379 299.3L376.8 299.4L374.6 299.1L372.6 298.6L370.9 297.8L369.5 296.9L368.5 295.9L368 294.7L368 293.5Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M386.3 296.9L384.9 297.8L384.9 293.6L386.3 292.7ZM384.9 297.8L383.2 298.6L383.2 294.3L384.9 293.6ZM387.8 294.7L387.3 295.8L387.3 291.6L387.8 290.5ZM387.3 295.8L386.3 296.9L386.3 292.7L387.3 291.6Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M383.2 298.6L381.2 299.1L381.2 294.9L383.2 294.3ZM381.2 299.1L379 299.3L379 295.1L381.2 294.9ZM379 299.3L376.8 299.4L376.8 295.1L379 295.1Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M376.8 299.4L374.6 299.1L374.6 294.9L376.8 295.1ZM374.6 299.1L372.6 298.6L372.6 294.4L374.6 294.9Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M372.6 298.6L370.9 297.8L370.9 293.6L372.6 294.4ZM370.9 297.8L369.5 296.9L369.5 292.7L370.9 293.6ZM369.5 296.9L368.5 295.9L368.5 291.6L369.5 292.7ZM368.5 295.9L368 294.7L368 290.5L368.5 291.6ZM368 294.7L368 293.5L368 289.3L368 290.5Z\"/><path class=\"iso-top\" d=\"M386.3 292.7L384.9 293.6L383.2 294.3L381.2 294.9L379 295.1L376.8 295.1L374.6 294.9L372.6 294.4L370.9 293.6L369.5 292.7L368.5 291.6L368 290.5L368 289.3L368.5 288.1L369.4 287.1L370.8 286.2L372.6 285.4L374.6 284.9L376.7 284.6L379 284.6L381.2 284.9L383.2 285.4L384.9 286.1L386.3 287.1L387.3 288.1L387.8 289.3L387.8 290.5L387.3 291.6Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M387.8 290.5L387.3 291.6L386.3 292.7L384.9 293.6L383.2 294.3L381.2 294.9L379 295.1L376.8 295.1L374.6 294.9L372.6 294.4L370.9 293.6L369.5 292.7L368.5 291.6L368 290.5L368 289.3\"/><path class=\"iso-line iso-bevel\" data-tone=\"faint\" d=\"M387.8 290.5L386.4 291.4L385.5 292.4L384.3 293.3L382.7 293.9L380.9 294.4L378.9 294.6L376.9 294.6L374.9 294.4L373.1 293.9L371.5 293.3L370.3 292.4L369.4 291.5L368.9 290.4L368 289.3\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M368 289.3L368.5 288.1L369.4 287.1L370.8 286.2L372.6 285.4L374.6 284.9L376.7 284.6L379 284.6L381.2 284.9L383.2 285.4L384.9 286.1L386.3 287.1L387.3 288.1L387.8 289.3L387.8 290.5M387.8 294.7L387.3 295.8L386.3 296.9L384.9 297.8L383.2 298.6L381.2 299.1L379 299.3L376.8 299.4L374.6 299.1L372.6 298.6L370.9 297.8L369.5 296.9L368.5 295.9L368 294.7L368 293.5M368 289.3L368 293.5M387.8 290.5L387.8 294.7\"/></g><path class=\"iso-line\" data-tone=\"faint\" d=\"M382.6 291.5L381.5 292.2L380 292.6L378.3 292.8L376.5 292.8L374.9 292.4L373.6 291.8L372.7 291L372.3 290.1L372.4 289.2L373.1 288.3L374.3 287.6L375.8 287.1L377.5 286.9L379.2 287L380.9 287.4L382.2 288L383.1 288.8L383.5 289.7L383.3 290.6Z\"/><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M355.2 306.7L355.3 305.7L356.1 304.8L357.4 304L359.1 303.5L361 303.2L362.9 303.3L364.7 303.7L366.2 304.4L367.2 305.3L367.6 306.3L367.6 307.9L367.4 308.9L366.7 309.8L365.4 310.6L363.7 311.2L361.8 311.4L359.9 311.3L358.1 310.9L356.6 310.2L355.6 309.3L355.2 308.3Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M366.7 309.8L365.4 310.6L365.4 309L366.7 308.3ZM365.4 310.6L363.7 311.2L363.7 309.6L365.4 309ZM367.6 307.9L367.4 308.9L367.4 307.3L367.6 306.3ZM367.4 308.9L366.7 309.8L366.7 308.3L367.4 307.3Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M363.7 311.2L361.8 311.4L361.8 309.8L363.7 309.6Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M361.8 311.4L359.9 311.3L359.9 309.7L361.8 309.8ZM359.9 311.3L358.1 310.9L358.1 309.3L359.9 309.7Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M358.1 310.9L356.6 310.2L356.6 308.6L358.1 309.3ZM356.6 310.2L355.6 309.3L355.6 307.7L356.6 308.6ZM355.6 309.3L355.2 308.3L355.2 306.7L355.6 307.7Z\"/><path class=\"iso-top\" d=\"M366.7 308.3L365.4 309L363.7 309.6L361.8 309.8L359.9 309.7L358.1 309.3L356.6 308.6L355.6 307.7L355.2 306.7L355.3 305.7L356.1 304.8L357.4 304L359.1 303.5L361 303.2L362.9 303.3L364.7 303.7L366.2 304.4L367.2 305.3L367.6 306.3L367.4 307.3Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M367.6 306.3L367.4 307.3L366.7 308.3L365.4 309L363.7 309.6L361.8 309.8L359.9 309.7L358.1 309.3L356.6 308.6L355.6 307.7L355.2 306.7\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M355.2 306.7L355.3 305.7L356.1 304.8L357.4 304L359.1 303.5L361 303.2L362.9 303.3L364.7 303.7L366.2 304.4L367.2 305.3L367.6 306.3M367.6 307.9L367.4 308.9L366.7 309.8L365.4 310.6L363.7 311.2L361.8 311.4L359.9 311.3L358.1 310.9L356.6 310.2L355.6 309.3L355.2 308.3M355.2 306.7L355.2 308.3M367.6 306.3L367.6 307.9\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M357.7 304.1L358.2 303.3L359.2 302.8L360.5 302.5L362 302.4L363.4 302.7L364.4 303.2L365 304L365.1 304.7L365.1 306.8L364.6 307.6L363.6 308.1L362.2 308.4L360.8 308.5L359.4 308.2L358.3 307.7L357.7 307L357.7 306.2Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M364.6 307.6L363.6 308.1L363.6 306L364.6 305.4ZM365.1 306.8L364.6 307.6L364.6 305.4L365.1 304.7Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M363.6 308.1L362.2 308.4L362.2 306.3L363.6 306ZM362.2 308.4L360.8 308.5L360.8 306.3L362.2 306.3Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M360.8 308.5L359.4 308.2L359.4 306.1L360.8 306.3Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M359.4 308.2L358.3 307.7L358.3 305.5L359.4 306.1ZM358.3 307.7L357.7 307L357.7 304.8L358.3 305.5ZM357.7 307L357.7 306.2L357.7 304.1L357.7 304.8Z\"/><path class=\"iso-top\" d=\"M364.6 305.4L363.6 306L362.2 306.3L360.8 306.3L359.4 306.1L358.3 305.5L357.7 304.8L357.7 304.1L358.2 303.3L359.2 302.8L360.5 302.5L362 302.4L363.4 302.7L364.4 303.2L365 304L365.1 304.7Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M365.1 304.7L364.6 305.4L363.6 306L362.2 306.3L360.8 306.3L359.4 306.1L358.3 305.5L357.7 304.8L357.7 304.1\"/><path class=\"iso-line iso-edge\" data-tone=\"hi\" d=\"M357.7 304.1L358.2 303.3L359.2 302.8L360.5 302.5L362 302.4L363.4 302.7L364.4 303.2L365 304L365.1 304.7M365.1 306.8L364.6 307.6L363.6 308.1L362.2 308.4L360.8 308.5L359.4 308.2L358.3 307.7L357.7 307L357.7 306.2M357.7 304.1L357.7 306.2M365.1 304.7L365.1 306.8\"/></g><g class=\"iso-dots\" data-tone=\"hi\"><circle data-part=\"led\" cx=\"361.4\" cy=\"304.4\" r=\"0.9\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M464.9 345.6L465.3 344.8L475.2 336.4L476.4 335.8L478 335.6L479.5 335.9L490.1 339.4L491.2 340L491.5 340.8L491.5 347.2L491.1 348L481.2 356.4L480 357L478.4 357.1L476.9 356.9L466.3 353.4L465.2 352.8L464.9 351.9Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M491.5 347.2L491.1 348L491.1 341.6L491.5 340.8ZM491.1 348L481.2 356.4L481.2 350L491.1 341.6ZM481.2 356.4L480 357L480 350.6L481.2 350Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M480 357L478.4 357.1L478.4 350.8L480 350.6Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M478.4 357.1L476.9 356.9L476.9 350.6L478.4 350.8Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M476.9 356.9L466.3 353.4L466.3 347.1L476.9 350.6ZM466.3 353.4L465.2 352.8L465.2 346.4L466.3 347.1ZM465.2 352.8L464.9 351.9L464.9 345.6L465.2 346.4Z\"/><path class=\"iso-top\" d=\"M490.1 339.4L491.2 340L491.5 340.8L491.1 341.6L481.2 350L480 350.6L478.4 350.8L476.9 350.6L466.3 347.1L465.2 346.4L464.9 345.6L465.3 344.8L475.2 336.4L476.4 335.8L478 335.6L479.5 335.9Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M491.5 340.8L491.1 341.6L481.2 350L480 350.6L478.4 350.8L476.9 350.6L466.3 347.1L465.2 346.4L464.9 345.6\"/><path class=\"iso-line iso-bevel\" data-tone=\"faint\" d=\"M491.5 340.8L490.2 341.4L480.4 349.7L479.5 350.2L478.4 350.3L477.3 350.1L466.9 346.7L466 346.2L464.9 345.6\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M464.9 345.6L465.3 344.8L475.2 336.4L476.4 335.8L478 335.6L479.5 335.9L490.1 339.4L491.2 340L491.5 340.8M491.5 347.2L491.1 348L481.2 356.4L480 357L478.4 357.1L476.9 356.9L466.3 353.4L465.2 352.8L464.9 351.9M491.5 340.8L491.5 347.2M464.9 345.6L464.9 351.9\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M446.1 309L446.5 308.3L457.1 299.4L458 298.9L459.3 298.8L460.5 299L465.5 300.6L466.4 301.1L466.7 301.8L466.7 315L466.3 315.6L455.8 324.6L454.8 325.1L453.6 325.2L452.3 325L447.3 323.3L446.4 322.8L446.1 322.2Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M466.7 315L466.3 315.6L466.3 302.4L466.7 301.8ZM466.3 315.6L455.8 324.6L455.8 311.4L466.3 302.4ZM455.8 324.6L454.8 325.1L454.8 311.9L455.8 311.4Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M454.8 325.1L453.6 325.2L453.6 312L454.8 311.9Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M453.6 325.2L452.3 325L452.3 311.8L453.6 312Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M452.3 325L447.3 323.3L447.3 310.1L452.3 311.8ZM447.3 323.3L446.4 322.8L446.4 309.6L447.3 310.1ZM446.4 322.8L446.1 322.2L446.1 309L446.4 309.6Z\"/><path class=\"iso-top\" d=\"M465.5 300.6L466.4 301.1L466.7 301.8L466.3 302.4L455.8 311.4L454.8 311.9L453.6 312L452.3 311.8L447.3 310.1L446.4 309.6L446.1 309L446.5 308.3L457.1 299.4L458 298.9L459.3 298.8L460.5 299Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M466.7 301.8L466.3 302.4L455.8 311.4L454.8 311.9L453.6 312L452.3 311.8L447.3 310.1L446.4 309.6L446.1 309\"/><path class=\"iso-line iso-bevel\" data-tone=\"faint\" d=\"M466.7 301.8L465.5 302.2L455 311.1L454.4 311.4L453.6 311.5L452.7 311.4L447.9 309.8L447.3 309.4L446.1 309\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M446.1 309L446.5 308.3L457.1 299.4L458 298.9L459.3 298.8L460.5 299L465.5 300.6L466.4 301.1L466.7 301.8M466.7 315L466.3 315.6L455.8 324.6L454.8 325.1L453.6 325.2L452.3 325L447.3 323.3L446.4 322.8L446.1 322.2M466.7 301.8L466.7 315M446.1 309L446.1 322.2\"/></g><g class=\"iso-wire\" data-tone=\"mid\"><path class=\"iso-line\" data-tone=\"mid\" d=\"M461 313.5L478.2 319.2L478.2 343.2\"/><circle class=\"iso-wire-end\" cx=\"461\" cy=\"313.5\" r=\"1\"/><circle class=\"iso-wire-end\" cx=\"478.2\" cy=\"343.2\" r=\"1\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M377.3 362.2L377.9 361.2L406.9 336.6L408.3 335.9L410.2 335.7L412.1 336L421.6 339.1L422.9 339.9L423.3 340.9L423.3 375.2L422.8 376.2L393.7 400.8L392.3 401.5L390.4 401.7L388.6 401.4L379.1 398.3L377.8 397.5L377.3 396.5Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M423.3 375.2L422.8 376.2L422.8 341.9L423.3 340.9ZM422.8 376.2L393.7 400.8L393.7 366.5L422.8 341.9ZM393.7 400.8L392.3 401.5L392.3 367.2L393.7 366.5Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M392.3 401.5L390.4 401.7L390.4 367.4L392.3 367.2Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M390.4 401.7L388.6 401.4L388.6 367.1L390.4 367.4Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M388.6 401.4L379.1 398.3L379.1 364L388.6 367.1ZM379.1 398.3L377.8 397.5L377.8 363.2L379.1 364ZM377.8 397.5L377.3 396.5L377.3 362.2L377.8 363.2Z\"/><path class=\"iso-top\" d=\"M421.6 339.1L422.9 339.9L423.3 340.9L422.8 341.9L393.7 366.5L392.3 367.2L390.4 367.4L388.6 367.1L379.1 364L377.8 363.2L377.3 362.2L377.9 361.2L406.9 336.6L408.3 335.9L410.2 335.7L412.1 336Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M423.3 340.9L422.8 341.9L393.7 366.5L392.3 367.2L390.4 367.4L388.6 367.1L379.1 364L377.8 363.2L377.3 362.2\"/><path class=\"iso-line iso-bevel\" data-tone=\"faint\" d=\"M423.3 340.9L421.6 341.6L392.8 366.1L391.7 366.6L390.5 366.8L389.1 366.5L379.9 363.5L378.9 362.9L377.3 362.2\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M377.3 362.2L377.9 361.2L406.9 336.6L408.3 335.9L410.2 335.7L412.1 336L421.6 339.1L422.9 339.9L423.3 340.9M423.3 375.2L422.8 376.2L393.7 400.8L392.3 401.5L390.4 401.7L388.6 401.4L379.1 398.3L377.8 397.5L377.3 396.5M423.3 340.9L423.3 375.2M377.3 362.2L377.3 396.5\"/></g><g class=\"iso-dots\" data-tone=\"mid\"><circle cx=\"411.9\" cy=\"341.8\" r=\"0.4\"/><circle cx=\"388.8\" cy=\"361.3\" r=\"0.4\"/></g><g class=\"iso-solid\"><path class=\"iso-fill\" d=\"M390.4 339.4L390.9 338.2L391.9 337.1L393.3 336.2L395 335.5L397 335L399.2 334.7L401.4 334.7L403.6 335L405.6 335.5L407.4 336.2L408.7 337.1L409.7 338.2L410.2 339.3L410.2 340.5L410.2 352.1L409.7 353.3L408.8 354.4L407.4 355.3L405.6 356L403.6 356.5L401.5 356.8L399.2 356.8L397.1 356.5L395 356L393.3 355.3L391.9 354.4L390.9 353.3L390.4 352.2L390.4 351Z\"/><path class=\"iso-shade\" data-shade=\"0\" d=\"M408.8 354.4L407.4 355.3L407.4 343.7L408.8 342.7ZM407.4 355.3L405.6 356L405.6 344.4L407.4 343.7ZM410.2 352.1L409.7 353.3L409.7 341.7L410.2 340.5ZM409.7 353.3L408.8 354.4L408.8 342.7L409.7 341.7Z\"/><path class=\"iso-shade\" data-shade=\"1\" d=\"M405.6 356L403.6 356.5L403.6 344.9L405.6 344.4ZM403.6 356.5L401.5 356.8L401.5 345.2L403.6 344.9ZM401.5 356.8L399.2 356.8L399.2 345.2L401.5 345.2Z\"/><path class=\"iso-shade\" data-shade=\"2\" d=\"M399.2 356.8L397.1 356.5L397.1 344.9L399.2 345.2ZM397.1 356.5L395 356L395 344.4L397.1 344.9Z\"/><path class=\"iso-shade\" data-shade=\"3\" d=\"M395 356L393.3 355.3L393.3 343.7L395 344.4ZM393.3 355.3L391.9 354.4L391.9 342.8L393.3 343.7ZM391.9 354.4L390.9 353.3L390.9 341.7L391.9 342.8ZM390.9 353.3L390.4 352.2L390.4 340.5L390.9 341.7ZM390.4 352.2L390.4 351L390.4 339.4L390.4 340.5Z\"/><path class=\"iso-top\" d=\"M408.8 342.7L407.4 343.7L405.6 344.4L403.6 344.9L401.5 345.2L399.2 345.2L397.1 344.9L395 344.4L393.3 343.7L391.9 342.8L390.9 341.7L390.4 340.5L390.4 339.4L390.9 338.2L391.9 337.1L393.3 336.2L395 335.5L397 335L399.2 334.7L401.4 334.7L403.6 335L405.6 335.5L407.4 336.2L408.7 337.1L409.7 338.2L410.2 339.3L410.2 340.5L409.7 341.7Z\"/><path class=\"iso-line iso-crease\" data-tone=\"faint\" d=\"M410.2 340.5L409.7 341.7L408.8 342.7L407.4 343.7L405.6 344.4L403.6 344.9L401.5 345.2L399.2 345.2L397.1 344.9L395 344.4L393.3 343.7L391.9 342.8L390.9 341.7L390.4 340.5L390.4 339.4\"/><path class=\"iso-line iso-edge\" data-tone=\"mid\" d=\"M390.4 339.4L390.9 338.2L391.9 337.1L393.3 336.2L395 335.5L397 335L399.2 334.7L401.4 334.7L403.6 335L405.6 335.5L407.4 336.2L408.7 337.1L409.7 338.2L410.2 339.3L410.2 340.5M410.2 352.1L409.7 353.3L408.8 354.4L407.4 355.3L405.6 356L403.6 356.5L401.5 356.8L399.2 356.8L397.1 356.5L395 356L393.3 355.3L391.9 354.4L390.9 353.3L390.4 352.2L390.4 351M390.4 339.4L390.4 351M410.2 340.5L410.2 352.1\"/></g><path class=\"iso-line\" data-tone=\"lo\" d=\"M408.8 354.4L408.8 342.7M407.5 355.2L407.5 343.6M405.9 355.9L405.9 344.3M404.1 356.5L404.1 344.8M402.1 356.8L402.1 345.1M400 356.8L400 345.2M397.9 356.7L397.9 345.1M396 356.3L396 344.7M394.2 355.7L394.2 344.1M392.7 354.9L392.7 343.3M391.5 354L391.5 342.4M390.7 353L390.7 341.4M409.7 353.4L409.7 341.7\"/></svg></div></div><figcaption class=\"iso-legend\"><span class=\"iso-keys\"><span class=\"iso-key\"><svg class=\"iso-swatch\" data-mark=\"lit\" viewBox=\"0 0 16 10\" aria-hidden=\"true\"><path d=\"M2 4.5 8 1.5 14 4.5 14 6 8 9 2 6Z\"/><path class=\"iso-swatch-crease\" d=\"M2 4.5 8 7.5 14 4.5\"/></svg>Tap pad while the fare is due; the receipt once it is paid</span></span></figcaption></figure>";
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

})();
