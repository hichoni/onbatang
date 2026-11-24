import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
await build({stdin:{contents:"export {unzipSync} from 'fflate';",resolveDir:fileURLToPath(new URL('../',import.meta.url))},outfile:fileURLToPath(new URL('../app/vendor/story-zip.js',import.meta.url)),bundle:true,format:'esm',minify:true,legalComments:'eof',target:'es2022'});
