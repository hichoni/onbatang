import {DocumentError} from './document.js';
import {cleanPixelActivity} from './pixel-art.js';
import {cleanGaiActivity} from './gai-app.js';
import {cleanQuizActivity} from './quiz.js';
export function cleanActivity(raw){
 if(raw===undefined)return undefined;
 if(raw?.kind==='pixel-art')return cleanPixelActivity(raw);
 if(raw?.kind==='gai-app')return cleanGaiActivity(raw);
 if(raw?.kind==='quiz')return cleanQuizActivity(raw);
 throw new DocumentError('INVALID_ACTIVITY','activity.kind',raw);
}
