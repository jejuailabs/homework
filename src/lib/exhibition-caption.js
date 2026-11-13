/**
 * Museum-style name card for the 3D galleries (space and ocean): a number badge, the title in bold and
 * the artist below (one line with the name when the title is the artist's name). The slide screen shows "n / N".
 * Textures and materials go into `generated` so the runtime disposes them with the room.
 */
export function createCaption(T, generated) {
  return caption;
  function caption(work, opts = {}) {
    const screen = !!opts.screen, canvas = document.createElement('canvas');
    canvas.width = screen ? 1100 : 760; canvas.height = screen ? 230 : 236;
    const ctx = canvas.getContext('2d'), W = canvas.width, H = canvas.height, r = 34;
    const round = (x, y, w, h, rad) => {ctx.beginPath(); ctx.moveTo(x + rad, y); ctx.arcTo(x + w, y, x + w, y + h, rad); ctx.arcTo(x + w, y + h, x, y + h, rad); ctx.arcTo(x, y + h, x, y, rad); ctx.arcTo(x, y, x + w, y, rad); ctx.closePath();};
    ctx.fillStyle = 'rgba(40,28,12,.18)'; round(10, 16, W - 16, H - 20, r); ctx.fill();
    ctx.fillStyle = screen ? '#1f2230' : '#fffaf1'; round(4, 4, W - 16, H - 20, r); ctx.fill();
    ctx.lineWidth = 6; ctx.strokeStyle = screen ? '#c8a46a' : '#d9c39b'; round(4, 4, W - 16, H - 20, r); ctx.stroke();
    const font = (weight, size) => `${weight} ${size}px "Malgun Gothic","Apple SD Gothic Neo",sans-serif`;
    const badgeText = screen ? `${work?.number || 1} / ${opts.total || 1}` : String(work?.number || '');
    ctx.font = font(800, screen ? 50 : 54);
    const badgeW = Math.max(screen ? 220 : 104, ctx.measureText(badgeText).width + 56), cy = (H - 16) / 2 + 4;
    ctx.fillStyle = screen ? '#c8a46a' : '#2d7375'; round(30, cy - 48, badgeW, 96, 48); ctx.fill();
    ctx.fillStyle = screen ? '#1f2230' : '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(badgeText, 30 + badgeW / 2, cy + 2);
    const title = String(work?.title || '').trim(), artist = String(work?.artist || '').trim();
    const left = 30 + badgeW + 34, max = W - left - 40;
    ctx.textAlign = 'left';
    const ink = screen ? '#fff6e4' : '#2f2a22', soft = screen ? '#e5cfa6' : '#6b5d48';
    if (artist && artist !== title) {
      ctx.fillStyle = ink; ctx.font = font(800, 60); ctx.fillText(title, left, cy - 36, max);
      ctx.fillStyle = soft; ctx.font = font(600, 46); ctx.fillText(artist, left, cy + 42, max);
    } else {
      ctx.fillStyle = ink; ctx.font = font(800, 66); ctx.fillText(title || artist, left, cy + 2, max);
    }
    const map = new T.CanvasTexture(canvas);
    map.colorSpace = T.SRGBColorSpace; map.anisotropy = 4; generated.add(map);
    const material = new T.MeshBasicMaterial({map, transparent: true, depthWrite: false, toneMapped: false});
    generated.add(material);
    return {material, aspect: W / H};
  }
}
