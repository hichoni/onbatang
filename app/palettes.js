import {cleanPalettes} from '../src/palettes.js';
export function createLocalPalettes(namespace){
  if(!/^[a-z][a-z0-9.-]{0,40}$/.test(namespace))throw Error('storage name');
  const key=`onbatang.palettes.v1.${namespace}`;
  return {read(){try{return cleanPalettes(JSON.parse(localStorage.getItem(key)||'{}'));}catch{return cleanPalettes();}},
    write(value){const clean=cleanPalettes(value);localStorage.setItem(key,JSON.stringify(clean));return clean;}};
}
