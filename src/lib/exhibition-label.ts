type LabelOptions = { color?: string; background?: string; fontSize?: number; maxLines?: number; weight?: number };

/** Draw at one pixel density in both directions so the 3D sign never stretches its lettering. */
export function createExhibitionLabelCanvas(text: string, width: number, height: number, options: LabelOptions = {}) {
  const density = Math.min(256, 2048 / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * density));
  canvas.height = Math.max(1, Math.round(height * density));
  const context = canvas.getContext('2d');
  if (!context) return canvas;
  if (options.background) {
    context.fillStyle = options.background;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  const maxLines = options.maxLines ?? 1;
  const fontSize = Math.min((options.fontSize ?? 38) * density / 140, canvas.height * 0.72 / maxLines);
  context.font = `${options.weight ?? 700} ${fontSize}px "Noto Sans KR", "Malgun Gothic", sans-serif`;
  context.fillStyle = options.color ?? '#655643';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const availableWidth = canvas.width - Math.min(canvas.width * 0.08, 0.12 * density);
  const remaining = Array.from(text.replace(/\s+/g, ' ').trim());
  const lines: string[] = [];
  for (let row = 0; row < maxLines && remaining.length; row++) {
    let line = '';
    while (remaining.length && context.measureText(line + remaining[0]).width <= availableWidth) line += remaining.shift();
    if (row === maxLines - 1 && remaining.length) {
      const characters = Array.from(line.trimEnd());
      while (characters.length && context.measureText(characters.join('') + '…').width > availableWidth) characters.pop();
      line = characters.join('') + '…';
    }
    lines.push(line.trim());
  }
  lines.forEach((line, index) => context.fillText(line, canvas.width / 2, canvas.height / 2 + (index - (lines.length - 1) / 2) * fontSize * 1.2));
  return canvas;
}
