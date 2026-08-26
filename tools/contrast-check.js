const fs = require('fs');
const path = require('path');

const cssPath = path.resolve(__dirname, '..', 'themes', 'design-tokens.css');
if (!fs.existsSync(cssPath)) {
  console.error('design-tokens.css not found at', cssPath);
  process.exit(2);
}
const css = fs.readFileSync(cssPath, 'utf8');

function parseTokens(css) {
  const scopes = { light: {}, dark: {} };
  // extract dark block (simple approach)
  const darkStart = css.indexOf(':root[data-theme=\'dark\']');
  let darkBlock = '';
  if (darkStart !== -1) {
    // find first '{' after darkStart
    const braceIndex = css.indexOf('{', darkStart);
    if (braceIndex !== -1) {
      // find matching closing brace for that block (naive: find next '\n}\n' or next '}')
      let depth = 0;
      for (let i = braceIndex; i < css.length; i++) {
        if (css[i] === '{') depth++;
        if (css[i] === '}') {
          depth--;
          if (depth === 0) { darkBlock = css.slice(braceIndex + 1, i); break; }
        }
      }
    }
  }
  // light content is everything except the dark block
  let lightContent = css;
  if (darkBlock) {
    lightContent = css.replace(darkBlock, '');
  }

  const tokenRe = /--([a-z0-9-]+)\s*:\s*([^;]+);/ig;
  let m;
  while ((m = tokenRe.exec(lightContent)) !== null) {
    scopes.light[m[1]] = m[2].trim();
  }
  while ((m = tokenRe.exec(darkBlock)) !== null) {
    scopes.dark[m[1]] = m[2].trim();
  }
  return scopes;
}

function hexToRgb(hex) {
  hex = hex.replace(/\s/g,'');
  if (hex.startsWith('rgba')) {
    const m = hex.match(/rgba\(([^)]+)\)/);
    if (!m) return null;
    const parts = m[1].split(',').map(s=>parseFloat(s));
    return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] };
  }
  if (hex.startsWith('rgb')) {
    const m = hex.match(/rgb\(([^)]+)\)/);
    if (!m) return null;
    const parts = m[1].split(',').map(s=>parseFloat(s));
    return { r: parts[0], g: parts[1], b: parts[2], a: 1 };
  }
  if (hex[0] === '#') {
    let h = hex.slice(1);
    if (h.length === 3) h = h.split('').map(c=>c+c).join('');
    const bigint = parseInt(h, 16);
    return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255, a: 1 };
  }
  // rgba expressed as number, or var() fallback - not handled
  return null;
}

function luminance(rgb) {
  function chan(c) {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  return 0.2126 * chan(rgb.r) + 0.7152 * chan(rgb.g) + 0.0722 * chan(rgb.b);
}

function contrastRatio(aRgb, bRgb) {
  const L1 = luminance(aRgb);
  const L2 = luminance(bRgb);
  const light = Math.max(L1, L2);
  const dark = Math.min(L1, L2);
  return (light + 0.05) / (dark + 0.05);
}

const scopes = parseTokens(css);
const checks = [
  { name: 'text-primary on bg-surface', light:['text-primary','bg-surface'], dark:['text-primary','bg-surface'] },
  { name: 'text-primary on bg-base', light:['text-primary','bg-base'], dark:['text-primary','bg-base'] },
  { name: 'text-on-accent on accent', light:['text-on-accent','accent'], dark:['text-on-accent','accent'] },
  { name: 'text-secondary on bg-surface', light:['text-secondary','bg-surface'], dark:['text-secondary','bg-surface'] },
  { name: 'text-muted on bg-surface', light:['text-muted','bg-surface'], dark:['text-muted','bg-surface'] },
  { name: 'accent on bg-surface', light:['accent','bg-surface'], dark:['accent','bg-surface'] },
  { name: 'success on bg-surface', light:['success','bg-surface'], dark:['success','bg-surface'] },
  { name: 'danger on bg-surface', light:['danger','bg-surface'], dark:['danger','bg-surface'] }
];

function resolveVal(map, key) {
  if (!map[key]) return null;
  let v = map[key];
  // strip potential rgba spaces
  v = v.replace(/\s+/g,' ');
  return v;
}

function runChecks() {
  console.log('Contrast report — checks against WCAG AA (4.5:1)');
  console.log('Tokens file:', cssPath);
  console.log('');
  const results = [];
  ['light','dark'].forEach(scopeName => {
    console.log('---', scopeName.toUpperCase(), 'THEME ---');
    const map = scopes[scopeName];
    checks.forEach(ch => {
      const [tkText, tkBg] = scopeName === 'light' ? ch.light : ch.dark;
      const valText = resolveVal(map, tkText);
      const valBg = resolveVal(map, tkBg);
      const rgbText = valText ? hexToRgb(valText) : null;
      const rgbBg = valBg ? hexToRgb(valBg) : null;
      if (!rgbText || !rgbBg) {
        console.log(`${ch.name}: MISSING TOKENS (${tkText} / ${tkBg})`);
        results.push({scope:scopeName, name: ch.name, ok:false, note:'missing token'});
        return;
      }
      const ratio = contrastRatio(rgbText, rgbBg);
      const pass = ratio >= 4.5;
      console.log(`${ch.name}: ${ratio.toFixed(2)} — ${pass? 'PASS':'FAIL'}`);
      results.push({scope:scopeName, name: ch.name, ok:pass, ratio});
    });
    console.log('');
  });
  const fail = results.filter(r=>!r.ok);
  console.log('Summary: ', fail.length, 'failures');
  if (fail.length) {
    console.log('Failed checks:');
    fail.forEach(f=> console.log('-', f.scope, f.name, f.ratio? ('ratio:'+f.ratio.toFixed(2)) : ''));
    process.exitCode = 1;
  } else {
    console.log('All checks passed (AA) for the selected token pairs.');
  }
}

runChecks();
