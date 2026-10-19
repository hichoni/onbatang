// A narrow, fail-closed DOM adapter for the pinned independent renderer.
// No package XML, text, run styling, font size or stored geometry is rewritten.
export const PUNCTUATION_RENDERER_VERSION='1.3.0';
export const PUNCTUATION_MARKER='[data-pptx-hanging-punctuation="1"]';
const endPunctuation=/[!?,.;:、。，．！？；：]$/;
const attr=(node,key)=>node?.attr?.(key);
const child=(node,key)=>node?.child?.(key);
const bool=value=>value===undefined?undefined:['1','true'].includes(value)?true:['0','false'].includes(value)?false:null;

function hanging(paragraph,body,presentation,slide){
  const own=bool(attr(paragraph.properties,'hangingPunct'));if(own!==undefined)return own;
  const layout=presentation.slideToLayout?.get(slide.index)||slide.layoutIndex;
  const master=presentation.masters?.get(presentation.layoutToMaster?.get(layout));
  const styles=[body.listStyle,master?.textStyles?.otherStyle,master?.defaultTextStyle,presentation.defaultTextStyle];
  const level=paragraph.level??0;if(!Number.isInteger(level)||level<0||level>8)return null;
  for(const style of styles)for(const node of [child(style,`lvl${level+1}pPr`),child(style,'defPPr')]){
    const value=bool(attr(node,'hangingPunct'));if(value!==undefined)return value;
  }
  return true; // Office default; MS-OI29500 2.1.1406(d).
}
function geometryMatches(element,node){
  return element?.tagName==='DIV'&&element.style.position==='absolute'
    &&[['left',node.position?.x],['top',node.position?.y],['width',node.size?.w],['height',node.size?.h]].every(([key,value])=>Number.isFinite(value)&&/^-?[\d.]+px$/.test(element.style[key])&&Math.abs(parseFloat(element.style[key])-value)<.02);
}
function clippingPlan(paragraph,root,view){
  const clips=[],ancestors=[];
  for(let node=paragraph;node&&node!==root;node=node.parentElement){
    const style=view.getComputedStyle(node);
    ancestors.push(style);
    if(style.clipPath&&style.clipPath!=='none'||style.writingMode&&!['horizontal-tb','lr-tb'].includes(style.writingMode)||/\b(paint|strict|content)\b/.test(style.contain)||/\b(hidden|auto|scroll)\b/.test(style.overflow))return null;
    const overflow=(style.overflow||'visible').split(/\s+/),x=style.overflowX||overflow[0],y=style.overflowY||overflow[1]||overflow[0];
    if(x==='visible'&&y==='visible')continue;
    // The vendor's horizontal clip may have unused right padding. Never remove
    // that clip: admit it only when the final glyph is measured wholly inside.
    if(x!=='clip'||y!=='visible'||['Top','Right','Bottom','Left'].some(side=>parseFloat(style[`border${side}Width`])>0)||['TopLeft','TopRight','BottomRight','BottomLeft'].some(corner=>parseFloat(style[`border${corner}Radius`])>0)||style.overflowClipMargin&&style.overflowClipMargin!=='0px')return null;
    clips.push(node);
  }
  if(clips.length)ancestors.push(view.getComputedStyle(root));
  if(!root.contains(paragraph)||clips.length&&ancestors.some(style=>style.transform&&style.transform!=='none'||style.perspective&&style.perspective!=='none'||style.filter&&style.filter!=='none'))return null;
  return clips;
}
function glyphFitsClips(span,clips){
  if(!clips.length)return true;
  const range=span.ownerDocument.createRange();range.selectNodeContents(span);
  if(typeof range.getClientRects!=='function')return false;
  const rects=[...range.getClientRects()].filter(rect=>rect.width>0&&rect.height>0);
  const boxes=clips.map(node=>node.getBoundingClientRect());
  if(!rects.length||boxes.some(box=>box.width<=0))return false;
  // A glyph's advance can contain blank side bearings outside the clip while
  // its ink can also extend beyond that advance. Always check painted ink for
  // clipped text: only a plain LTR glyph with loaded, identical canvas/DOM font
  // metrics and a safety margin is eligible, even if its advance would fit.
  if(rects.length!==1||span.textContent.length!==1)return false;
  const document=span.ownerDocument,style=document.defaultView.getComputedStyle(span);
  if(style.direction!=='ltr'||!['normal','0px'].includes(style.letterSpacing)||style.fontFeatureSettings!=='normal'||style.fontVariationSettings!=='normal'||style.fontStyle!=='normal'||!['normal','100%'].includes(style.fontStretch)||style.fontVariant!=='normal'||style.fontVariantCaps!=='normal'||style.fontVariantPosition!=='normal'||style.fontSizeAdjust!=='none'||style.textShadow!=='none'||parseFloat(style.webkitTextStrokeWidth)>0||/underline|overline|line-through/.test(`${style.textDecorationLine} ${style.textDecoration}`)||document.fonts?.status!=='loaded')return false;
  const context=document.createElement('canvas').getContext('2d');if(!context)return false;
  context.font='1px serif';context.font=`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  if(context.font==='1px serif'||!document.fonts.check(context.font,span.textContent))return false;
  context.textAlign='left';context.direction='ltr';const metrics=context.measureText(span.textContent),rect=rects[0];
  if(![metrics.width,metrics.actualBoundingBoxLeft,metrics.actualBoundingBoxRight].every(Number.isFinite)||Math.abs(metrics.width-rect.width)>.05)return false;
  const left=rect.left-metrics.actualBoundingBoxLeft,right=rect.left+metrics.actualBoundingBoxRight;
  return right>left&&boxes.every(box=>left>=box.left+.5&&right<=box.right-.5);
}

/** The 1.3.0 renderSlide contract appends one child per slide node after any
 * background/master/layout children. Order alone is never sufficient: the exact
 * node frame, full body text, paragraph count, structure and text must all match.
 * Unsupported or changed DOM is left untouched. Non-placeholder top-level HTML
 * text only; grouped, unsupported clipping, vertical, 3D, math, bullet and
 * explicit-br text is left to the renderer. Each paragraph keeps its own flag.
 */
export function adaptPreviewPunctuation({presentation,slide,element,rendererVersion}={}){
  const document=element?.ownerDocument,view=document?.defaultView,nodes=slide?.nodes;
  if(rendererVersion!==PUNCTUATION_RENDERER_VERSION||!document||!view||!Array.isArray(nodes)||!nodes.length||element.children.length<nodes.length)return 0;
  const rendered=[...element.children].slice(-nodes.length);let adjusted=0;
  for(const [index,node]of nodes.entries()){
    const body=node.textBody,frame=rendered[index];
    if(node.nodeType!=='shape'||node.placeholder||node.shape3d||!Array.isArray(body?.paragraphs)||!body.paragraphs.length||!geometryMatches(frame,node))continue;
    const direction=attr(body.bodyProperties,'vert')??attr(body.layoutBodyProperties,'vert');
    if(direction&&direction!=='horz'||[attr(body.bodyProperties,'wrap'),attr(body.layoutBodyProperties,'wrap')].includes('none'))continue;
    const texts=body.paragraphs.map(paragraph=>Array.isArray(paragraph.runs)&&paragraph.runs.every(run=>typeof run.text==='string'&&!run.math)?paragraph.runs.map(run=>run.text).join(''):null);
    if(texts.some(text=>text===null||/[\n\r\t]/.test(text))||frame.textContent!==texts.join(''))continue;
    const layers=[...frame.querySelectorAll('div')].filter(layer=>layer.style.position==='absolute'&&layer.style.display==='flex'&&layer.style.flexDirection==='column'&&layer.children.length===texts.length&&[...layer.children].every((paragraph,i)=>paragraph.tagName==='DIV'&&paragraph.style.width==='100%'&&paragraph.style.maxWidth==='100%'&&paragraph.style.boxSizing==='border-box'&&paragraph.textContent===texts[i]));
    if(layers.length!==1)continue;
    const paragraphs=[...layers[0].children],plans=[];
    for(const [i,paragraph]of paragraphs.entries()){
      if(hanging(body.paragraphs[i],body,presentation,slide)!==true||texts[i].length<2||!endPunctuation.test(texts[i])||paragraph.querySelector(`${PUNCTUATION_MARKER},br,math,svg,canvas,img`))continue;
      const clips=clippingPlan(paragraph,element,view);if(!clips)continue;
      const walker=document.createTreeWalker(paragraph,view.NodeFilter.SHOW_TEXT);let text,last;
      while(text=walker.nextNode())if(text.length)last=text;
      if(!last||last.data.slice(-1)!==texts[i].slice(-1))continue;
      // Atomic inline boxes need explicit decoration inheritance. If decoration
      // comes from a more distant ancestor, retain the original vendor layout:
      // inheriting the immediate run would incorrectly erase that decoration.
      let unsupportedDecoration=false;
      for(let ancestor=last.parentElement;ancestor&&ancestor!==element;ancestor=ancestor.parentElement){
        const style=view.getComputedStyle(ancestor);
        if(ancestor!==last.parentElement&&/underline|overline|line-through/.test(`${style.textDecorationLine} ${style.textDecoration}`)){unsupportedDecoration=true;break;}
      }
      if(unsupportedDecoration)continue;
      plans.push({last,clips});
    }
    for(const {last,clips}of plans){
      const original=last.data,span=document.createElement('span');
      span.dataset.pptxHangingPunctuation='1';span.style.cssText='display:inline-block;width:0;white-space:pre;text-decoration:inherit';
      last.data=original.slice(0,-1);last.after(span);span.append(original.slice(-1));
      let fits=false;try{fits=glyphFitsClips(span,clips);}catch{/* Retain the untouched vendor text if measuring is unavailable. */}
      if(!fits){span.remove();last.data=original;continue;}
      adjusted++;
    }
  }
  return adjusted;
}

// Ignore only the intentionally hanging glyph in overflow fitting. Any overflow
// in the rest of the text still reaches the existing protection in the frame.
export function previewTextBounds(layer){
  const document=layer.ownerDocument,range=document.createRange();
  if(!layer.querySelector(PUNCTUATION_MARKER)){range.selectNodeContents(layer);return range.getBoundingClientRect();}
  const walker=document.createTreeWalker(layer,document.defaultView.NodeFilter.SHOW_TEXT),rects=[];let text;
  while(text=walker.nextNode()){
    if(text.parentElement.closest(PUNCTUATION_MARKER))continue;
    range.selectNodeContents(text);rects.push(...[...range.getClientRects()].filter(rect=>rect.width>0&&rect.height>0));
  }
  if(!rects.length)return null;
  return {left:Math.min(...rects.map(r=>r.left)),right:Math.max(...rects.map(r=>r.right)),top:Math.min(...rects.map(r=>r.top)),bottom:Math.max(...rects.map(r=>r.bottom))};
}
