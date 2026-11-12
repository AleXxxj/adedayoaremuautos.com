import type { Shape } from "@/lib/vin/features";

/**
 * A plain drawing of a car's body shape, for when Wikimedia has no photo of
 * the model: side views facing right, in the brand's greens, drawn from a
 * few points each and rounded here. The wheel arches are cut in the panel's
 * own color (.vc-shape-arch), so the drawing sits on that panel.
 */

type Pt = [number, number];
interface Drawing {
  body: Pt[];
  /** Extra body parts drawn the same way: a convertible's windshield frame and headrests. */
  parts?: Pt[][];
  glass: Pt[][];
  wheels: [number, number];
  /** Tire radius; an SUV's wheels are bigger. */
  r?: number;
}

const DRAWINGS: Record<Shape, Drawing> = {
  sedan: {
    body: [[24, 114], [18, 98], [22, 82], [40, 76], [96, 72], [128, 46], [194, 44], [238, 72], [286, 78], [302, 92], [300, 114]],
    glass: [
      [[106, 71], [132, 50], [160, 49], [160, 71]],
      [[166, 71], [166, 49], [192, 48], [226, 71]],
    ],
    wheels: [78, 246],
  },
  // Upright, with a high flat hood and room under it.
  suv: {
    body: [[18, 106], [14, 94], [16, 56], [24, 40], [40, 34], [186, 32], [222, 60], [290, 64], [306, 76], [304, 106]],
    glass: [
      [[32, 60], [40, 42], [94, 40], [94, 60]],
      [[100, 60], [100, 40], [148, 39], [148, 60]],
      [[154, 60], [154, 39], [182, 38], [212, 60]],
    ],
    wheels: [76, 252],
    r: 22,
  },
  pickup: {
    body: [[16, 106], [12, 94], [14, 70], [146, 70], [150, 44], [160, 34], [208, 34], [240, 60], [292, 66], [306, 80], [304, 106]],
    glass: [[[162, 60], [164, 42], [202, 41], [230, 60]]],
    wheels: [72, 254],
    r: 22,
  },
  // The tallest roof, running long, and a short sloping nose.
  van: {
    body: [[16, 114], [12, 100], [14, 38], [26, 26], [204, 24], [264, 62], [298, 70], [306, 88], [304, 114]],
    glass: [
      [[26, 56], [30, 36], [90, 34], [90, 56]],
      [[96, 56], [96, 34], [156, 34], [156, 56]],
      [[162, 56], [162, 34], [198, 34], [246, 60]],
    ],
    wheels: [72, 254],
  },
  hatchback: {
    body: [[34, 114], [28, 100], [30, 66], [46, 48], [66, 42], [176, 42], [220, 70], [270, 78], [286, 92], [284, 114]],
    glass: [
      [[44, 66], [56, 50], [112, 48], [112, 66]],
      [[118, 66], [118, 48], [170, 48], [208, 68]],
    ],
    wheels: [86, 234],
  },
  coupe: {
    body: [[22, 114], [16, 98], [22, 82], [44, 78], [100, 74], [138, 48], [186, 46], [236, 74], [290, 80], [304, 94], [302, 114]],
    glass: [[[112, 73], [140, 53], [180, 52], [222, 73]]],
    wheels: [80, 248],
  },
  convertible: {
    body: [[22, 114], [16, 98], [22, 82], [44, 78], [290, 80], [304, 94], [302, 114]],
    parts: [
      [[196, 80], [214, 54], [222, 54], [206, 80]],
      [[124, 80], [126, 62], [144, 62], [146, 80]],
    ],
    glass: [],
    wheels: [80, 248],
  },
  // Car height, with the roof carried to the back.
  wagon: {
    body: [[18, 114], [12, 100], [16, 74], [28, 58], [48, 52], [198, 50], [240, 76], [292, 82], [304, 96], [302, 114]],
    glass: [
      [[32, 74], [42, 58], [94, 56], [94, 74]],
      [[100, 74], [100, 56], [150, 56], [150, 74]],
      [[156, 74], [156, 56], [194, 56], [228, 76]],
    ],
    wheels: [76, 248],
  },
  car: {
    body: [[24, 114], [18, 98], [24, 80], [64, 74], [104, 46], [196, 44], [238, 72], [288, 78], [302, 92], [300, 114]],
    glass: [
      [[112, 72], [132, 51], [160, 50], [160, 72]],
      [[166, 72], [166, 50], [192, 49], [226, 72]],
    ],
    wheels: [78, 246],
  },
};

