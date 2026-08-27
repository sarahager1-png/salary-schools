// שתי גרסאות לאייקון, באותה שפה של שאר האייקונים ברשת:
// גרדיאנט סגול→טורקיז, צורה לבנה רכה במרכז, סמל בסגול הרשת.
export const PURPLE = '#4B2E83', TEAL = '#00B4CC';

const shekel = (x, y, size, fill) => `
  <text x="${x}" y="${y}" font-family="Heebo, Arial, sans-serif" font-size="${size}"
        font-weight="700" fill="${fill}" text-anchor="middle" dominant-baseline="central">₪</text>`;

// א — דיסק, במשפחה של אייקון התקציב, אבל הטבעת היא מחזור חודשי:
// שנים-עשר סימני חודש, אחד מהם מודגש.
export const discIcon = (S, pad = 0) => {
  const c = S / 2, r = (S / 2 - pad) * 0.44;
  const ticks = Array.from({ length: 12 }, (_, i) => {
    const a = (i * 30 - 90) * Math.PI / 180, rr = r * 1.42;
    const x1 = c + Math.cos(a) * rr, y1 = c + Math.sin(a) * rr;
    const x2 = c + Math.cos(a) * (rr + S * 0.028), y2 = c + Math.sin(a) * (rr + S * 0.028);
    const on = i === 0;
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${on ? '#7DE8F5' : 'rgba(255,255,255,.5)'}"
             stroke-width="${S * (on ? 0.018 : 0.011)}" stroke-linecap="round"/>`;
  }).join('');
  return `
  <circle cx="${c}" cy="${c}" r="${r * 1.42}" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="${S * 0.006}"/>
  ${ticks}
  <circle cx="${c}" cy="${c + S * 0.012}" r="${r}" fill="rgba(20,10,45,.18)"/>
  <circle cx="${c}" cy="${c}" r="${r}" fill="url(#disc)"/>
  ${shekel(c, c, r * 1.15, PURPLE)}`;
};

// ב — תלוש: כרטיס לבן מוטה קלות, שורות טורקיז וסכום בסגול.
export const slipIcon = (S, pad = 0) => {
  const w = (S - pad * 2) * 0.52, h = w * 1.24, x = (S - w) / 2, y = (S - h) / 2;
  const lines = [0, 1, 2].map(i => {
    const lw = [0.62, 0.46, 0.54][i];
    return `<rect x="${x + w * 0.14}" y="${y + h * (0.19 + i * 0.125)}" width="${w * lw}" height="${h * 0.052}"
             rx="${h * 0.026}" fill="${i === 0 ? PURPLE : TEAL}" opacity="${i === 0 ? .9 : .5}"/>`;
  }).join('');
  return `
  <g transform="rotate(-5 ${S / 2} ${S / 2})">
    <rect x="${x}" y="${y + S * 0.014}" width="${w}" height="${h}" rx="${w * 0.13}" fill="rgba(20,10,45,.2)"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${w * 0.13}" fill="url(#disc)"/>
    ${lines}
    <line x1="${x + w * 0.14}" y1="${y + h * 0.62}" x2="${x + w * 0.86}" y2="${y + h * 0.62}"
          stroke="${TEAL}" stroke-width="${h * 0.014}" opacity=".35"/>
    ${shekel(x + w / 2, y + h * 0.79, w * 0.42, PURPLE)}
  </g>`;
};

export const wrap = (S, inner, { round = true, bleed = false } = {}) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#5B3A9E"/><stop offset=".55" stop-color="#2E6FB7"/><stop offset="1" stop-color="${TEAL}"/>
    </linearGradient>
    <radialGradient id="disc" cx=".38" cy=".3" r=".85">
      <stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#F1EEF9"/>
    </radialGradient>
  </defs>
  <rect width="${S}" height="${S}" rx="${bleed ? 0 : (round ? S * 0.22 : 0)}" fill="url(#bg)"/>
  ${inner}
</svg>`;
