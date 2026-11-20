import {cleanHtmlPoster} from '../src/html-file.js';

// Runs only inside a disposable opaque-origin frame, never in the application document.
function captureFirstScreen(channel, width, height) {
  const send = parent.postMessage.bind(parent);
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const dataUrl = blob => new Promise((resolve,reject) => { const reader=new FileReader(); reader.onload=()=>resolve(reader.result); reader.onerror=reject; reader.readAsDataURL(blob); });
  const resources = new Map(); let count=0;
  const raster = image => {
    const canvas=document.createElement('canvas'), w=image.naturalWidth||image.videoWidth||image.width, h=image.naturalHeight||image.videoHeight||image.height;
    const scale=Math.min(1,1600/w,1600/h); canvas.width=Math.max(1,Math.round(w*scale)); canvas.height=Math.max(1,Math.round(h*scale));
    canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height); return canvas.toDataURL('image/png');
  };
  const resource = url => {
    if(url.startsWith('#'))return Promise.resolve(url);
    if(url.startsWith('about:blank#'))return Promise.resolve(url.slice('about:blank'.length));
    if(!resources.has(url))resources.set(url,(async()=>{
      try {
        const absolute=new URL(url,document.baseURI);
        if(!['https:','data:','blob:'].includes(absolute.protocol))return '';
        const image=new Image(); image.crossOrigin='anonymous'; image.src=absolute.href;
        await image.decode(); return raster(image);
      }catch{return '';}
    })());
    return resources.get(url);
  };
  const inlineUrls = async value => {
    let result='',at=0;
    for(const match of value.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)){
      result+=value.slice(at,match.index)+`url("${await resource(match[2])}")`;at=match.index+match[0].length;
    }
    return result+value.slice(at);
  };
  const copyStyle = async (style,target) => {
    for(const property of style){
      if(/^(animation|transition)/.test(property))continue;
      let value=style.getPropertyValue(property);
      if(/url\(/i.test(value))value=await inlineUrls(value);
      target.style.setProperty(property,value);
    }
    target.style.setProperty('animation','none','important'); target.style.setProperty('transition','none','important');
  };
  const clone = async node => {
    if(++count>12000)throw Error('preview nodes');
    if(node.nodeType===3)return document.createTextNode(node.data);
    if(node.nodeType!==1||['SCRIPT','STYLE','LINK','META','BASE','IFRAME','OBJECT','EMBED','AUDIO'].includes(node.tagName))return null;
    const style=getComputedStyle(node);
    if(style.display==='none'||style.visibility==='hidden'||style.opacity==='0')return null;
    let copy;
    if(node instanceof HTMLCanvasElement || node instanceof HTMLImageElement || node instanceof HTMLVideoElement){
      copy=document.createElement('img');
      try { copy.src=node instanceof HTMLImageElement?await resource(node.currentSrc||node.src):raster(node); }catch{copy.src='';}
    }else{
      copy=node.cloneNode(false);
      for(const attr of [...copy.attributes])if(/^on/i.test(attr.name)||['src','srcset','href','xlink:href','style'].includes(attr.name))copy.removeAttribute(attr.name);
      if(['image','use'].includes(node.localName))copy.setAttribute('href',await resource(node.getAttribute('href')||node.getAttribute('xlink:href')||''));
    }
    await copyStyle(style,copy);
    if(!(copy instanceof HTMLImageElement)){
      const pseudo=async name=>{const css=getComputedStyle(node,name);if(!css.content||['none','normal','""'].includes(css.content))return;const span=document.createElement('span');await copyStyle(css,span);span.style.content='normal';span.textContent=css.content.replace(/^['"]|['"]$/g,'');copy.append(span);};
      await pseudo('::before');
      for(const child of node.childNodes){const made=await clone(child);if(made)copy.append(made);}
      await pseudo('::after');
    }
    return copy;
  };
  async function capture(){
    try {
      await Promise.race([document.fonts?.ready,pause(1800)]);
      await Promise.race([Promise.allSettled([...document.images].map(image=>image.decode())),pause(1800)]);
      await pause(350);
      for(const animation of document.getAnimations()){try{if(Number.isFinite(animation.effect?.getComputedTiming().endTime))animation.finish();}catch{}}
      let fonts='';
      for(const sheet of document.styleSheets){try{for(const rule of sheet.cssRules)if(rule.type===CSSRule.FONT_FACE_RULE){
        let css=rule.cssText;
        for(const match of [...css.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)]){
          try{const url=new URL(match[2],sheet.href||document.baseURI);if(!['https:','data:','blob:'].includes(url.protocol))throw Error();
            const response=await fetch(url,{credentials:'omit',signal:AbortSignal.timeout(2000)});const blob=await response.blob();
            if(!response.ok||blob.size>5000000)throw Error();css=css.replace(match[0],`url("${await dataUrl(blob)}")`);
          }catch{css=css.replace(match[0],'local("sans-serif")');}
        }
        fonts+=css;
      }}catch{}}
      const copy=await clone(document.documentElement);copy.setAttribute('xmlns','http://www.w3.org/1999/xhtml');
      copy.style.width=width+'px';copy.style.height=height+'px';copy.style.overflow='hidden';
      const fontStyle=document.createElement('style');fontStyle.textContent=fonts;copy.prepend(fontStyle);
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('width',width);svg.setAttribute('height',height);
      const foreign=document.createElementNS(svg.namespaceURI,'foreignObject');foreign.setAttribute('width','100%');foreign.setAttribute('height','100%');foreign.append(copy);svg.append(foreign);
      const serialized=new XMLSerializer().serializeToString(svg);if(serialized.length>24000000)throw Error('preview size');
      const image=new Image();image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(serialized);await image.decode();
      const canvas=document.createElement('canvas');canvas.width=960;canvas.height=Math.round(960*height/width);
      const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);
      for(const node of [document.body,document.documentElement]){ctx.fillStyle=getComputedStyle(node).backgroundColor;ctx.fillRect(0,0,canvas.width,canvas.height);}
      ctx.drawImage(image,0,0,canvas.width,canvas.height);
      for(const quality of [.8,.65,.45]){const poster=canvas.toDataURL('image/jpeg',quality);if(poster.length<=400000){send({channel,poster},'*');return;}}
    }catch{}
    send({channel,poster:''},'*');
  }
  addEventListener('load',capture,{once:true});
}

let last=null;
export function htmlFirstScreen(html,{aspect=16/9}={}) {
  if(!html||typeof document==='undefined')return Promise.resolve('');
  const ratio=Number.isFinite(aspect)&&aspect>=.25&&aspect<=4?aspect:16/9;
  if(last?.html===html&&last.ratio===ratio)return last.job;
  last?.cancel?.();
  let cancel;
  const job=new Promise(resolve=>{
    const width=1280,height=Math.round(width/ratio),channel=crypto.randomUUID();
    const frame=document.createElement('iframe');frame.sandbox='allow-scripts';frame.referrerPolicy='no-referrer';frame.setAttribute('aria-hidden','true');frame.tabIndex=-1;
    frame.style.cssText=`position:fixed;left:-20000px;top:0;width:${width}px;height:${height}px;border:0;pointer-events:none`;
    const finish=poster=>{clearTimeout(timer);window.removeEventListener('message',receive);frame.remove();resolve(cleanHtmlPoster(poster));};
    cancel=()=>finish('');
    const receive=event=>{if(event.source===frame.contentWindow&&event.data?.channel===channel)finish(event.data.poster);};
    const timer=setTimeout(()=>finish(''),10000);window.addEventListener('message',receive);
    const boot=`(${captureFirstScreen.toString()})(${JSON.stringify(channel)},${width},${height});`;
    frame.srcdoc='<!doctype html><meta charset="utf-8"><base href="about:blank"><script>'+boot.replace(/<\/script/gi,'<\\/script')+'</script>'+html;
    document.body.append(frame);
  });
  last={html,ratio,job,cancel};job.then(poster=>{if(!poster&&last?.job===job)last=null;});return job;
}
