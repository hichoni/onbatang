// 계정 저장: 들여 쓰는 곳이 계정에 그림을 올리고 받는 길(sync)을 주면, 이 기기의 그림과 계정의 그림을 맞춘다.
// 그림은 늘 이 기기에 먼저 저장하고(빠르고 끊겨도 안전하다), 그다음 계정에 올린다. 미니캔은 서버를 직접 부르지 않는다.
//
// sync 는 이런 모양이다(모두 약속을 돌려준다).
//   pull()       → { records: [그림 기록], deleted: [{ id, at }] }   계정의 그림들과, 지운 그림의 이름표·지운 때(ms)
//   push(record) → 그 그림을 계정에 올린다(같은 이름표면 덮어쓴다)
//   drop(id)     → 그 그림을 계정에서 지운다
//   load(record) → (있으면) 이 기기에 적기 전에 그 기록을 완성한다(예: 계정에 따로 둔 사진을 받아 data 주소로 바꾼다)
// pull 이 주는 기록은 사진이 아직 없을 수 있으므로, 이 기기에 적기 직전에 load 를 거쳐 cleanRecord 로 정리한다.
import { cleanRecord, isDesignId } from './designs.js';

/** A host may keep imported local materials out of an existing account store.
 * This policy is runtime-only; it never rewrites the document/source schema. */
export function syncsRecord(sync, record) {
  if (typeof sync?.accepts !== 'function') return true;
  try { return sync.accepts(record) === true; } catch { return false; }
}

/**
 * 이 기기와 계정을 맞춘다. 더 늦게 고친 쪽이 이긴다.
 * - 계정에만 있거나 계정 쪽이 더 새것 → 이 기기에 적는다
 * - 이 기기에만 있거나 이 기기 쪽이 더 새것 → 계정에 올린다
 * - 다른 기기에서 지운 그림 → 그 뒤에 이 기기에서 고친 것이 아니면 이 기기에서도 지운다
 * store: { list(), put(record), remove(id) } (이 기기의 저장소). 돌려주는 것: { got, sent, removed } 개수.
 */
export async function mergeAccount(sync, store) {
  const pulled = await sync.pull();
  const local = await store.list();
  const localOnly = new Set(local.filter(r => !syncsRecord(sync, r)).map(r => r.id));
  const remote = (Array.isArray(pulled?.records) ? pulled.records : [])
    .filter((r) => r && isDesignId(r.id) && Number.isFinite(r.updatedAt) && !localOnly.has(r.id) && syncsRecord(sync, r));
  const deleted = new Map((Array.isArray(pulled?.deleted) ? pulled.deleted : [])
    .filter((d) => d && typeof d.id === 'string' && Number.isFinite(d.at)).map((d) => [d.id, d.at]));
  const mine = new Map(local.filter(r => syncsRecord(sync, r)).map((r) => [r.id, r]));
  const out = { got: 0, sent: 0, removed: 0 };
  for (const [id, at] of deleted) {
    const here = mine.get(id);
    if (here && here.updatedAt <= at && !remote.some((r) => r.id === id)) {
      await store.remove(id);
      mine.delete(id);
      out.removed++;
    }
  }
  const there = new Map(remote.map((r) => [r.id, r]));
  for (const r of remote) {
    const here = mine.get(r.id);
    if (!here || r.updatedAt > here.updatedAt) {
      const full = cleanRecord(sync.load ? await sync.load(r) : r);
      if (!full) continue;
      mine.set(r.id, await store.put(full));
      out.got++;
    }
  }
  for (const here of mine.values()) {
    const r = there.get(here.id);
    if (!r || here.updatedAt > r.updatedAt) {
      await sync.push(here);
      out.sent++;
    }
  }
  return out;
}

/**
 * 그림마다 올리기를 줄 세운다: 짧은 사이에 여러 번 저장하면 마지막 것만 올리고, 같은 그림을 두 번 겹쳐 올리지 않는다.
 * onDone(id, ok) 은 올리기가 끝날 때마다 불린다(실패하면 delay 뒤에 한 번 더 해 보고, 그래도 안 되면 다음 저장 때 다시 올린다).
 */
export function createPusher(sync, { delay = 1500, retry = 20000, onDone = () => {} } = {}) {
  const waiting = new Map();          // 이름표 → { record, timer }
  const running = new Map();          // 이름표 → 올리는 중인 약속
  async function send(id) {
    const job = waiting.get(id);
    if (!job) return;
    waiting.delete(id);
    await running.get(id);
    const go = (async () => {
      try {
        await sync.push(job.record);
        onDone(id, true);
      } catch (ex) {
        console.warn(ex);
        onDone(id, false);
        if (!waiting.has(id) && !job.retried) waiting.set(id, { record: job.record, retried: true, timer: setTimeout(() => send(id), retry) });
      }
    })();
    running.set(id, go);
    await go;
    if (running.get(id) === go) running.delete(id);
  }
  return {
    /** 그 그림을 곧 올린다(delay 안에 또 부르면 마지막 것만). */
    queue(record) {
      if (!syncsRecord(sync, record)) return;
      const old = waiting.get(record.id);
      if (old) clearTimeout(old.timer);
      waiting.set(record.id, { record, timer: setTimeout(() => send(record.id), delay) });
    },
    /** 기다리는 올리기를 바로 한다(꾸미는 화면을 나갈 때). */
    async flush(id) {
      const job = waiting.get(id);
      if (job) { clearTimeout(job.timer); await send(id); } else await running.get(id);
    },
    /** 지운 그림: 기다리던 올리기를 그만둔다(지운 뒤에 다시 올라가지 않게). */
    cancel(id) {
      const job = waiting.get(id);
      if (job) { clearTimeout(job.timer); waiting.delete(id); }
    },
    /** 아직 올리지 못한 그림이 있는가. */
    pending: () => waiting.size + running.size > 0,
  };
}
