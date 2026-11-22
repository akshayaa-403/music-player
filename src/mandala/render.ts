import type { Prim } from './scene';

/** Draws scene primitives. `background` null leaves the canvas transparent. */
export function drawPrims(
  ctx: CanvasRenderingContext2D,
  prims: Prim[],
  width: number,
  height: number,
  background: string | null,
) {
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, width, height);
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
    // Soft vignette lift behind the mandala.
    const g = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.min(width, height) * 0.55);
    g.addColorStop(0, 'rgba(60, 50, 110, 0.22)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  for (const p of prims) {
    switch (p.type) {
      case 'path': {
        ctx.globalCompositeOperation = p.additive ? 'lighter' : 'source-over';
        ctx.globalAlpha = p.alpha;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.width;
        ctx.setLineDash(p.dash ?? []);
        ctx.beginPath();
        ctx.moveTo(p.pts[0], p.pts[1]);
        for (let i = 2; i < p.pts.length; i += 2) ctx.lineTo(p.pts[i], p.pts[i + 1]);
        if (p.closed) ctx.closePath();
        ctx.stroke();
        break;
      }
      case 'circle':
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = p.alpha;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.width;
        ctx.setLineDash(p.dash ?? []);
        ctx.beginPath();
        ctx.arc(p.cx, p.cy, p.r, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case 'line':
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = p.alpha;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.width;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(p.x1, p.y1);
        ctx.lineTo(p.x2, p.y2);
        ctx.stroke();
        break;
      case 'dot':
        ctx.globalCompositeOperation = p.additive ? 'lighter' : 'source-over';
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.cx, p.cy, p.r, 0, Math.PI * 2);
        ctx.fill();
        break;
    }
  }
  ctx.restore();
}
