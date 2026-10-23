// 들여쓰기 — png.pages 옵션(2026-10-23): cleanInit 이 'all' 만 받아들이고, done 이 모든 장을 보낸다. embed.js 는 pngs 를 넘긴다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const host = readFileSync(new URL('../app/embed-host.js', import.meta.url), 'utf8');
const caller = readFileSync(new URL('../app/embed.js', import.meta.url), 'utf8');
test('cleanInit 는 png.pages 를 first/all 로만 정리한다', () => {
  const fn = host.match(/export function cleanInit[\s\S]*?\n}\n/)[0];
  assert.match(fn, /raw\.png\?\.pages === 'all' \? 'all' : 'first'/);
});
test('done 은 pages 가 all 일 때 숨긴 장을 빼고 상한까지 모든 장을 pngs 로 보낸다', () => {
  assert.match(host, /export const EMBED_MAX_PAGES = 40/);
  assert.match(host, /if \(init\.pages === 'all'\)[\s\S]*slice\(1, EMBED_MAX_PAGES\)\.filter\(\(s\) => !s\.hidden\)/);
  assert.match(host, /send\('onba:save', \{ record, png: blob, \.\.\.extra \}\)/);
});
test('embed.js 는 pngs 를 그대로 넘기고 없으면 [png] 로 채운다', () => {
  assert.match(caller, /pngs: Array\.isArray\(data\.pngs\) \? data\.pngs : \[data\.png\]/);
});
