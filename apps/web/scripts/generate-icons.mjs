#!/usr/bin/env node
/**
 * Génère les icônes de la PWA à partir du logo vectoriel public/logo.svg
 * (carré plein, fond bleu, sans coins arrondis : le système les arrondit).
 *
 *   npm run icons -w apps/web
 *
 * Sorties :
 *  - public/favicon.svg               : le logo, coins arrondis façon iOS
 *  - public/icons/apple-touch-icon.png (180) : iOS arrondit lui-même → carré plein, opaque
 *  - public/icons/icon-192.png / icon-512.png : purpose "any"
 *  - public/icons/icon-maskable-512.png       : purpose "maskable", personnage réduit à
 *    80 % et posé en bas pour que le visage reste dans la zone sûre (cercle de 80 %)
 *
 * Les PNG générés sont commités : le script ne tourne qu'au changement de logo.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const OUT = join(PUBLIC, 'icons');
const BG = '#0a84ff';

const logo = readFileSync(join(PUBLIC, 'logo.svg'), 'utf8');
const inner = logo.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/<title>.*?<\/title>/, '');

const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${body}</svg>`;

// Rayon des coins iOS ≈ 22,4 % du côté
const favicon = svg(
  `<defs><clipPath id="r"><rect width="512" height="512" rx="115"/></clipPath></defs><g clip-path="url(#r)">${inner}</g>`,
);
const maskable = svg(`<rect width="512" height="512" fill="${BG}"/><g transform="translate(51.2 102.4) scale(0.8)">${inner}</g>`);

function png(source, size) {
  return new Resvg(source, { fitTo: { mode: 'width', value: size }, background: BG }).render().asPng();
}

mkdirSync(OUT, { recursive: true });
writeFileSync(join(PUBLIC, 'favicon.svg'), favicon + '\n');
console.log('✓ favicon.svg');
for (const { file, size, source } of [
  { file: 'apple-touch-icon.png', size: 180, source: logo },
  { file: 'icon-192.png', size: 192, source: logo },
  { file: 'icon-512.png', size: 512, source: logo },
  { file: 'icon-maskable-512.png', size: 512, source: maskable },
]) {
  writeFileSync(join(OUT, file), png(source, size));
  console.log(`✓ ${file} (${size}×${size})`);
}
