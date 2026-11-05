// 좁은 자리(휴대폰 세로 화면의 공유 링크 등)의 웹사이트는 컴퓨터 화면 너비로 그려 통째로 줄이고, 넓은 자리는 그대로 꽉 채운다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {fitWebFrame, WEB_DESKTOP, WEB_NARROW} from '../src/web-fit.js';

// 화면 없이 쓰는 작은 가짜 iframe · 자리
const fake = (width, height) => {
  const style = {props: {}, removeProperty(k) { delete this.props[k]; delete this[k === 'transform-origin' ? 'transformOrigin' : k]; }};
  const frame = {style, dataset: {}};
  frame.parentElement = {clientWidth: width, clientHeight: height};
  return frame;
};

test('a website in a narrow slot is drawn at desktop width and scaled down; a wide slot fills normally', () => {
  const narrow = fake(390, 219);
  fitWebFrame(narrow);
  const k = 390 / WEB_DESKTOP;
  assert.equal(narrow.style.width, `${WEB_DESKTOP}px`);
  assert.equal(narrow.style.height, `${Math.round(219 / k)}px`);
  assert.equal(narrow.style.transform, `scale(${k})`);
  assert.equal(narrow.style.transformOrigin, '0 0');
  assert.ok('scaled' in narrow.dataset);
  const wide = fake(WEB_NARROW + 200, 450);
  fitWebFrame(wide);
  assert.equal(wide.style.width, undefined);
  assert.equal(wide.style.transform, undefined);
  assert.ok(!('scaled' in wide.dataset));
  // 한 번 맞춘 iframe 은 다시 묶지 않는다
  fitWebFrame(narrow);
  assert.ok('fit' in narrow.dataset);
});
