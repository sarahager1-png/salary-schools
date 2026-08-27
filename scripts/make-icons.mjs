// מייצר את קובצי האייקון מה-SVG, דרך דפדפן אמיתי (אין תלות בכלי חיצוני).
//   node scripts/make-icons.mjs preview   → שתי הגרסאות ל-shots/ לבחירה
//   node scripts/make-icons.mjs disc|slip → הסט המלא ל-public/
import fs from 'node:fs';
import { chromium } from 'file:///C:/tmp/node_modules/playwright/index.mjs';
import { discIcon, slipIcon, wrap } from './icon-art.mjs';

const art = { disc: discIcon, slip: slipIcon };
const mode = process.argv[2] || 'preview';

const b = await chromium.launch();
const page = await (await b.newContext({ deviceScaleFactor: 1 })).newPage();
const shoot = async (svg, S, out) => {
  await page.setViewportSize({ width: S, height: S });
  await page.setContent(`<body style="margin:0">${svg}</body>`);
  await page.waitForTimeout(120);
  await page.screenshot({ path: out, omitBackground: true });
  console.log(`  ${out}`);
};

if (mode === 'preview') {
  fs.mkdirSync('shots', { recursive: true });
  for (const [k, fn] of Object.entries(art)) await shoot(wrap(512, fn(512)), 512, `shots/icon-${k}-512.png`);
} else {
  const fn = art[mode];
  if (!fn) { console.error('גרסה לא מוכרת: ' + mode); process.exit(1); }
  fs.mkdirSync('public', { recursive: true });
  for (const S of [192, 512, 1024]) await shoot(wrap(S, fn(S)), S, `public/icon-${S}.png`);
  await shoot(wrap(180, fn(180)), 180, 'public/apple-touch-icon.png');
  // maskable: אנדרואיד חותך לעיגול, ולכן רקע עד הקצה ותוכן מוקטן ל-60%
  for (const S of [192, 512]) {
    const inset = S * 0.2;
    const scaled = `<g transform="translate(${inset} ${inset}) scale(${(S - inset * 2) / S})">${fn(S)}</g>`;
    await shoot(wrap(S, scaled, { bleed: true }), S, `public/icon-${S}-maskable.png`);
  }
  await shoot(wrap(64, fn(64)), 64, 'public/favicon.png');
}
await b.close();
