// 온바탕 들여쓰기: 어느 앱에서든 몇 줄로 온바탕을 불러 그림을 받는다(모듈이 아닌 보통 스크립트).
//
//   <script src="(온바탕 주소)/app/embed.js"></script>    공용 온바탕은 onbatang.web.app
//   const result = await Onbatang.open({ ratio: '9:16', title: '우리 앱 화면', tools: 'simple', png: { width: 1080 } });
//   if (result) { result.png /* Blob(image/png, 첫 장) */; result.record /* 원본(다시 고칠 때 record 로 넘긴다) */; result.pngs /* png: { pages: 'all' } 이면 모든 장의 Blob */ }
//
// open(options): 화면 위(또는 options.container 안)에 iframe 을 띄우고, 끝나면 지운다. 닫기를 누르면 null.
//   ratio '1:1' · '4:5' · '16:9' · '9:16'(기본) · template(틀 이름, 선택) · record(다시 고칠 원본, 선택) · title · tools 'simple' | 'full' · png { width, pages: 'first' | 'all' }
// 신호는 그 iframe 과 온바탕 주소의 것만 받는다. 온바탕은 바깥에 저장하지 않는다(받은 그림을 둘 곳은 부른 앱이 정한다).
(function () {
  'use strict';
  if (window.Onbatang) return;
  var script = document.currentScript;
  var page = new URL('./embed.html', script && script.src ? script.src : location.href);
  var busy = null;

  function open(options) {
    options = options || {};
    if (busy) return Promise.reject(new Error('온바탕이 이미 열려 있어요.'));
    busy = new Promise(function (resolve, reject) {
      var frame = document.createElement('iframe');
      frame.src = page.href;
      frame.title = options.title ? '온바탕 — ' + options.title : '온바탕';
      frame.setAttribute('allow', 'fullscreen');
      frame.style.cssText = 'display:block;width:100%;height:100%;border:0;background:#f5f5ef';
      var holder = options.container || null, overlay = null, scroll = '';
      if (holder) holder.appendChild(frame);
      else {
        overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(20,24,32,.55)';
        overlay.appendChild(frame);
        document.body.appendChild(overlay);
        scroll = document.documentElement.style.overflow;
        document.documentElement.style.overflow = 'hidden';
      }
      var init = {
        type: 'onba:init', ratio: options.ratio, template: options.template, record: options.record || null,
        title: options.title, tools: options.tools, png: options.png,
      };
      function finish(value, error) {
        window.removeEventListener('message', listen);
        if (overlay) { overlay.remove(); document.documentElement.style.overflow = scroll; } else frame.remove();
        busy = null;
        if (error) reject(error); else resolve(value);
      }
      function listen(event) {
        if (event.source !== frame.contentWindow || event.origin !== page.origin) return;
        var data = event.data || {};
        if (data.type === 'onba:ready') frame.contentWindow.postMessage(init, page.origin);
        else if (data.type === 'onba:save') finish({ png: data.png, record: data.record, pngs: Array.isArray(data.pngs) ? data.pngs : [data.png] });
        else if (data.type === 'onba:close') finish(null);
        else if (data.type === 'onba:error') finish(null, new Error(String(data.message || '온바탕을 열지 못했어요.')));
      }
      window.addEventListener('message', listen);
    });
    return busy;
  }

  window.Onbatang = Object.freeze({ open: open });
})();
