import test from 'node:test';
import assert from 'node:assert/strict';
import {readLocalFile} from '../app/pptx-import/local-file.js';

test('device files retain MIME and SHA-256 across legacy Blob and current byte rows',async()=>{
  const meta={mimeType:'application/octet-stream',byteLength:3,sha256:'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'};
  const blob=new Blob(['abc'],{type:meta.mimeType});
  for(const row of [{blob},{bytes:await blob.arrayBuffer()}]){
    const file=await readLocalFile(row,meta);
    assert.equal(file.type,meta.mimeType);assert.equal(await file.text(),'abc');
  }
  for(const row of [{},{blob:new Blob(['a'])},{bytes:new Uint8Array([97,98,0]).buffer}]){
    assert.equal(await readLocalFile(row,meta),null);
  }
});
