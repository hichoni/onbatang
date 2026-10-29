import test from 'node:test';
import assert from 'node:assert/strict';
import {OCCASION_LAYOUTS, matchesLayout} from '../app/occasion-layouts.js';
import {SHARED_LAYOUTS, MAX_CARD_ITEMS} from '../app/layouts.js';
import {configure, layoutItems, cleanDesign, SHAPES} from '../src/model.js';
import {cleanRecord, newRecord} from '../app/designs.js';

const ratios=[16/9,4/3,1,4/5,9/16,2.4];
const emWidth=text=>[...text].reduce((n,c)=>n+(/\s/.test(c)?.36:/[A-Za-z0-9.,:;!/-]/.test(c)?.65:1),0);

test('occasion library adds 30 editable layouts in five useful groups without changing old ids',()=>{
  assert.equal(OCCASION_LAYOUTS.length,30);
  assert.equal(new Set(OCCASION_LAYOUTS.map(x=>x.group)).size,5);
  assert.equal(new Set(SHARED_LAYOUTS.map(x=>x.id)).size,SHARED_LAYOUTS.length);
  assert.ok(['cover','band','list','bubble','question','end'].every(id=>SHARED_LAYOUTS.some(l=>l.id===id)));
  assert.ok(OCCASION_LAYOUTS.every(l=>l.items(16/9).every(it=>['text','shape'].includes(it.t))), 'text and shapes remain individually editable');
  assert.ok(OCCASION_LAYOUTS.some(l=>l.name==='연수 표지')&&OCCASION_LAYOUTS.some(l=>l.name==='행사 식순'));
});

test('original and preset aspect ratios retain every caption and shape inside the page',()=>{
  const known=new Set(SHAPES.map(x=>x.id));
  for(const aspect of ratios){
    configure({layouts:SHARED_LAYOUTS,aspect,maxItems:MAX_CARD_ITEMS});
    for(const layout of OCCASION_LAYOUTS){
      const raw=layout.items(aspect), items=layoutItems(layout.id), label=`${layout.id} @ ${aspect}`;
      assert.ok(raw.length<=MAX_CARD_ITEMS,label);
      assert.equal(items.length,raw.length,label);
      raw.forEach((it,i)=>{
        assert.ok(Number.isFinite(it.x)&&Number.isFinite(it.y),label);
        if(it.t==='shape')assert.ok(known.has(it.shape),`${label}: unknown ${it.shape}`);
        if(it.t==='text'){
          assert.equal(items[i].text,it.text,`${label}: caption kept`);
          const lines=it.text.split('\n'),height=lines.length*it.size*1.25,centerY=it.y/aspect;
          assert.ok(centerY-height/2>=-.11 && centerY+height/2<=100/aspect+.11,`${label}: vertical text fit: ${it.text}`);
          assert.ok(lines.every(line=>emWidth(line)*it.size<=it.w+.1),`${label}: horizontal text fit: ${it.text}`);
          assert.ok(it.x-it.w/2>=0&&it.x+it.w/2<=100,label);
        }
      });
      const record=newRecord('16:9'); record.size={width:aspect*1000,height:1000,unit:'px'}; record.originalSize={...record.size}; record.slides=[{bg:layout.bg,items}];
      const reopened=cleanRecord(JSON.parse(JSON.stringify(cleanRecord(record))));
      assert.equal(reopened.slides[0].items.length,items.length,`${label}: save/reopen`);
      assert.deepEqual(reopened.slides[0].items.filter(it=>it.t==='text').map(it=>it.text),items.filter(it=>it.t==='text').map(it=>it.text));
      assert.equal(cleanDesign({bg:layout.bg,items}).items.length,items.length,label);
    }
  }
});

test('template search supports category, role and multiple Korean keywords',()=>{
  assert.ok(OCCASION_LAYOUTS.filter(l=>matchesLayout(l,'연수 표지')).some(l=>l.id==='occasion-training-cover'));
  assert.ok(OCCASION_LAYOUTS.filter(l=>matchesLayout(l,'식순')).some(l=>l.id==='occasion-event-agenda'));
  assert.ok(OCCASION_LAYOUTS.filter(l=>matchesLayout(l,'졸업')).some(l=>l.id==='occasion-school-graduation'));
  assert.equal(OCCASION_LAYOUTS.filter(l=>matchesLayout(l,'없는검색어')).length,0);
  assert.equal(OCCASION_LAYOUTS.filter(l=>matchesLayout(l,' ')).length,OCCASION_LAYOUTS.length);
});
