// 시작 모습 미리 적기(src/motion.js primedAnimate): 움직임이 늦게 얹히는 브라우저(WebKit)에서도 첫 화면에 시작 모습이 보이게.
import test from 'node:test';
import assert from 'node:assert/strict';
import { primedAnimate } from '../src/motion.js';

function fakeNode(inline = {}) {
  const props = new Map(Object.entries(inline).map(([k, v]) => [k, [v, '']]));
  const anims = [];
  return {
    anims,
    style: {
      getPropertyValue: (p) => props.get(p)?.[0] ?? '',
      getPropertyPriority: (p) => props.get(p)?.[1] ?? '',
      setProperty: (p, v, pr = '') => props.set(p, [String(v), pr]),
      removeProperty: (p) => props.delete(p),
    },
    animate(keyframes, opts) {
      let settle; const a = { keyframes, opts, finished: new Promise((r, j) => { settle = { r, j }; }), end: () => settle.r(), cancel: () => settle.j(Error('cancel')) };
      anims.push(a); return a;
    },
  };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

test('writes the first keyframe on the element and puts the old values back when the motion ends', async () => {
  const node = fakeNode({ transform: 'translate(-50%, -50%)' });
  const a = primedAnimate(node, [{ opacity: 0, transform: 'scale(0)', offset: 0 }, { opacity: 1, transform: 'none' }], { duration: 400, delay: 5000, fill: 'backwards' });
  assert.equal(node.style.getPropertyValue('opacity'), '0');
  assert.equal(node.style.getPropertyValue('transform'), 'scale(0)');
  assert.equal(node.style.getPropertyValue('offset'), '', 'keyframe timing keys are not styles');
  a.end(); await tick();
  assert.equal(node.style.getPropertyValue('opacity'), '');
  assert.equal(node.style.getPropertyValue('transform'), 'translate(-50%, -50%)');
});

test('two motions on one element: each property comes back when the last motion that wrote it lets go', async () => {
  const node = fakeNode();
  const turn = primedAnimate(node, [{ opacity: 0 }, { opacity: 1 }], { duration: 600, delay: 9000, fill: 'both' });
  const enter = primedAnimate(node, [{ clipPath: 'inset(0 100% 0 0)', opacity: 0.2 }, { clipPath: 'inset(0)', opacity: 1 }], { duration: 300, delay: 9000, fill: 'backwards' });
  turn.cancel(); await tick();
  assert.equal(node.style.getPropertyValue('opacity'), '0.2', 'still held by the entrance');
  assert.equal(node.style.getPropertyValue('clip-path'), 'inset(0 100% 0 0)');
  enter.end(); await tick();
  assert.equal(node.style.getPropertyValue('opacity'), '');
  assert.equal(node.style.getPropertyValue('clip-path'), '');
});

test('leaves the element alone without a backwards fill or under an important style', async () => {
  const plain = fakeNode();
  primedAnimate(plain, [{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
  assert.equal(plain.style.getPropertyValue('opacity'), '');
  const locked = fakeNode(); locked.style.setProperty('opacity', '0.5', 'important');
  primedAnimate(locked, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, fill: 'both' });
  assert.equal(locked.style.getPropertyValue('opacity'), '0.5');
});
