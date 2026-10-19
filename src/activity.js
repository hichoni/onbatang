import {DocumentError} from './document.js';
import {cleanPixelActivity} from './pixel-art.js';
import {cleanGaiActivity} from './gai-app.js';
export function cleanActivity(raw){
 if(raw===undefined)return undefined;
 if(raw?.kind==='pixel-art')return cleanPixelActivity(raw);
 if(raw?.kind==='gai-app')return cleanGaiActivity(raw);
 throw new DocumentError('INVALID_ACTIVITY','activity.kind',raw);
}
