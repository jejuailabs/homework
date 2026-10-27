import sharp from 'sharp';
import {readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve, join} from 'node:path';
import {fileURLToPath} from 'node:url';

// Technical alpha-preserving extraction from the generated 2x2 atlas only.
// Usage: node src/modules/region-quest/scripts/prepare-car-assets.mjs ATLAS.png
const input = process.argv[2];
if (!input) throw new Error('Pass the generated transparent 2x2 car atlas.');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../continuous/assets');
const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
const {data, info} = await sharp(resolve(input)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const keys = ['carDown', 'carLeft', 'carRight', 'carUp'];
const names = ['car-down.webp', 'car-left.webp', 'car-right.webp', 'car-up.webp'];
const details = [];
for (let cell = 0; cell < 4; cell++) {
  const cellX = (cell % 2) * Math.floor(info.width / 2), cellY = Math.floor(cell / 2) * Math.floor(info.height / 2);
  const width = Math.floor(info.width / 2), height = Math.floor(info.height / 2);
  const visited = new Uint8Array(width * height), queue = new Int32Array(width * height);
  let largest = {count:0};
  for (let start = 0; start < width * height; start++) {
    const alpha = index => data[((Math.floor(index / width) + cellY) * info.width + index % width + cellX) * 4 + 3];
    if (visited[start] || alpha(start) < 64) continue;
    let head=0, tail=1, left=width, top=height, right=-1, bottom=-1;
    queue[0]=start; visited[start]=1;
    while (head<tail) {
      const index=queue[head++], x=index%width, y=Math.floor(index/width);
      left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);
      for(let ny=Math.max(0,y-1);ny<=Math.min(height-1,y+1);ny++) for(let nx=Math.max(0,x-1);nx<=Math.min(width-1,x+1);nx++) {
        const next=ny*width+nx;
        if(visited[next]||alpha(next)<64)continue;
        visited[next]=1;queue[tail++]=next;
      }
    }
    if(tail>largest.count)largest={count:tail,left,top,right,bottom};
  }
  if(largest.count < width * height * .1)throw new Error(`Missing vehicle in quadrant ${cell}`);
  const left=Math.max(0,largest.left-3),top=Math.max(0,largest.top-3);
  const right=Math.min(width-1,largest.right+3),bottom=Math.min(height-1,largest.bottom+3);
  const result=await sharp(resolve(input)).extract({left:cellX+left,top:cellY+top,width:right-left+1,height:bottom-top+1}).resize({height:240}).webp({quality:92,alphaQuality:100}).toFile(join(root,names[cell]));
  manifest.files[keys[cell]]=names[cell];
  manifest.dimensions[keys[cell]]={width:result.width,height:result.height};
  manifest.anchors[keys[cell]]={x:result.width/2,y:result.height-2};
  details.push({key:keys[cell],file:names[cell],width:result.width,height:result.height,bytes:result.size});
}
await writeFile(join(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify(details,null,2));
