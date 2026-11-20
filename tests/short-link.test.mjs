// 링크 주소는 짧게: 고치기 링크 gbe.ai.kr/c/코드 · 보기 링크 gbe.ai.kr/p/코드 (GBE-AI Lab이 원래 페이지를 그대로 열어 준다. 예전 긴 주소도 계속 열린다).
import test from 'node:test';
import assert from 'node:assert/strict';
import { guestUrl, playUrl, linkUrl, LINK_ORIGIN } from '../app/copy-link.js';

test('copy links use the short GBE-AI Lab addresses and only a cleaned 12-letter code', () => {
  assert.equal(LINK_ORIGIN, 'https://gbe.ai.kr');
  assert.equal(guestUrl('ABCDEF123456'), 'https://gbe.ai.kr/c/abcdef123456');
  assert.equal(playUrl(' 0a1b2c3d4e5f '), 'https://gbe.ai.kr/p/0a1b2c3d4e5f');
  assert.equal(linkUrl('0a1b2c3d4e5f', 'view'), 'https://gbe.ai.kr/p/0a1b2c3d4e5f');
  assert.equal(linkUrl('0a1b2c3d4e5f', 'edit'), 'https://gbe.ai.kr/c/0a1b2c3d4e5f');
  for (const bad of ['../x', 'abc', 'abcdef12345g', '', null]) {
    assert.equal(guestUrl(bad), 'https://gbe.ai.kr/c/');
    assert.equal(playUrl(bad), 'https://gbe.ai.kr/p/');
  }
  assert.ok(guestUrl('abcdef123456').length <= 32);
});
