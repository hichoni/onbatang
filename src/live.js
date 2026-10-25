// 움직이는 바탕(코드로 그리는 장면): 장의 바탕을 코드가 순간마다 그린다. 영상 생성 모델 · 서버 · 바깥 파일 · 인터넷 없이 이 기기에서만.
// 장마다 { live: { id } } 하나만 저장한다. 그림은 시간(t, 초)과 씨앗(장의 이름표)만으로 정해진다(같은 t 면 언제나 같은 그림, 앞 프레임을 기억하지 않는다).
// 그래서 꾸미기 판 · 발표 · 공유 링크에서는 움직이고, 영상 내보내기는 프레임마다 그 순간을 그려 넣고(video.js), 그림 · PDF · GIF 에는
// LIVE_STILL 초의 멈춘 모습이 들어간다. 바탕 위의 글 · 사진 · 움직임은 그대로다.
// 스타일마다 그릴 때의 규칙(한 장의 종이 · 투명한 겹 · 결정론)은 코드로 짠 영화 스타일 모음(Lemo-Opuscar)의 방식을 따랐다.
import { el } from './dom.js';

/** 그림 파일 · 작은 그림에 쓰는 순간(초): 다 피어나고 자리 잡은 모습. */
export const LIVE_STILL = 4;
const TAU = Math.PI * 2;
const GLYPHS = 'アイウエオカキクケコサシスセソタチツテト0123456789ABCDEF{}<>=+*';
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const ease = (x) => { const t = clamp(x); return t * t * (3 - 2 * t); };
const eo = (x) => 1 - (1 - clamp(x)) ** 3;
function mulberry(seed) { let s = seed | 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
/** 장의 이름표(글)에서 씨앗(정수)을 만든다. 같은 장이면 늘 같은 무늬, 장마다 조금씩 다른 무늬. */
export function liveSeed(id) { let h = 2166136261; for (const ch of String(id || 'onbatang')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

// 정해진 무늬(종이 결 · 칠판 얼룩 · 줄무늬)는 크기 · 씨앗마다 한 번만 그려 둔다.
const textures = new Map();
function texture(key, W, H, draw) {
  const k = `${key}|${W}x${H}`;
  if (textures.has(k)) { const v = textures.get(k); textures.delete(k); textures.set(k, v); return v; }
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  draw(c.getContext('2d'), W, H);
  textures.set(k, c);
  while (textures.size > 16) { const [old, v] = textures.entries().next().value; v.width = 0; textures.delete(old); }
  return c;
}
const vgrad = (ctx, H, stops) => { const g = ctx.createLinearGradient(0, 0, 0, H); stops.forEach(([at, c]) => g.addColorStop(at, c)); return g; };
function vignette(ctx, W, H, color, strength) {
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.55);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, color.replace('A', String(strength)));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

// ---------- 스타일 ----------
// paint(ctx, W, H, t, seed): 카드 크기 W × H 에 t 초의 모습을 그린다. 모든 길이는 카드 너비를 100 으로 본 u 로 잰다.
const STYLES = [
  {
    id: 'watercolor', name: '수채화 번짐', hint: '따뜻한 종이에 물감이 번지며 피어나요', bg: '#f5eddf',
    paint(ctx, W, H, t, seed) {
      const u = W / 100;
      ctx.drawImage(texture(`paper|${seed}`, W, H, (g, w, h) => {
        g.fillStyle = '#f5eddf'; g.fillRect(0, 0, w, h);
        const r = mulberry(seed);
        for (let i = 0; i < (w * h) / 900; i++) {
          g.strokeStyle = r() < 0.5 ? 'rgba(120,90,50,0.05)' : 'rgba(255,255,255,0.25)'; g.lineWidth = 0.6 + r();
          const x = r() * w, y = r() * h, a = r() * TAU, l = 2 + r() * 7;
          g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * l, y + Math.sin(a) * l * 0.4, x + Math.cos(a + 0.4) * l * 1.6, y + Math.sin(a + 0.4) * l); g.stroke();
        }
        vignette(g, w, h, 'rgba(120,90,50,A)', 0.12);
      }), 0, 0);
      const r = mulberry(seed ^ 0x9e37), hues = ['#e8a28c', '#9cc3d5', '#b4d3a3', '#f1c677', '#c7a6d6', '#8fb8c9', '#eab3a3'];
      ctx.save(); ctx.globalCompositeOperation = 'multiply';
      // 물감은 가장자리 쪽에 피운다(가운데의 글이 잘 읽히게).
      for (let i = 0; i < 7; i++) {
        const side = r(), along = r(), edge = 0.04 + r() * 0.12;
        const cx = (side < 0.5 ? (side < 0.25 ? edge : 1 - edge) : along) * W, cy = (side < 0.5 ? along : (side < 0.75 ? edge * 1.4 : 1 - edge * 1.4)) * H;
        const R = (10 + r() * 12) * u, hue = hues[i % hues.length], ph = r() * TAU;
        const grow = eo((t - i * 0.35) / 2.6), rad = R * grow * (1 + 0.035 * Math.sin(0.55 * t + ph));
        if (rad < 1) continue;
        const dx = Math.sin(0.12 * t + ph) * 1.6 * u, dy = Math.cos(0.1 * t + ph) * 1.1 * u;
        for (let p = 0; p < 3; p++) {
          const jx = (hash(i * 7 + p) - 0.5) * R * 0.18, jy = (hash(i * 13 + p) - 0.5) * R * 0.18;
          const g = ctx.createRadialGradient(cx + dx + jx, cy + dy + jy, rad * 0.1, cx + dx + jx, cy + dy + jy, rad);
          g.addColorStop(0, hue + '1c'); g.addColorStop(0.8, hue + '26'); g.addColorStop(0.96, hue + '3a'); g.addColorStop(1, hue + '00');
          ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx + dx + jx, cy + dy + jy, rad, rad * (0.78 + 0.1 * p), ph + p, 0, TAU); ctx.fill();
        }
      }
      ctx.restore();
    },
  },
  {
    id: 'chalk', name: '칠판', hint: '분필 가루가 날리고 낙서가 스스로 그려져요', bg: '#2e4a3d',
    paint(ctx, W, H, t, seed) {
      const u = W / 100;
      ctx.drawImage(texture(`board|${seed}`, W, H, (g, w, h) => {
        g.fillStyle = vgrad(g, h, [[0, '#33503f'], [1, '#27402f']]); g.fillRect(0, 0, w, h);
        const r = mulberry(seed);
        for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(255,255,255,${0.012 + r() * 0.02})`; g.beginPath(); g.ellipse(r() * w, r() * h, (8 + r() * 26) * w / 100, (3 + r() * 9) * w / 100, r() * TAU, 0, TAU); g.fill(); }
        for (let i = 0; i < (w * h) / 400; i++) { g.fillStyle = `rgba(255,255,255,${r() * 0.05})`; g.fillRect(r() * w, r() * h, 1, 1); }
        g.fillStyle = '#5b3d24'; g.fillRect(0, h - h * 0.025, w, h * 0.025);
        vignette(g, w, h, 'rgba(0,0,0,A)', 0.35);
      }), 0, 0);
      // 스스로 그려지는 분필 낙서(별 · 밑줄 · 화살표): 자국이 거칠게 갈라진다.
      const r = mulberry(seed ^ 0x51), chalkLine = (pts, prog, width) => {
        const n = Math.max(2, Math.floor(pts.length * clamp(prog)));
        for (let pass = 0; pass < 3; pass++) {
          ctx.strokeStyle = `rgba(245,242,232,${0.32 - pass * 0.08})`; ctx.lineWidth = width * (1 - pass * 0.25); ctx.setLineDash([width * (3 + pass), width * (0.6 + pass * 0.5)]);
          ctx.beginPath(); pts.slice(0, n).forEach(([x, y], k) => { const jx = (hash(k * 3 + pass) - 0.5) * width * 0.7, jy = (hash(k * 5 + pass) - 0.5) * width * 0.7; k ? ctx.lineTo(x + jx, y + jy) : ctx.moveTo(x + jx, y + jy); }); ctx.stroke();
        }
        ctx.setLineDash([]);
      };
      const star = (cx, cy, R) => Array.from({ length: 11 }, (_, k) => { const a = -Math.PI / 2 + (k * TAU * 2) / 5; return [cx + Math.cos(a) * R, cy + Math.sin(a) * R]; });
      chalkLine(star(W * (0.06 + r() * 0.05), H * 0.14, 3.2 * u), (t - 0.3) / 1.4, 0.45 * u);
      chalkLine(Array.from({ length: 30 }, (_, k) => [W * 0.6 + k * 1.1 * u, H * 0.9 + Math.sin(k * 0.5) * 0.4 * u]), (t - 1.2) / 1.6, 0.5 * u);
      chalkLine([[W * 0.88, H * 0.22], [W * 0.95, H * 0.3], [W * 0.88, H * 0.38], [W * 0.95, H * 0.3], [W * 0.8, H * 0.3]], (t - 2) / 1.2, 0.45 * u);
      // 날리는 분필 가루
      const d = mulberry(seed ^ 0x77);
      for (let i = 0; i < 70; i++) {
        const x = (d() * W + Math.sin(t * 0.3 + i) * 2 * u) % W, y = ((d() * H) - t * (0.6 + d()) * u + H * 10) % H, a = 0.08 + 0.18 * (0.5 + 0.5 * Math.sin(t * (0.7 + d()) + i));
        ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.beginPath(); ctx.arc(x, y, (0.08 + d() * 0.18) * u, 0, TAU); ctx.fill();
      }
    },
  },
  {
    id: 'blueprint', name: '청사진', hint: '모눈이 그려지고 제도 선이 천천히 돌아요', bg: '#1c4e86',
    paint(ctx, W, H, t, seed) {
      const u = W / 100;
      ctx.fillStyle = vgrad(ctx, H, [[0, '#1f5592'], [1, '#173f6f']]); ctx.fillRect(0, 0, W, H);
      const drift = (t * 0.35 * u) % (2.5 * u), grow = eo(t / 1.6);
      ctx.lineWidth = Math.max(1, 0.06 * u);
      for (let x = -drift; x < W; x += 2.5 * u) { ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H * grow); ctx.stroke(); }
      for (let y = -drift; y < H; y += 2.5 * u) { ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W * grow, y); ctx.stroke(); }
      ctx.lineWidth = Math.max(1, 0.12 * u);
      for (let x = -drift * 5 % (12.5 * u); x < W; x += 12.5 * u) { ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H * eo((t - 0.4) / 1.6)); ctx.stroke(); }
      const r = mulberry(seed);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = Math.max(1, 0.14 * u);
      for (let i = 0; i < 3; i++) {
        const cx = (i === 0 ? 0.12 : i === 1 ? 0.86 : 0.5 + (r() - 0.5) * 0.3) * W, cy = (i === 0 ? 0.82 : i === 1 ? 0.2 : 0.92) * H, R = (6 + r() * 8) * u, p = eo((t - 0.8 - i * 0.5) / 1.8);
        ctx.beginPath(); ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + TAU * p); ctx.stroke();
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * (0.15 + i * 0.05) * (i % 2 ? -1 : 1)); ctx.setLineDash([0.6 * u, 0.5 * u]);
        ctx.beginPath(); ctx.arc(0, 0, R * 1.35, 0, TAU * p); ctx.stroke(); ctx.setLineDash([]);
        for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(a) * R * 1.35, Math.sin(a) * R * 1.35); ctx.lineTo(Math.cos(a) * R * (k % 3 ? 1.45 : 1.6), Math.sin(a) * R * (k % 3 ? 1.45 : 1.6)); ctx.globalAlpha = p; ctx.stroke(); }
        ctx.globalAlpha = 1; ctx.restore();
        ctx.beginPath(); ctx.moveTo(cx - R * 0.3, cy); ctx.lineTo(cx + R * 0.3, cy); ctx.moveTo(cx, cy - R * 0.3); ctx.lineTo(cx, cy + R * 0.3); ctx.stroke();
      }
    },
  },
  {
    id: 'film', name: '옛날 영화', hint: '빛바랜 화면에 입자와 긁힌 자국이 깜빡여요', bg: '#e8dcc2',
    paint(ctx, W, H, t, seed) {
      const u = W / 100, frame = Math.floor(t * 24), r = mulberry(seed + frame * 7919);
      ctx.fillStyle = vgrad(ctx, H, [[0, '#efe4cb'], [1, '#e1d2b2']]); ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = `rgba(60,40,20,${0.03 + r() * 0.05})`; ctx.fillRect(0, 0, W, H);          // 깜빡임
      for (let i = 0; i < (W * H) / 2600; i++) { ctx.fillStyle = r() < 0.5 ? 'rgba(40,25,10,0.16)' : 'rgba(255,250,235,0.22)'; ctx.fillRect(r() * W, r() * H, 1 + r() * 1.2, 1 + r() * 1.2); }
      const scratches = Math.floor(r() * 3);
      for (let i = 0; i < scratches; i++) { const x = r() * W; ctx.strokeStyle = `rgba(50,30,15,${0.15 + r() * 0.25})`; ctx.lineWidth = Math.max(1, r() * 0.12 * u); ctx.beginPath(); ctx.moveTo(x, r() * H * 0.3); ctx.lineTo(x + (r() - 0.5) * u, H - r() * H * 0.3); ctx.stroke(); }
      if (r() < 0.3) { ctx.fillStyle = 'rgba(30,20,10,0.35)'; ctx.beginPath(); ctx.arc(r() * W, r() * H, (0.2 + r() * 0.5) * u, 0, TAU); ctx.fill(); }
      vignette(ctx, W, H, 'rgba(50,30,10,A)', 0.55 + 0.05 * Math.sin(t * 9));
    },
  },
  {
    id: 'stars', name: '밤하늘', hint: '별이 반짝이고 가끔 별똥별이 지나가요', bg: '#0c1431',
    paint(ctx, W, H, t, seed) {
      const u = W / 100;
      ctx.fillStyle = vgrad(ctx, H, [[0, '#070d24'], [0.7, '#141a45'], [1, '#2a1f4f']]); ctx.fillRect(0, 0, W, H);
      const r = mulberry(seed), count = Math.min(420, Math.round((W * H) / 5200));
      for (let i = 0; i < count; i++) {
        const far = r() < 0.6, x = (r() * W + (far ? t * 0.15 * u : t * 0.35 * u)) % W, y = r() * H * 0.95, size = (far ? 0.05 + r() * 0.08 : 0.1 + r() * 0.14) * u;
        const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * (0.8 + r() * 2.2) + r() * TAU));
        ctx.fillStyle = `rgba(255,250,235,${a})`; ctx.beginPath(); ctx.arc(x, y, size, 0, TAU); ctx.fill();
        if (!far && size > 0.2 * u) { ctx.strokeStyle = `rgba(255,250,235,${a * 0.35})`; ctx.lineWidth = Math.max(1, size * 0.25); ctx.beginPath(); ctx.moveTo(x - size * 4, y); ctx.lineTo(x + size * 4, y); ctx.moveTo(x, y - size * 4); ctx.lineTo(x, y + size * 4); ctx.stroke(); }
      }
      const cycle = Math.floor(t / 6), local = t - cycle * 6, s = mulberry(seed + cycle * 31);
      if (local < 1.1) {
        const p = local / 1.1, x0 = s() * W * 0.7, y0 = s() * H * 0.35, len = (18 + s() * 14) * u, x = x0 + len * p, y = y0 + len * 0.4 * p;
        const g = ctx.createLinearGradient(x - len * 0.3, y - len * 0.12, x, y); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, `rgba(255,255,255,${0.9 * (1 - p)})`);
        ctx.strokeStyle = g; ctx.lineWidth = Math.max(1, 0.18 * u); ctx.beginPath(); ctx.moveTo(x - len * 0.3, y - len * 0.12); ctx.lineTo(x, y); ctx.stroke();
      }
    },
  },
  {
    id: 'aurora', name: '오로라', hint: '빛의 띠가 밤하늘에 흘러가요', bg: '#071322',
    paint(ctx, W, H, t, seed) {
      const u = W / 100;
      ctx.fillStyle = vgrad(ctx, H, [[0, '#040b17'], [1, '#0b1f2e']]); ctx.fillRect(0, 0, W, H);
      const r = mulberry(seed);
      for (let i = 0; i < 90; i++) { ctx.fillStyle = `rgba(255,255,255,${0.2 + 0.3 * (0.5 + 0.5 * Math.sin(t * 1.3 + i))})`; ctx.fillRect(r() * W, r() * H * 0.6, Math.max(1, 0.1 * u), Math.max(1, 0.1 * u)); }
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const bands = [['80,255,180', 0.35, 0.9], ['60,200,255', 0.45, 0.7], ['170,110,255', 0.28, 0.5]];
      bands.forEach(([rgb, base, amp], b) => {
        const ph = r() * TAU, step = Math.max(2, W / 150), fade = ease(t / 2.5);
        for (let x = 0; x <= W; x += step) {
          const k = x / W, y = H * (base + 0.08 * Math.sin(k * 5 + t * 0.35 + ph) + 0.04 * Math.sin(k * 13 - t * 0.6 + ph * 2)), h = H * (0.18 + 0.1 * Math.sin(k * 7 + t * 0.5 + b)) * amp;
          const a = (0.05 + 0.05 * Math.sin(k * 20 + t * 1.5 + b)) * fade;
          const g = ctx.createLinearGradient(0, y - h, 0, y + h * 0.15);
          g.addColorStop(0, `rgba(${rgb},0)`); g.addColorStop(0.75, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
          ctx.fillStyle = g; ctx.fillRect(x, y - h, step + 0.5, h * 1.15);
        }
      });
      ctx.restore();
      ctx.fillStyle = '#05101a'; ctx.beginPath(); ctx.moveTo(0, H);
      for (let x = 0; x <= W; x += W / 40) ctx.lineTo(x, H * (0.9 + 0.04 * Math.sin(x / W * 9 + 1) + 0.02 * Math.sin(x / W * 23)));
      ctx.lineTo(W, H); ctx.fill();
    },
  },
  {
    id: 'waves', name: '물결', hint: '겹겹의 물결이 천천히 밀려와요', bg: '#e6f2f5',
    paint(ctx, W, H, t, seed) {
      const u = W / 100;
      ctx.fillStyle = vgrad(ctx, H, [[0, '#f4fafb'], [1, '#dcecf1']]); ctx.fillRect(0, 0, W, H);
      const sun = ctx.createRadialGradient(W * 0.82, H * 0.2, 0, W * 0.82, H * 0.2, 14 * u);
      sun.addColorStop(0, 'rgba(255,214,150,0.9)'); sun.addColorStop(0.4, 'rgba(255,214,150,0.35)'); sun.addColorStop(1, 'rgba(255,214,150,0)');
      ctx.fillStyle = sun; ctx.fillRect(0, 0, W, H);
      const colors = ['#bfe0ea', '#94cbdc', '#6aaecb', '#4b8fb5', '#2f6f99'], r = mulberry(seed);
      colors.forEach((c, i) => {
        const base = H * (0.5 + i * 0.1), amp = (1.4 + i * 0.5) * u, k = (2 + r() * 2) / W * TAU, sp = (0.4 + i * 0.12) * (i % 2 ? -1 : 1), ph = r() * TAU;
        ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(0, H);
        for (let x = 0; x <= W + 4; x += W / 80) ctx.lineTo(x, base + Math.sin(x * k + t * sp + ph) * amp + Math.sin(x * k * 2.3 - t * sp * 1.4) * amp * 0.35);
        ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
      });
      for (let i = 0; i < 18; i++) { const x = hash(seed + i) * W, y = H - ((t * (2 + hash(i) * 3) * u + hash(i * 3) * H) % (H * 0.5)); ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = Math.max(1, 0.1 * u); ctx.beginPath(); ctx.arc(x + Math.sin(t + i) * u, y, (0.3 + hash(i * 7) * 0.6) * u, 0, TAU); ctx.stroke(); }
    },
  },
  {
    id: 'terminal', name: '코드 비', hint: '초록 글자가 비처럼 흘러내려요', bg: '#05090b',
    paint(ctx, W, H, t, seed) {
      const u = W / 100, cell = Math.max(12, Math.round(1.9 * u)), cols = Math.min(56, Math.ceil(W / cell)), rows = Math.ceil(H / cell) + 16;
      ctx.fillStyle = '#05090b'; ctx.fillRect(0, 0, W, H);
      // 글자는 한 번만 그려 두고(초록 · 밝은 머리 두 줄) 옮겨 붙인다: 프레임마다 글자를 새로 쓰는 것보다 훨씬 빠르다.
      const atlas = texture(`glyphs|${cell}`, cell * GLYPHS.length, cell * 2, (g) => {
        g.font = `${Math.round(cell * 0.86)}px ui-monospace, "Cascadia Mono", Menlo, Consolas, monospace`; g.textAlign = 'center'; g.textBaseline = 'top';
        [...GLYPHS].forEach((ch, i) => { g.fillStyle = '#5affa0'; g.fillText(ch, i * cell + cell / 2, 1); g.fillStyle = '#e2ffec'; g.fillText(ch, i * cell + cell / 2, cell + 1); });
      });
      const step = W / cols;
      for (let c = 0; c < cols; c++) {
        const speed = 5 + hash(seed + c) * 9, head = ((t * speed + hash(c * 17 + seed) * rows) % rows) - 2, trail = 8 + Math.floor(hash(c * 31) * 10), x = c * step + (step - cell) / 2;
        for (let k = 0; k < trail; k++) {
          const row = Math.floor(head) - k; if (row < 0 || row * cell > H) continue;
          const gi = Math.floor(hash(c * 131 + row * 7 + Math.floor(t * 6 + c) * 0.37) * GLYPHS.length);
          ctx.globalAlpha = k === 0 ? 0.8 : 0.5 * (1 - k / trail);
          ctx.drawImage(atlas, gi * cell, k === 0 ? cell : 0, cell, cell, x, row * cell, cell, cell);
        }
      }
      ctx.globalAlpha = 1;
      ctx.drawImage(texture('scan', W, H, (g, w, h) => { g.fillStyle = 'rgba(0,0,0,0.22)'; for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1); vignette(g, w, h, 'rgba(0,0,0,A)', 0.6); }), 0, 0);
    },
  },
  {
    id: 'confetti', name: '축하 꽃가루', hint: '알록달록 꽃가루가 팔랑이며 내려와요', bg: '#fff7ec',
    paint(ctx, W, H, t, seed) {
      const u = W / 100;
      ctx.fillStyle = vgrad(ctx, H, [[0, '#fffaf2'], [1, '#fdeedd']]); ctx.fillRect(0, 0, W, H);
      const r = mulberry(seed), colors = ['#ff6b6b', '#ffd43b', '#51cf66', '#339af0', '#cc5de8', '#ff922b'];
      for (let i = 0; i < 130; i++) {
        const x0 = r() * W, v = (6 + r() * 9) * u, sway = (1 + r() * 3) * u, ph = r() * TAU, size = (0.6 + r() * 0.9) * u, color = colors[i % colors.length], round = r() < 0.3, spin = 1 + r() * 4;
        const y = ((t * v + r() * (H + 10 * u)) % (H + 10 * u)) - 5 * u, x = x0 + Math.sin(t * (0.8 + r()) + ph) * sway;
        ctx.save(); ctx.translate(x, y); ctx.rotate(t * spin * 0.5 + ph); ctx.scale(1, Math.cos(t * spin + ph)); ctx.fillStyle = color;
        if (round) { ctx.beginPath(); ctx.arc(0, 0, size * 0.45, 0, TAU); ctx.fill(); } else ctx.fillRect(-size / 2, -size * 0.25, size, size * 0.5);
        ctx.restore();
      }
    },
  },
  {
    id: 'snow', name: '눈 내리는 밤', hint: '포근한 눈송이가 깊이를 두고 내려요', bg: '#1d2b47',
    paint(ctx, W, H, t, seed) {
      const u = W / 100;
      ctx.fillStyle = vgrad(ctx, H, [[0, '#16233d'], [1, '#2d3f63']]); ctx.fillRect(0, 0, W, H);
      const glow = ctx.createRadialGradient(W * 0.2, H * 0.18, 0, W * 0.2, H * 0.18, 10 * u);
      glow.addColorStop(0, 'rgba(255,248,220,0.9)'); glow.addColorStop(0.25, 'rgba(255,248,220,0.4)'); glow.addColorStop(1, 'rgba(255,248,220,0)');
      ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
      const r = mulberry(seed);
      for (let layer = 0; layer < 3; layer++) {
        const n = [90, 60, 30][layer], size = [0.18, 0.32, 0.55][layer] * u, v = [2, 3.5, 6][layer] * u, a = [0.45, 0.7, 0.9][layer];
        for (let i = 0; i < n; i++) {
          const x = (r() * W + Math.sin(t * (0.4 + r() * 0.6) + i) * 2 * u + W) % W, y = ((t * v * (0.8 + r() * 0.4) + r() * H) % (H + 4 * u)) - 2 * u;
          ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.beginPath(); ctx.arc(x, y, size * (0.7 + r() * 0.6), 0, TAU); ctx.fill();
        }
      }
      ctx.fillStyle = '#e8eef7'; ctx.beginPath(); ctx.moveTo(0, H);
      for (let x = 0; x <= W; x += W / 30) ctx.lineTo(x, H * (0.93 + 0.025 * Math.sin(x / W * 7 + 2)));
      ctx.lineTo(W, H); ctx.fill();
    },
  },
  {
    id: 'paperhills', name: '종이 산', hint: '오려 붙인 종이 산과 구름이 천천히 흘러가요', bg: '#f3e8d6',
    paint(ctx, W, H, t, seed) {
      const u = W / 100;
      ctx.fillStyle = vgrad(ctx, H, [[0, '#f8efe0'], [1, '#f0e2cb']]); ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#f2a65a'; ctx.beginPath(); ctx.arc(W * 0.78, H * 0.26 + Math.sin(t * 0.3) * 0.6 * u, 6 * u, 0, TAU); ctx.fill();
      const r = mulberry(seed);
      for (let i = 0; i < 3; i++) { const x = ((r() * W + t * (1 + i * 0.6) * u) % (W + 30 * u)) - 15 * u, y = H * (0.12 + i * 0.09); ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); [[0, 0, 5], [4, -1.5, 4], [8, 0, 4.5], [4, 1.2, 4]].forEach(([dx, dy, rr]) => { ctx.moveTo(x + (dx + rr) * u, y + dy * u); ctx.arc(x + dx * u, y + dy * u, rr * u * 0.7, 0, TAU); }); ctx.fill(); }
      const layers = [['#c9d8a8', 0.62, 0.06], ['#9fbf8a', 0.7, 0.07], ['#6f9c74', 0.78, 0.06], ['#4c7a5e', 0.87, 0.05]];
      layers.forEach(([c, base, amp], i) => {
        const shift = t * (0.6 + i * 0.5) * u, ph = r() * TAU, path = (dy) => { ctx.beginPath(); ctx.moveTo(0, H); for (let x = 0; x <= W + 4; x += W / 60) { const k = (x + shift) / W; ctx.lineTo(x, H * (base + amp * Math.sin(k * (3 + i) + ph) + amp * 0.4 * Math.sin(k * (9 + i) + ph * 2)) + dy); } ctx.lineTo(W, H); ctx.closePath(); };
        path(-0.5 * u); ctx.fillStyle = 'rgba(60,40,20,0.12)'; ctx.fill();        // 종이 그림자
        path(0); ctx.fillStyle = c; ctx.fill();
      });
    },
  },
  {
    id: 'bokeh', name: '빛망울', hint: '따스한 빛망울이 둥실둥실 떠다녀요', bg: '#1b1424',
    paint(ctx, W, H, t, seed) {
      const u = W / 100;
      ctx.fillStyle = vgrad(ctx, H, [[0, '#211830'], [1, '#120d1a']]); ctx.fillRect(0, 0, W, H);
      const r = mulberry(seed), colors = ['255,190,120', '255,140,170', '170,150,255', '120,210,255', '255,230,150'];
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 34; i++) {
        const R = (2 + r() * 7) * u, x = (r() * W + Math.sin(t * (0.1 + r() * 0.2) + i) * 6 * u), y = (r() * H + Math.cos(t * (0.12 + r() * 0.2) + i * 2) * 4 * u), c = colors[i % colors.length], a = (0.12 + 0.12 * Math.sin(t * (0.5 + r()) + i)) * ease(t / 1.5 + 0.2);
        const g = ctx.createRadialGradient(x, y, 0, x, y, R); g.addColorStop(0, `rgba(${c},${a})`); g.addColorStop(0.75, `rgba(${c},${a * 0.8})`); g.addColorStop(1, `rgba(${c},0)`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.fill();
      }
      ctx.restore();
    },
  },
  {
    id: 'clouds', name: '맑은 하늘', hint: '뭉게구름이 흘러가고 새가 날아가요', bg: '#d6ecf8',
    paint(ctx, W, H, t, seed) {
      const u = W / 100;
      ctx.fillStyle = vgrad(ctx, H, [[0, '#7fc1ea'], [0.75, '#cbe7f7'], [1, '#e9f6fd']]); ctx.fillRect(0, 0, W, H);
      const r = mulberry(seed);
      const cloud = (x, y, k, a) => {
        ctx.fillStyle = `rgba(205,225,240,${a})`;
        ctx.beginPath(); [[0, 0.5, 5], [4.5, -1, 6], [9.5, 0.3, 5], [4.8, 1.8, 5.5]].forEach(([dx, dy, rr]) => { ctx.moveTo(x + (dx + rr) * k * u, y + (dy + 0.8) * k * u); ctx.arc(x + dx * k * u, y + (dy + 0.8) * k * u, rr * k * u, 0, TAU); }); ctx.fill();
        ctx.fillStyle = `rgba(255,255,255,${a})`;
        ctx.beginPath(); [[0, 0.5, 5], [4.5, -1, 6], [9.5, 0.3, 5], [4.8, 1.8, 5.5]].forEach(([dx, dy, rr]) => { ctx.moveTo(x + (dx + rr) * k * u, y + dy * k * u); ctx.arc(x + dx * k * u, y + dy * k * u, rr * k * u, 0, TAU); }); ctx.fill();
      };
      for (let i = 0; i < 8; i++) {
        const far = i < 4, k = far ? 0.45 + r() * 0.25 : 0.75 + r() * 0.45, v = (far ? 0.6 : 1.4) * u * (0.7 + r() * 0.6), span = W + 30 * u;
        const x = ((r() * span + t * v) % span) - 15 * u, y = (far ? 0.08 + r() * 0.3 : 0.12 + r() * 0.5) * H * (i % 2 ? 1 : 0.6);
        cloud(x, y, k, far ? 0.7 : 0.95);
      }
      for (let i = 0; i < 3; i++) {
        const span = W + 20 * u, x = ((r() * span + t * (3 + r() * 2) * u) % span) - 10 * u, y = H * (0.15 + r() * 0.3) + Math.sin(t * 0.7 + i) * 2 * u, flap = Math.sin(t * 6 + i * 2) * 0.6 * u, s = (0.8 + r() * 0.5) * u;
        ctx.strokeStyle = 'rgba(40,60,80,0.6)'; ctx.lineWidth = Math.max(1, 0.18 * u); ctx.beginPath(); ctx.moveTo(x - s, y - flap); ctx.quadraticCurveTo(x - s * 0.4, y - s * 0.2, x, y); ctx.quadraticCurveTo(x + s * 0.4, y - s * 0.2, x + s, y - flap); ctx.stroke();
      }
    },
  },
  {
    id: 'rain', name: '비 오는 창', hint: '창밖 불빛 위로 빗줄기와 물방울이 흘러요', bg: '#3b4859',
    paint(ctx, W, H, t, seed) {
      const u = W / 100;
      ctx.drawImage(texture(`window|${seed}`, W, H, (g, w, h) => {
        g.fillStyle = vgrad(g, h, [[0, '#2a3646'], [1, '#475769']]); g.fillRect(0, 0, w, h);
        const r = mulberry(seed), colors = ['255,200,120', '255,150,110', '160,200,255', '255,230,170'];
        for (let i = 0; i < 40; i++) {
          const x = r() * w, y = h * (0.45 + r() * 0.5), R = (1.5 + r() * 4) * w / 100, c = colors[i % colors.length];
          const gr = g.createRadialGradient(x, y, 0, x, y, R); gr.addColorStop(0, `rgba(${c},0.35)`); gr.addColorStop(1, `rgba(${c},0)`); g.fillStyle = gr; g.fillRect(x - R, y - R, R * 2, R * 2);
        }
      }), 0, 0);
      const r = mulberry(seed ^ 0x3a);
      ctx.strokeStyle = 'rgba(210,225,240,0.28)'; ctx.lineWidth = Math.max(1, 0.08 * u); ctx.beginPath();
      for (let i = 0; i < 150; i++) { const L = (2 + r() * 3) * u, x0 = r() * (W + 10 * u), v = (60 + r() * 40) * u, y = ((t * v + r() * H) % (H + L)) - L, x = x0 - y * 0.12; ctx.moveTo(x, y); ctx.lineTo(x - L * 0.12, y + L); }
      ctx.stroke();
      for (let i = 0; i < 36; i++) {
        const x = r() * W, period = 4 + r() * 6, phase = r() * period, local = (t + phase) % period, y0 = r() * H * 0.7, slide = local > period * 0.6 ? ((local - period * 0.6) / (period * 0.4)) ** 2 * H * 0.4 : 0, R = (0.25 + r() * 0.45) * u, y = y0 + slide;
        if (slide > 0) { ctx.strokeStyle = 'rgba(220,235,250,0.18)'; ctx.lineWidth = R * 0.8; ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y); ctx.stroke(); }
        ctx.fillStyle = 'rgba(220,235,250,0.35)'; ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.arc(x - R * 0.35, y - R * 0.35, R * 0.3, 0, TAU); ctx.fill();
      }
    },
  },
  {
    id: 'sakura', name: '벚꽃 비', hint: '분홍 꽃잎이 바람 따라 흩날려요', bg: '#fdeef2',
    paint(ctx, W, H, t, seed) {
      const u = W / 100;
      ctx.drawImage(texture(`sakura|${seed}`, W, H, (g, w, h) => {
        g.fillStyle = vgrad(g, h, [[0, '#fde3ea'], [1, '#fff6f8']]); g.fillRect(0, 0, w, h);
        const r = mulberry(seed);
        // 위 두 모서리에 벚나무 꽃 덩어리
        for (const side of [0, 1]) for (let i = 0; i < 26; i++) { const d = r() * w * 0.2, a = r() * Math.PI / 2, x = side ? w - Math.cos(a) * d : Math.cos(a) * d, y = Math.sin(a) * d * 0.55; g.fillStyle = `rgba(${240 + r() * 15},${165 + r() * 35},${185 + r() * 25},0.4)`; g.beginPath(); g.arc(x, y, (2 + r() * 5) * w / 100, 0, TAU); g.fill(); }
      }), 0, 0);
      const r = mulberry(seed ^ 0x51);
      for (let i = 0; i < 70; i++) {
        const v = (3 + r() * 4) * u, span = H + 6 * u, y = ((t * v + r() * span) % span) - 3 * u, x = (r() * W + t * (1 + r() * 2) * u + Math.sin(t * (0.6 + r()) + i) * 3 * u) % (W + 4 * u) - 2 * u, s = (0.5 + r() * 0.6) * u, rot = t * (0.6 + r() * 1.5) + i, flip = Math.cos(t * (1 + r() * 2) + i);
        ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(1, 0.4 + 0.6 * Math.abs(flip));
        ctx.fillStyle = i % 3 ? '#f6b3c6' : '#fbd0dc';
        ctx.beginPath(); ctx.moveTo(0, -s); ctx.bezierCurveTo(s * 0.9, -s * 0.8, s * 0.8, s * 0.6, 0, s); ctx.bezierCurveTo(-s * 0.8, s * 0.6, -s * 0.9, -s * 0.8, 0, -s); ctx.fill();
        ctx.restore();
      }
    },
  },
  {
    id: 'autumn', name: '가을 낙엽', hint: '빨갛고 노란 잎이 빙글빙글 떨어져요', bg: '#fbf0dd',
    paint(ctx, W, H, t, seed) {
      const u = W / 100;
      ctx.fillStyle = vgrad(ctx, H, [[0, '#fdf5e6'], [1, '#f6e2c2']]); ctx.fillRect(0, 0, W, H);
      const r = mulberry(seed), colors = ['#e2672f', '#f0a43a', '#c8442a', '#d9b23c', '#a8642e'];
      for (let i = 0; i < 42; i++) {
        const v = (4 + r() * 5) * u, span = H + 8 * u, y = ((t * v + r() * span) % span) - 4 * u, x = r() * W + Math.sin(t * (0.8 + r()) + i) * 4 * u, s = (0.9 + r() * 0.9) * u, rot = Math.sin(t * (1 + r()) + i) * 1.2 + i, c = colors[i % colors.length];
        ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(1, 0.5 + 0.5 * Math.abs(Math.cos(t * (1.2 + r()) + i)));
        ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(0, -s * 1.3); ctx.quadraticCurveTo(s * 1.1, -s * 0.3, 0, s); ctx.quadraticCurveTo(-s * 1.1, -s * 0.3, 0, -s * 1.3); ctx.fill();
        ctx.strokeStyle = 'rgba(80,40,10,0.45)'; ctx.lineWidth = Math.max(1, s * 0.08); ctx.beginPath(); ctx.moveTo(0, -s * 1.1); ctx.lineTo(0, s * 1.35); ctx.stroke();
        ctx.restore();
      }
    },
  },
  {
    id: 'underwater', name: '바닷속', hint: '빛줄기 아래 물고기와 거품이 노닐어요', bg: '#11577b',
    paint(ctx, W, H, t, seed) {
      const u = W / 100;
      ctx.fillStyle = vgrad(ctx, H, [[0, '#2a8bb8'], [0.6, '#145a82'], [1, '#0a3352']]); ctx.fillRect(0, 0, W, H);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 6; i++) {
        const x = W * (0.1 + i * 0.16) + Math.sin(t * 0.4 + i * 1.7) * 4 * u, w = (3 + (i % 3) * 2) * u, a = 0.05 + 0.03 * Math.sin(t * 0.8 + i);
        const g = ctx.createLinearGradient(0, 0, 0, H * 0.9); g.addColorStop(0, `rgba(200,240,255,${a})`); g.addColorStop(1, 'rgba(200,240,255,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - w * 0.3, 0); ctx.lineTo(x + w * 0.3, 0); ctx.lineTo(x + w * 2.2, H * 0.9); ctx.lineTo(x - w * 0.8, H * 0.9); ctx.fill();
      }
      ctx.restore();
      const r = mulberry(seed);
      for (let i = 0; i < 7; i++) {
        const x0 = (0.06 + i * 0.15 + r() * 0.05) * W, hgt = (12 + r() * 14) * u;
        ctx.strokeStyle = i % 2 ? '#2f7d5a' : '#3d9466'; ctx.lineWidth = (0.6 + r() * 0.5) * u; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x0, H);
        for (let k = 1; k <= 8; k++) ctx.lineTo(x0 + Math.sin(t * 0.9 + k * 0.6 + i) * k * 0.35 * u, H - (hgt * k) / 8);
        ctx.stroke();
      }
      for (let i = 0; i < 6; i++) {
        const dir = i % 2 ? 1 : -1, span = W + 20 * u, v = (3 + r() * 4) * u, x = dir > 0 ? ((r() * span + t * v) % span) - 10 * u : W + 10 * u - ((r() * span + t * v) % span), y = H * (0.25 + r() * 0.5) + Math.sin(t + i) * 1.5 * u, s = (1.2 + r() * 1.3) * u, wag = Math.sin(t * 8 + i) * 0.3;
        ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1); ctx.fillStyle = ['#ffb347', '#ff7f6e', '#ffd166', '#7fd1ff'][i % 4];
        ctx.beginPath(); ctx.ellipse(0, 0, s * 1.6, s * 0.8, 0, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-s * 1.4, 0); ctx.lineTo(-s * 2.5, -s * (0.8 + wag)); ctx.lineTo(-s * 2.5, s * (0.8 - wag)); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#1b2a33'; ctx.beginPath(); ctx.arc(s * 0.8, -s * 0.15, s * 0.14, 0, TAU); ctx.fill();
        ctx.restore();
      }
      for (let i = 0; i < 40; i++) { const x = r() * W + Math.sin(t * 2 + i) * 0.6 * u, y = H - ((t * (3 + r() * 5) * u + r() * H) % (H + 2 * u)), R = (0.2 + r() * 0.5) * u; ctx.strokeStyle = 'rgba(220,245,255,0.5)'; ctx.lineWidth = Math.max(1, 0.08 * u); ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.stroke(); }
    },
  },
  {
    id: 'fireflies', name: '반딧불이 숲', hint: '어두운 숲에서 반딧불이가 반짝이며 날아요', bg: '#0d1b17',
    paint(ctx, W, H, t, seed) {
      const u = W / 100;
      ctx.drawImage(texture(`forest|${seed}`, W, H, (g, w, h) => {
        g.fillStyle = vgrad(g, h, [[0, '#0b1a22'], [1, '#13281f']]); g.fillRect(0, 0, w, h);
        const r = mulberry(seed);
        [['#0f2219', 0.62], ['#0a1812', 0.74], ['#06100c', 0.86]].forEach(([c, base], layer) => {
          g.fillStyle = c;
          for (let i = 0; i < 14; i++) { const x = r() * w, th = h * (0.22 + r() * 0.25) * (1 - layer * 0.15), wd = w * (0.025 + r() * 0.03); g.beginPath(); g.moveTo(x - wd, h * base + th * 0.1); g.lineTo(x, h * base - th); g.lineTo(x + wd, h * base + th * 0.1); g.fill(); g.fillRect(x - wd * 0.12, h * base, wd * 0.24, h); }
          g.fillRect(0, h * base, w, h);
        });
      }), 0, 0);
      const r = mulberry(seed ^ 0x19);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 46; i++) {
        const x = r() * W + Math.sin(t * (0.2 + r() * 0.3) + i) * 6 * u + Math.sin(t * 0.9 + i * 3) * u, y = H * (0.3 + r() * 0.62) + Math.cos(t * (0.2 + r() * 0.3) + i * 2) * 4 * u;
        const a = Math.max(0, Math.sin(t * (0.8 + r() * 1.4) + r() * TAU)) ** 1.5, R = (1.4 + r() * 1.1) * u;
        if (a < 0.02) continue;
        const g = ctx.createRadialGradient(x, y, 0, x, y, R); g.addColorStop(0, `rgba(230,255,140,${0.9 * a})`); g.addColorStop(0.25, `rgba(200,255,100,${0.35 * a})`); g.addColorStop(1, 'rgba(200,255,100,0)');
        ctx.fillStyle = g; ctx.fillRect(x - R, y - R, R * 2, R * 2);
      }
      ctx.restore();
    },
  },
  {
    id: 'planets', name: '우주 행성', hint: '고리 행성이 돌고 작은 달이 궤도를 그려요', bg: '#0b0b22',
    paint(ctx, W, H, t, seed) {
      const u = W / 100;
      ctx.drawImage(texture(`space|${seed}`, W, H, (g, w, h) => {
        g.fillStyle = vgrad(g, h, [[0, '#06061a'], [1, '#141033']]); g.fillRect(0, 0, w, h);
        const r = mulberry(seed);
        for (let i = 0; i < 4; i++) { const x = r() * w, y = r() * h, R = (15 + r() * 20) * w / 100, c = ['90,60,160', '40,90,170', '150,60,130'][i % 3]; const gr = g.createRadialGradient(x, y, 0, x, y, R); gr.addColorStop(0, `rgba(${c},0.18)`); gr.addColorStop(1, `rgba(${c},0)`); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
        for (let i = 0; i < (w * h) / 4000; i++) { g.fillStyle = `rgba(255,255,255,${0.2 + r() * 0.6})`; g.fillRect(r() * w, r() * h, Math.max(1, r() * 2), Math.max(1, r() * 2)); }
      }), 0, 0);
      const px = W * 0.8, py = H * 0.72, R = 11 * u;
      const ring = (front) => { ctx.save(); ctx.translate(px, py); ctx.rotate(-0.35); ctx.strokeStyle = 'rgba(240,210,160,0.75)'; ctx.lineWidth = 1.4 * u; ctx.beginPath(); ctx.ellipse(0, 0, R * 1.9, R * 0.45, 0, front ? 0 : Math.PI, front ? Math.PI : TAU); ctx.stroke(); ctx.strokeStyle = 'rgba(240,210,160,0.35)'; ctx.lineWidth = 0.6 * u; ctx.beginPath(); ctx.ellipse(0, 0, R * 2.2, R * 0.55, 0, front ? 0 : Math.PI, front ? Math.PI : TAU); ctx.stroke(); ctx.restore(); };
      ring(false);
      const pg = ctx.createRadialGradient(px - R * 0.4, py - R * 0.4, R * 0.1, px, py, R); pg.addColorStop(0, '#f4c98a'); pg.addColorStop(0.7, '#c97f4a'); pg.addColorStop(1, '#6b3a26');
      ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(px, py, R, 0, TAU); ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.arc(px, py, R, 0, TAU); ctx.clip(); ctx.strokeStyle = 'rgba(120,60,30,0.25)'; ctx.lineWidth = 0.8 * u;
      for (let k = -3; k <= 3; k++) { const off = ((t * 0.8 * u + k * 3.2 * u) % (R * 2)) - R; ctx.beginPath(); ctx.moveTo(px - R, py + k * 2.6 * u); ctx.quadraticCurveTo(px + off * 0.2, py + k * 2.6 * u + 0.8 * u, px + R, py + k * 2.6 * u); ctx.stroke(); }
      ctx.restore();
      ring(true);
      const a = t * 0.45, mx = px + Math.cos(a) * R * 2.8, my = py + Math.sin(a) * R * 0.9, behind = Math.sin(a) < 0;
      if (!behind || Math.hypot(mx - px, my - py) > R) { ctx.fillStyle = '#d8dde6'; ctx.beginPath(); ctx.arc(mx, my, 1.6 * u, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(mx + 0.5 * u, my + 0.3 * u, 1.4 * u, 0, TAU); ctx.fill(); }
      const bx = W * 0.14, by = H * 0.22, br = 3.5 * u, bg = ctx.createRadialGradient(bx - br * 0.4, by - br * 0.4, 0, bx, by, br); bg.addColorStop(0, '#9fd7ff'); bg.addColorStop(1, '#2b5d9c');
      ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(bx + Math.sin(t * 0.2) * u, by, br, 0, TAU); ctx.fill();
    },
  },
  {
    id: 'fireworks', name: '불꽃놀이', hint: '밤하늘에 불꽃이 터지고 반짝이며 사라져요', bg: '#0b0d24',
    paint(ctx, W, H, t, seed) {
      const u = W / 100;
      ctx.drawImage(texture(`city|${seed}`, W, H, (g, w, h) => {
        g.fillStyle = vgrad(g, h, [[0, '#05071a'], [1, '#1b1840']]); g.fillRect(0, 0, w, h);
        const r = mulberry(seed);
        g.fillStyle = '#080a18'; let x = 0;
        while (x < w) { const bw = (3 + r() * 6) * w / 100, bh = h * (0.08 + r() * 0.16); g.fillRect(x, h - bh, bw, bh); for (let k = 0; k < 6; k++) { if (r() < 0.5) { g.fillStyle = 'rgba(255,220,140,0.6)'; g.fillRect(x + r() * bw * 0.8, h - bh + r() * bh * 0.8, w / 400 + 1, w / 400 + 1); g.fillStyle = '#080a18'; } } x += bw + r() * w / 100; }
      }), 0, 0);
      const colors = ['255,120,120', '255,210,110', '140,220,255', '190,150,255', '140,255,170', '255,160,220'];
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let lane = 0; lane < 4; lane++) {
        const period = 2.6 + lane * 0.45, cycle = Math.floor((t + lane * 0.9) / period), local = (t + lane * 0.9) - cycle * period, s = mulberry(seed + lane * 977 + cycle * 131);
        const cx = W * (0.12 + s() * 0.76), cy = H * (0.15 + s() * 0.35), c = colors[Math.floor(s() * colors.length)], n = 36, speed = (14 + s() * 10) * u, rise = 0.7;
        if (local < rise) { const p = local / rise, y = H - (H - cy) * eo(p); ctx.strokeStyle = `rgba(${c},0.8)`; ctx.lineWidth = Math.max(1, 0.15 * u); ctx.beginPath(); ctx.moveTo(cx, y + 2 * u); ctx.lineTo(cx, y); ctx.stroke(); continue; }
        const tau = local - rise, fade = clamp(1 - tau / 1.6);
        if (fade <= 0) continue;
        for (let k = 0; k < n; k++) {
          const a = (k / n) * TAU + s() * 0.2, sp = speed * (0.7 + s() * 0.3), x = cx + Math.cos(a) * sp * eo(tau / 1.2), y = cy + Math.sin(a) * sp * eo(tau / 1.2) + 4 * u * tau * tau;
          ctx.strokeStyle = `rgba(${c},${0.55 * fade})`; ctx.lineWidth = Math.max(1, 0.14 * u); ctx.beginPath(); ctx.moveTo(cx + (x - cx) * 0.75, cy + (y - cy) * 0.75); ctx.lineTo(x, y); ctx.stroke();
          ctx.fillStyle = `rgba(${c},${fade})`; ctx.beginPath(); ctx.arc(x, y, Math.max(1, 0.2 * u), 0, TAU); ctx.fill();
        }
      }
      ctx.restore();
    },
  },
  {
    id: 'balloons', name: '풍선', hint: '알록달록 풍선이 둥실 떠올라요', bg: '#e8f5fe',
    paint(ctx, W, H, t, seed) {
      const u = W / 100;
      ctx.fillStyle = vgrad(ctx, H, [[0, '#cfe9fb'], [1, '#f4fbff']]); ctx.fillRect(0, 0, W, H);
      const r = mulberry(seed), colors = ['#ff6b6b', '#ffd43b', '#4dabf7', '#69db7c', '#da77f2', '#ff922b'];
      for (let i = 0; i < 16; i++) {
        const R = (2.2 + r() * 1.6) * u, span = H + R * 6, v = (3 + r() * 3) * u, y = H + R * 2 - ((t * v + r() * span) % span), x = r() * W + Math.sin(t * (0.5 + r() * 0.5) + i) * 2 * u, c = colors[i % colors.length];
        ctx.strokeStyle = 'rgba(90,90,110,0.5)'; ctx.lineWidth = Math.max(1, 0.08 * u); ctx.beginPath(); ctx.moveTo(x, y + R * 1.2);
        ctx.bezierCurveTo(x + Math.sin(t * 2 + i) * u, y + R * 2, x - Math.sin(t * 2 + i) * u, y + R * 3, x + Math.sin(t * 1.5 + i) * 0.5 * u, y + R * 4); ctx.stroke();
        ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(x, y, R, R * 1.2, Math.sin(t + i) * 0.08, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x - R * 0.18, y + R * 1.3); ctx.lineTo(x + R * 0.18, y + R * 1.3); ctx.lineTo(x, y + R * 1.12); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.ellipse(x - R * 0.35, y - R * 0.45, R * 0.22, R * 0.38, -0.5, 0, TAU); ctx.fill();
      }
    },
  },
  {
    id: 'notebook', name: '공책 낙서', hint: '줄 공책에 연필 낙서가 스스로 그려지고 종이비행기가 날아요', bg: '#fdfcf5',
    paint(ctx, W, H, t, seed) {
      const u = W / 100;
      ctx.drawImage(texture(`notebook|${seed}`, W, H, (g, w, h) => {
        g.fillStyle = '#fdfcf5'; g.fillRect(0, 0, w, h);
        const uu = w / 100; g.strokeStyle = 'rgba(110,160,210,0.35)'; g.lineWidth = Math.max(1, 0.1 * uu);
        for (let y = 9 * uu; y < h; y += 4 * uu) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
        g.strokeStyle = 'rgba(220,90,90,0.5)'; g.beginPath(); g.moveTo(8 * uu, 0); g.lineTo(8 * uu, h); g.stroke();
        g.fillStyle = 'rgba(0,0,0,0.06)'; for (const y of [0.2, 0.5, 0.8]) { g.beginPath(); g.arc(3.5 * uu, h * y, 1.1 * uu, 0, TAU); g.fill(); }
      }), 0, 0);
      const pencil = (pts, prog) => {
        const n = Math.max(2, Math.floor(pts.length * clamp(prog)));
        ctx.strokeStyle = 'rgba(60,60,70,0.55)'; ctx.lineWidth = Math.max(1, 0.18 * u); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); pts.slice(0, n).forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
      };
      const spiral = Array.from({ length: 60 }, (_, k) => { const a = k * 0.35, rr = 0.3 * u + k * 0.06 * u; return [W * 0.9 + Math.cos(a) * rr, H * 0.16 + Math.sin(a) * rr]; });
      const sun = [...Array.from({ length: 30 }, (_, k) => { const a = (k / 29) * TAU; return [W * 0.13 + Math.cos(a) * 2.4 * u, H * 0.18 + Math.sin(a) * 2.4 * u]; })];
      const star = Array.from({ length: 11 }, (_, k) => { const a = -Math.PI / 2 + (k * TAU * 2) / 5; return [W * 0.88 + Math.cos(a) * 2.6 * u, H * 0.82 + Math.sin(a) * 2.6 * u]; });
      const squiggle = Array.from({ length: 40 }, (_, k) => [W * 0.14 + k * 0.6 * u, H * 0.88 + Math.sin(k * 0.8) * 0.8 * u]);
      pencil(spiral, (t - 0.2) / 1.6); pencil(sun, (t - 0.8) / 1); pencil(star, (t - 1.5) / 1.1); pencil(squiggle, (t - 2.2) / 1.2);
      if (t > 1.8) for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU, p = clamp((t - 1.8 - k * 0.08) / 0.3); if (p <= 0) continue; ctx.beginPath(); ctx.moveTo(W * 0.13 + Math.cos(a) * 3.2 * u, H * 0.18 + Math.sin(a) * 3.2 * u); ctx.lineTo(W * 0.13 + Math.cos(a) * (3.2 + 1.4 * p) * u, H * 0.18 + Math.sin(a) * (3.2 + 1.4 * p) * u); ctx.stroke(); }
      const cycle = 9, local = (t % cycle) / 3.5;
      if (local < 1) {
        const x = -5 * u + (W + 10 * u) * local, y = H * 0.32 + Math.sin(local * 5) * 4 * u - local * 6 * u, ang = Math.cos(local * 5) * 0.25 - 0.15;
        ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.fillStyle = '#ffffff'; ctx.strokeStyle = 'rgba(60,60,70,0.6)'; ctx.lineWidth = Math.max(1, 0.12 * u);
        ctx.beginPath(); ctx.moveTo(2.6 * u, 0); ctx.lineTo(-2 * u, -1.2 * u); ctx.lineTo(-1.2 * u, 0); ctx.lineTo(-2 * u, 1.2 * u); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(2.6 * u, 0); ctx.lineTo(-1.2 * u, 0); ctx.stroke(); ctx.restore();
      }
    },
  },
  {
    id: 'synthwave', name: '레트로 노을', hint: '줄무늬 해와 빛나는 격자 길이 다가와요', bg: '#2a1150',
    paint(ctx, W, H, t, seed) {
      const u = W / 100, hz = H * 0.62;
      ctx.fillStyle = vgrad(ctx, hz, [[0, '#1a0b3d'], [0.6, '#5b1f75'], [1, '#e2508a']]); ctx.fillRect(0, 0, W, hz);
      const sx = W / 2, sy = hz - 1 * u, sr = 15 * u, sg = ctx.createLinearGradient(0, sy - sr, 0, sy + sr); sg.addColorStop(0, '#ffe46b'); sg.addColorStop(1, '#ff5ea0');
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, hz); ctx.clip(); ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sx, sy, sr, 0, TAU); ctx.fill();
      ctx.fillStyle = '#3a1460';
      // 해의 아래쪽 절반에 위로 올라가는 띠(아래로 갈수록 굵다)
      for (let k = 0; k < 6; k++) { const p = ((k / 6 + t * 0.08) % 1), y = sy - sr * 0.62 * (1 - p), hgt = 0.2 * u + p * 1.3 * u; ctx.fillRect(sx - sr, y, sr * 2, hgt); }
      ctx.restore();
      const r = mulberry(seed);
      ctx.fillStyle = '#2b0e4a'; ctx.beginPath(); ctx.moveTo(0, hz);
      for (let x = 0; x <= W; x += W / 24) ctx.lineTo(x, hz - (2 + r() * 7) * u * (0.5 + 0.5 * Math.abs(Math.sin(x / W * 5))));
      ctx.lineTo(W, hz); ctx.fill();
      ctx.fillStyle = vgrad(ctx, H, [[0, '#14062a'], [1, '#14062a']]); ctx.fillRect(0, hz, W, H - hz);
      ctx.strokeStyle = 'rgba(255,90,200,0.75)'; ctx.lineWidth = Math.max(1, 0.12 * u);
      for (let k = -14; k <= 14; k++) { ctx.beginPath(); ctx.moveTo(W / 2 + k * 1.2 * u, hz); ctx.lineTo(W / 2 + k * 9 * u, H); ctx.stroke(); }
      const off = (t * 0.6) % 1;
      for (let k = 0; k < 14; k++) { const p = ((k + off) / 14) ** 2.2, y = hz + (H - hz) * p; ctx.globalAlpha = 0.25 + 0.75 * p; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      ctx.globalAlpha = 1;
      const glow = ctx.createLinearGradient(0, hz - 2 * u, 0, hz + 2 * u); glow.addColorStop(0, 'rgba(255,120,210,0)'); glow.addColorStop(0.5, 'rgba(255,120,210,0.6)'); glow.addColorStop(1, 'rgba(255,120,210,0)');
      ctx.fillStyle = glow; ctx.fillRect(0, hz - 2 * u, W, 4 * u);
    },
  },
  {
    id: 'mesh', name: '오색 물결빛', hint: '부드러운 색들이 천천히 섞이며 흘러요', bg: '#f5f0ff',
    paint(ctx, W, H, t, seed) {
      ctx.fillStyle = '#f7f3ff'; ctx.fillRect(0, 0, W, H);
      const r = mulberry(seed), colors = ['255,170,200', '160,200,255', '255,215,150', '170,235,210', '205,175,255'];
      for (let i = 0; i < 5; i++) {
        const ax = 0.2 + r() * 0.6, ay = 0.2 + r() * 0.6, fx = 0.08 + r() * 0.12, fy = 0.07 + r() * 0.1, ph = r() * TAU;
        const x = W * (ax + 0.3 * Math.sin(t * fx + ph)), y = H * (ay + 0.3 * Math.cos(t * fy + ph * 1.3)), R = Math.max(W, H) * (0.38 + 0.08 * Math.sin(t * 0.2 + i));
        const g = ctx.createRadialGradient(x, y, 0, x, y, R); g.addColorStop(0, `rgba(${colors[i]},0.7)`); g.addColorStop(1, `rgba(${colors[i]},0)`);
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(0, 0, W, H);
    },
  },
  {
    id: 'plexus', name: '연결망', hint: '빛나는 점들이 움직이며 선으로 이어져요', bg: '#0d1626',
    paint(ctx, W, H, t, seed) {
      const u = W / 100;
      ctx.fillStyle = vgrad(ctx, H, [[0, '#0b1322'], [1, '#132239']]); ctx.fillRect(0, 0, W, H);
      const r = mulberry(seed), n = 64, pts = [];
      for (let i = 0; i < n; i++) pts.push([r() * W + Math.sin(t * (0.15 + r() * 0.25) + i) * 6 * u, r() * H + Math.cos(t * (0.15 + r() * 0.25) + i * 2) * 5 * u]);
      const reach = 14 * u, fade = ease(t / 1.5);
      ctx.lineWidth = Math.max(1, 0.09 * u);
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
        if (d > reach) continue;
        ctx.strokeStyle = `rgba(120,200,255,${0.45 * (1 - d / reach) * fade})`; ctx.beginPath(); ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[j][0], pts[j][1]); ctx.stroke();
      }
      for (const [x, y] of pts) { ctx.fillStyle = `rgba(170,230,255,${0.85 * fade})`; ctx.beginPath(); ctx.arc(x, y, 0.28 * u, 0, TAU); ctx.fill(); }
    },
  },
];
// 고르는 칸의 묶음(차례대로 보인다).
export const LIVE_GROUPS = Object.freeze([
  ['paper', '종이 · 그림', ['watercolor', 'paperhills', 'notebook', 'chalk', 'blueprint', 'film']],
  ['nature', '자연 · 날씨', ['clouds', 'waves', 'rain', 'sakura', 'autumn', 'snow', 'underwater', 'fireflies']],
  ['night', '밤 · 우주', ['stars', 'aurora', 'planets', 'fireworks']],
  ['party', '축하', ['confetti', 'balloons', 'bokeh']],
  ['digital', '디지털 · 디자인', ['terminal', 'plexus', 'synthwave', 'mesh']],
].map(([id, name, ids]) => Object.freeze({ id, name, ids: Object.freeze(ids) })));
const groupOf = new Map(LIVE_GROUPS.flatMap((g) => g.ids.map((id) => [id, g.id])));
/** 고를 수 있는 움직이는 바탕: [{ id, name, hint, bg(그 바탕에 어울리는 카드 색. 글자 색은 이 색에서 정해진다), group }] */
export const LIVES = Object.freeze(STYLES.map(({ id, name, hint, bg }) => Object.freeze({ id, name, hint, bg, group: groupOf.get(id) || 'paper' })));
const byId = new Map(STYLES.map((s) => [s.id, s]));
/** 움직이는 바탕 값을 정리한다: { id }(아는 이름만) 또는 null. */
export function cleanLive(raw) { const id = typeof raw === 'string' ? raw : raw?.id; return byId.has(id) ? { id } : null; }
/** 장(디자인)의 움직이는 바탕: { live: { id } } 또는 {}. */
export const designLive = (design) => { const live = cleanLive(design?.live); return live ? { live } : {}; };

/** 움직이는 바탕의 t 초 모습을 ctx 의 (0, 0, W, H) 에 그린다. 씨앗이 같으면 같은 그림이다. 그린 뒤 ctx 의 상태는 그대로다. */
export function paintLive(ctx, W, H, live, t, seed = 0) {
  const style = byId.get(cleanLive(live)?.id);
  if (!style || !(W > 0) || !(H > 0)) return false;
  ctx.save();
  try { style.paint(ctx, W, H, Number.isFinite(t) ? Math.max(0, t) : LIVE_STILL, seed >>> 0); }
  finally { ctx.restore(); }
  return true;
}

const stills = new Map();
/** 멈춘 모습(LIVE_STILL 초)의 그림 주소(data:). 크기 · 씨앗마다 한 번만 그린다. */
export function liveStill(live, W, H, seed = 0) {
  const id = cleanLive(live)?.id;
  if (!id || typeof document === 'undefined') return '';
  const w = Math.max(16, Math.round(W)), h = Math.max(16, Math.round(H)), key = `${id}|${w}x${h}|${seed}`;
  if (stills.has(key)) return stills.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  paintLive(c.getContext('2d'), w, h, { id }, LIVE_STILL, seed);
  const url = c.toDataURL('image/png');
  c.width = 0;
  stills.set(key, url);
  while (stills.size > 64) stills.delete(stills.keys().next().value);
  return url;
}
/**
 * 장의 바탕에 까는 움직이는 바탕의 겹(멈춘 모습의 그림). 발표 · 공유 링크 · 꾸미기 판은 liveBackdrops 가 그 자리에서 움직이게 한다.
 * edge: 그림의 긴 쪽(px) · aspect: 카드의 가로 ÷ 세로 · seed: 씨앗(장의 이름표에서)
 */
export function liveView(live, { edge = 640, aspect = 16 / 9, seed = 0 } = {}) {
  const id = cleanLive(live)?.id;
  if (!id) return null;
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 1, W = a >= 1 ? edge : edge * a, H = a >= 1 ? edge / a : edge;
  const img = el('img', { class: 'fe-live', alt: '', draggable: 'false', src: liveStill({ id }, W, H, seed) });
  img.dataset.live = id;
  img.dataset.liveSeed = String(seed);
  return img;
}

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
/**
 * root 안의 움직이는 바탕(.fe-live 그림)마다 그 위에 canvas 를 얹어 움직이게 한다(발표 · 공유 링크 · 꾸미기 판).
 * 시간은 부른 때를 0 초로 센다(발표는 장이 열린 때. 영상 내보내기와 같은 모습이 같은 때에 나온다). 동작 줄이기를 켠 기기는 멈춘 모습 그대로다.
 * fps: 1초에 그릴 수(꾸미기 판은 아껴 30). 돌려주는 것: { stop() }. 화면에서 떨어진 겹은 저절로 멈춘다.
 */
export function liveBackdrops(root, { fps = 60, start = performance.now() } = {}) {
  const runs = [];
  for (const img of root.querySelectorAll('img.fe-live[data-live]')) {
    if (img.nextElementSibling?.classList.contains('fe-live-canvas')) continue;
    const live = { id: img.dataset.live }, seed = Number(img.dataset.liveSeed) || 0;
    const canvas = el('canvas', { class: 'fe-live fe-live-canvas', 'aria-hidden': 'true' });
    img.after(canvas);
    const ctx = canvas.getContext('2d');
    let raf = 0, last = -1, stopped = false, shown = false, waited = 0;
    const fit = () => {
      const box = canvas.getBoundingClientRect(), dpr = Math.min(1.5, globalThis.devicePixelRatio || 1);
      const w = Math.max(16, Math.min(1920, Math.round(box.width * dpr))), h = Math.max(16, Math.min(1920, Math.round(box.height * dpr)));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; last = -1; }
    };
    const draw = (now) => {
      if (stopped) return;
      // 화면에서 떨어지면 멈춘다(아직 붙기 전이면 10초쯤 기다린다: 미리 만들어 둔 장).
      if (!canvas.isConnected) { if (shown || ++waited > 600) { run.stop(); return; } raf = requestAnimationFrame(draw); return; }
      shown = true;
      raf = requestAnimationFrame(draw);
      if (document.hidden) return;
      const t = reduced() ? LIVE_STILL : (now - start) / 1000;
      if (last >= 0 && (reduced() || t - last < 1 / fps - 0.002)) return;
      fit(); last = t;
      paintLive(ctx, canvas.width, canvas.height, live, t, seed);
    };
    const run = { stop() { stopped = true; cancelAnimationFrame(raf); canvas.remove(); } };
    raf = requestAnimationFrame(draw);
    runs.push(run);
  }
  return { stop() { for (const r of runs) r.stop(); } };
}
