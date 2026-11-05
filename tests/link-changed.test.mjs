// 링크를 올린 뒤 자료가 바뀌었는지(app/copy-link.js linkSig · linkChanged · keepLinkSig).
import test from 'node:test';
import assert from 'node:assert/strict';
import { linkSig, linkChanged, keepLinkSig, linkSigOf, keepGuestLink, guestLink } from '../app/copy-link.js';

const deck = (title, at = 1000) => [{ id: 'd1', name: 'deck', updatedAt: at, uploads: [{ id: 'u1' }], slides: [{ id: 's1', items: [{ id: 'e1', t: 'text', text: title }] }] }];

test('the fingerprint follows the content, not when it was saved or the side uploads', () => {
  assert.equal(linkSig(deck('A', 1)), linkSig(deck('A', 2)));
  assert.equal(linkSig(deck('A')), linkSig(deck('A').map(({ uploads, ...r }) => r)));
  assert.notEqual(linkSig(deck('A')), linkSig(deck('B')));
  assert.match(linkSig(deck('A')), /^[0-9a-f]{16}[0-9a-z]+$/);
});

test('changed: by fingerprint when this browser sent it, else by edit time after the upload', () => {
  const sig = linkSig(deck('A'));
  assert.equal(linkChanged(deck('A', 99999), { sig }), false, 'same content saved again is not a change');
  assert.equal(linkChanged(deck('B', 1), { sig }), true, 'a file swapped in with an older date is still a change');
  assert.equal(linkChanged(deck('A', 5000), { sentAt: 1000 }), true);
  assert.equal(linkChanged(deck('A', 1500), { sentAt: 1000 }), false, 'within a second of the upload');
  assert.equal(linkChanged(deck('A', 5000), {}), false, 'nothing to compare with');
});

test('a 7-day link and a member link keep the fingerprint in this browser', () => {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  try {
    const link = { code: '0123456789ab', token: 'f'.repeat(64), expiresAt: new Date(Date.now() + 864e5).toISOString(), title: 't', sig: 'abc', sentAt: 42 };
    keepGuestLink('d1', link, 'view');
    assert.deepEqual({ sig: guestLink('d1', 'view').sig, sentAt: guestLink('d1', 'view').sentAt }, { sig: 'abc', sentAt: 42 });
    for (let i = 0; i < 105; i++) keepLinkSig(`c${i}`, `s${i}`, `t${i}`);
    assert.equal(linkSigOf('c0'), null, 'only the latest 100 are kept');
    assert.deepEqual(linkSigOf('c104'), { sig: 's104', at: 't104' });
  } finally { delete globalThis.localStorage; }
});
