import { readFileSync } from 'fs';
import { transpile } from './src/transpile';

const filename = 'target.pug';
const src = readFileSync(filename).toString();
console.log(transpile(src, filename));
