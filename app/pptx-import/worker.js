import {inspectPptx,convertPptx,previewPptx} from './converter.js';

self.addEventListener('message',async({data})=>{
  const {id,method,file,options={}}=data||{};
  if(!id||!['inspect','convert','preview'].includes(method))return;
  try{
    const operation=method==='inspect'?inspectPptx:method==='preview'?previewPptx:convertPptx;
    const result=await operation(file,{selectedPages:options.selectedPages,onProgress:progress=>self.postMessage({id,type:'progress',progress})});
    self.postMessage({id,type:'result',result});
  }catch(error){self.postMessage({id,type:'error',error:{name:error.name,code:error.code||'CONVERSION_FAILED',message:error.message,details:error.details||{}}});}
});
