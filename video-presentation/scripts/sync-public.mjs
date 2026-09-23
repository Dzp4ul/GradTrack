import {cp, mkdir, rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = path.join(projectRoot, 'public');
const folders = ['assets', 'screenshots', 'audio'];

await mkdir(publicRoot, {recursive: true});

for (const folder of folders) {
  const destination = path.join(publicRoot, folder);
  await rm(destination, {recursive: true, force: true});
  await cp(path.join(projectRoot, folder), destination, {recursive: true});
  console.log(`Synced ${folder}/`);
}
