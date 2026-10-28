// 발표하며 목소리 녹음하기(PowerPoint 의 "슬라이드 쇼 녹화"처럼): 마이크 소리를 한 줄로 이어서 녹음하고, 장이 바뀐 때와
// 누를 때 나오는 요소를 누른 때를 함께 적는다. 다 녹음하면 { blob, visits } 를 돌려준다(장마다 파일의 어느 구간인지는 voiceSlides 가 정한다).
// 녹음은 이 기기의 브라우저 안에서만 한다(MediaRecorder). 서버로 보내지 않는다.

/** 이 브라우저의 녹음기가 만들 수 있는 소리 파일 종류(먼저 고르는 것부터). 없으면 ''(브라우저가 정한 것). */
export function voiceType(Recorder = globalThis.MediaRecorder) {
  for (const type of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/ogg;codecs=opus']) {
    try { if (Recorder?.isTypeSupported?.(type)) return type; } catch { /* 모르는 종류 */ }
  }
  return '';
}
export const canRecordVoice = () => typeof globalThis.MediaRecorder === 'function' && !!globalThis.navigator?.mediaDevices?.getUserMedia;

/** 아주 짧게 들렀다 지나간 장은 녹음으로 치지 않는다(ms). */
export const VOICE_LEAST_MS = 1000;
/**
 * 들른 기록 [{ index, start, end, steps }](ms. 녹음을 시작한 때부터) → 장마다의 녹음 구간 Map(index → { at(초), ms, steps(그 장이 시작한 때부터 ms) }).
 * 같은 장을 여러 번 들렀으면 마지막으로 VOICE_LEAST_MS 이상 머문 것을 쓴다(다시 돌아와 말한 것이 그 장의 녹음이다).
 */
export function voiceSlides(visits) {
  const out = new Map();
  for (const v of Array.isArray(visits) ? visits : []) {
    const ms = Math.round(v.end - v.start);
    if (!(ms >= VOICE_LEAST_MS) || !Number.isInteger(v.index) || v.index < 0) continue;
    const steps = (v.steps || []).map((t) => Math.round(t)).filter((t) => t >= 0 && t <= ms);
    out.set(v.index, { at: Math.round(v.start) / 1000, ms, ...(steps.length ? { steps } : {}) });
  }
  return out;
}

/**
 * 녹음을 시작한다(마이크를 쓰도록 브라우저가 묻는다). index: 지금 장.
 * 돌려주는 것: { changed(index) 장이 바뀌었다 · step() 누를 때 나오는 요소를 눌렀다 · here() 이 장에서 녹음한 시간(ms) · all() 전체(ms) ·
 *   stop() → { blob, type, seconds, visits }(약속) · cancel() 버리기 }
 * 마이크를 쓸 수 없으면 오류를 낸다(name: NotAllowedError · NotFoundError …).
 */
export async function startVoice({ index = 0, media = globalThis.navigator?.mediaDevices, Recorder = globalThis.MediaRecorder, now = () => performance.now() } = {}) {
  const stream = await media.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  const type = voiceType(Recorder);
  let recorder;
  try { recorder = new Recorder(stream, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: 64000 }); }
  catch (ex) { stream.getTracks().forEach((t) => t.stop()); throw ex; }
  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
  let t0 = 0;
  await new Promise((resolve, reject) => {
    recorder.onstart = () => { t0 = now(); resolve(); };
    recorder.onerror = (e) => reject(e.error || new Error('녹음을 시작하지 못했어요'));
    recorder.start(1000);         // 1초마다 조각을 받아 둔다(오래 녹음해도 한꺼번에 메모리를 쓰지 않게)
  });
  const visits = [];
  let visit = { index, start: 0, steps: [] };
  const at = () => now() - t0;
  const close = () => { if (visit) { visit.end = at(); visits.push(visit); visit = null; } };
  const release = () => stream.getTracks().forEach((t) => t.stop());
  let finished = false;
  return {
    changed(i) { if (finished) return; close(); visit = { index: i, start: at(), steps: [] }; },
    step() { if (!finished && visit) visit.steps.push(at() - visit.start); },
    here: () => (visit ? at() - visit.start : 0),
    all: () => at(),
    stop() {
      if (finished) return Promise.resolve(null);
      finished = true;
      close();
      return new Promise((resolve) => {
        recorder.onstop = () => {
          release();
          const blob = new Blob(chunks, { type: recorder.mimeType || type || 'audio/webm' });
          resolve({ blob, type: blob.type, seconds: at() / 1000, visits });
        };
        try { recorder.stop(); } catch { release(); resolve(null); }
      });
    },
    cancel() { finished = true; try { recorder.stop(); } catch { /* 이미 멈춤 */ } release(); },
  };
}