const n = (v: number) => (Math.round(v * 10) / 10).toString();

/** A closed path through the points with each corner rounded by up to `r`. */
function rounded(points: Pt[], r: number): string {
  const corner = (i: number) => {
    const p = points[i];
    const prev = points[(i - 1 + points.length) % points.length];
    const next = points[(i + 1) % points.length];
    const toward = (q: Pt): Pt => {
      const dx = q[0] - p[0];
      const dy = q[1] - p[1];
      const len = Math.hypot(dx, dy) || 1;
      const t = Math.min(r, len / 2) / len;
      return [p[0] + dx * t, p[1] + dy * t];
    };
    return { a: toward(prev), p, b: toward(next) };
  };
  const corners = points.map((_, i) => corner(i));
  const start = corners[0].a;
  let d = `M${n(start[0])} ${n(start[1])}`;
  for (const c of corners) d += ` L${n(c.a[0])} ${n(c.a[1])} Q${n(c.p[0])} ${n(c.p[1])} ${n(c.b[0])} ${n(c.b[1])}`;
  return `${d} Z`;
}

/** The top half of a circle: a wheel arch cut above the axle line. */
const arch = (cx: number, r: number) => `M${cx - r} 114 A${r} ${r} 0 0 1 ${cx + r} 114 Z`;

/** Paths built once, the same on the server and in the browser. */
const PATHS = Object.fromEntries(
  (Object.keys(DRAWINGS) as Shape[]).map((shape) => {
    const d = DRAWINGS[shape];
    return [
      shape,
      {
        body: [d.body, ...(d.parts ?? [])].map((pts) => rounded(pts, 10)),
        glass: d.glass.map((pts) => rounded(pts, 5)),
        wheels: d.wheels,
        r: d.r ?? 20,
      },
    ];
  }),
) as Record<Shape, { body: string[]; glass: string[]; wheels: [number, number]; r: number }>;

const NAMES: Record<Shape, string> = {
  sedan: "a sedan",
  suv: "an SUV",
  pickup: "a pickup truck",
  van: "a van",
  hatchback: "a hatchback",
  coupe: "a coupe",
  convertible: "a convertible",
  wagon: "a wagon",
  car: "a car",
};

export function CarShape({ shape }: { shape: Shape }) {
  const p = PATHS[shape] ?? PATHS.car;
  return (
    <svg className="vc-shape" viewBox="0 0 320 146" role="img" aria-label={`Drawing of ${NAMES[shape] ?? NAMES.car}`}>
      <ellipse className="vc-shape-shadow" cx="160" cy="135" rx="146" ry="6" />
      {p.body.map((d, i) => (
        <path key={`b${i}`} className="vc-shape-body" d={d} />
      ))}
      {p.glass.map((d, i) => (
        <path key={`g${i}`} className="vc-shape-glass" d={d} />
      ))}
      {p.wheels.map((cx) => (
        <g key={cx}>
          <path className="vc-shape-arch" d={arch(cx, p.r + 5)} />
          <circle className="vc-shape-tire" cx={cx} cy="114" r={p.r} />
          <circle className="vc-shape-hub" cx={cx} cy="114" r={p.r * 0.4} />
        </g>
      ))}
    </svg>
  );
}
