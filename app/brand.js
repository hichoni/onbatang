// App identity is separate from the editor's document fonts and storage keys.
import { el } from './ui.js';
export const onbatangAsset = name => new URL(`./brand/${name}?v=b1`, import.meta.url).href;
export const onbatangLogo = (className = '', alt = '온바탕') => el('img', {
  class: `onba-logo ${className}`, src: onbatangAsset('logo-primary.svg'), alt,
  width: 520, height: 112, draggable: 'false', decoding: 'async',
});
// GBE-AI Lab's existing owl brand asset, shared by the optional GaiX entry point.
export const gaiOwl = () => el('img', {class:'gai-owl',src:onbatangAsset('gai-owl.png'),alt:'',width:24,height:24,draggable:'false'});
