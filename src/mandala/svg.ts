import { hslToHex } from './color';
import { FONT_STACK, type Prim } from './scene';

/** hsl()/hsla() to #rrggbb (opacity is carried separately), for editor compatibility. */
function toHex(color: string): string {
  const m = /^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%/.exec(color);
  return m ? hslToHex(+m[1], +m[2], +m[3]) : color;
}

const n = (v: number) => (Math.round(v * 100) / 100).toString();
const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function pathData(pts: Float64Array, closed: boolean): string {
  let d = `M${n(pts[0])} ${n(pts[1])}`;
  for (let i = 2; i < pts.length; i += 2) d += `L${n(pts[i])} ${n(pts[i + 1])}`;
  return closed ? `${d}Z` : d;
}

/**
 * Pure serializer: scene primitives to a standalone SVG string. Additive canvas
 * blending is approximated with `mix-blend-mode: screen`, which browsers and
 * most vector editors honour.
 */
export function primsToSvg(
  prims: Prim[],
  width: number,
  height: number,
  opts: { background: string | null; title: string; description: string },
): string {
  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<title>${esc(opts.title)}</title>`,
    `<desc>${esc(opts.description)}</desc>`,
  );
  if (opts.background) {
    out.push(
      '<defs><radialGradient id="vignette" cx="50%" cy="50%" r="55%">',
      '<stop offset="0" stop-color="rgb(60,50,110)" stop-opacity="0.22"/>',
      '<stop offset="1" stop-color="#000" stop-opacity="0"/>',
      '</radialGradient></defs>',
      `<rect width="100%" height="100%" fill="${esc(opts.background)}"/>`,
      '<rect width="100%" height="100%" fill="url(#vignette)"/>',
    );
  }
  out.push('<g fill="none" stroke-linecap="round" stroke-linejoin="round">');
  for (const p of prims) {
    const blend = 'additive' in p && p.additive ? ' style="mix-blend-mode:screen"' : '';
    const dash = 'dash' in p && p.dash?.length ? ` stroke-dasharray="${p.dash.map(n).join(' ')}"` : '';
    switch (p.type) {
      case 'path':
        out.push(
          `<path d="${pathData(p.pts, p.closed)}" stroke="${toHex(p.color)}" stroke-width="${n(p.width)}" stroke-opacity="${n(p.alpha)}"${dash}${blend}/>`,
        );
        break;
      case 'circle':
        out.push(
          `<circle cx="${n(p.cx)}" cy="${n(p.cy)}" r="${n(p.r)}" stroke="${toHex(p.color)}" stroke-width="${n(p.width)}" stroke-opacity="${n(p.alpha)}"${dash}/>`,
        );
        break;
      case 'line':
        out.push(
          `<line x1="${n(p.x1)}" y1="${n(p.y1)}" x2="${n(p.x2)}" y2="${n(p.y2)}" stroke="${toHex(p.color)}" stroke-width="${n(p.width)}" stroke-opacity="${n(p.alpha)}"/>`,
        );
        break;
      case 'dot':
        out.push(
          `<circle cx="${n(p.cx)}" cy="${n(p.cy)}" r="${n(p.r)}" fill="${toHex(p.color)}" fill-opacity="${n(p.alpha)}" stroke="none"${blend}/>`,
        );
        break;
      case 'rect':
        out.push(
          `<rect x="${n(p.x)}" y="${n(p.y)}" width="${n(p.w)}" height="${n(p.h)}"${p.radius ? ` rx="${n(p.radius)}"` : ''} fill="${toHex(p.color)}" fill-opacity="${n(p.alpha)}" stroke="none"/>`,
        );
        break;
      case 'text': {
        const anchor = p.align === 'left' ? 'start' : p.align === 'right' ? 'end' : 'middle';
        const base = p.baseline === 'top' ? 'text-before-edge' : p.baseline === 'bottom' ? 'text-after-edge' : 'central';
        out.push(
          `<text x="${n(p.x)}" y="${n(p.y)}" fill="${toHex(p.color)}" fill-opacity="${n(p.alpha)}" stroke="none" font-family="${esc(FONT_STACK[p.font ?? 'sans'])}" font-size="${n(p.size)}" font-weight="${p.weight ?? 400}" text-anchor="${anchor}" dominant-baseline="${base}">${esc(p.text)}</text>`,
        );
        break;
      }
    }
  }
  out.push('</g></svg>');
  return out.join('\n');
}
