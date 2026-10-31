import {el} from '../src/dom.js';
import {photoStudySetup,studyBitmap} from './photo-study.js';
import {mountPixelArt,pixelArtImage} from './pixel-art.js';

export function setupPhotoDemo() {
  const canvas=document.querySelector('.photo-feature canvas'),c=canvas.getContext('2d');
  const sky=c.createLinearGradient(0,0,0,72);
  sky.addColorStop(0,'#685b94');sky.addColorStop(.56,'#ffa677');sky.addColorStop(1,'#49a8ab');
  c.fillStyle=sky;c.fillRect(0,0,96,72);
  c.fillStyle='#ffe5a4';c.beginPath();c.arc(62,24,10,0,Math.PI*2);c.fill();
  function ridge(y,color,peaks){
    c.beginPath();c.moveTo(0,y);for(const [x,h] of peaks)c.lineTo(x,h);
    c.lineTo(96,y);c.closePath();c.fillStyle=color;c.fill();
  }
  ridge(48,'#565781',[[0,30],[14,35],[31,18],[46,38],[61,31],[76,40],[96,28]]);
  ridge(48,'#26485a',[[0,38],[21,28],[37,40],[54,32],[72,46],[96,37]]);
  c.fillStyle='#f6bd8b';for(const [x,y,w] of [[48,49,27],[54,52,15],[47,55,19],[58,59,9]])c.fillRect(x,y,w,1);
  ridge(72,'#163b47',[[0,51],[12,55],[28,69],[42,72],[96,72]]);
  const dialog=document.querySelector('#photo-demo'),stage=dialog.querySelector('#demo-stage');
  let board;
  dialog.querySelector('.demo-close').onclick=()=>dialog.close();
  dialog.onclose=()=>{board?.destroy();board=null;stage.replaceChildren();};
  document.querySelector('#try-study').onclick=async()=>{
    dialog.showModal();
    const bitmap=await studyBitmap(canvas);
    if(!dialog.open)return;
    stage.replaceChildren(photoStudySetup(bitmap,{start:{x:65,y:33},applyLabel:'이 점으로 체험 시작',onCancel:()=>dialog.close(),onApply:activity=>{
      board=mountPixelArt(stage,{activity,saveLabel:'완성한 그림 보기',onSave:cells=>{
        const url=pixelArtImage(activity,cells);
        board.destroy();stage.replaceChildren(el('section',{class:'pixel-setup'},el('h2',{text:'내가 고른 색으로 그린 그림'}),
          el('img',{src:url,alt:'완성한 픽셀아트',style:'display:block;width:min(300px,100%);margin:auto;image-rendering:pixelated'}),
          el('p',{text:'편집기에서는 이 그림을 수업의 다음 장에 저장할 수 있어요.'})));
      }});
    }}));
  };
}
