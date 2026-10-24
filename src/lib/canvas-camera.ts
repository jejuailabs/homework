export type CanvasCamera={x:number;y:number;z:number};
export type CanvasSize={width:number;height:number};
export type CanvasBox={x:number;y:number;w:number;h:number};
export const CANVAS_WORLD_LIMIT=1_000_000;
export const CANVAS_ZOOM_MIN=.0001,CANVAS_ZOOM_MAX=128;
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
export function cleanCamera(value:CanvasCamera):CanvasCamera{return{x:clamp(Number.isFinite(value.x)?value.x:0,-CANVAS_WORLD_LIMIT,CANVAS_WORLD_LIMIT),y:clamp(Number.isFinite(value.y)?value.y:0,-CANVAS_WORLD_LIMIT,CANVAS_WORLD_LIMIT),z:clamp(Number.isFinite(value.z)?value.z:1,CANVAS_ZOOM_MIN,CANVAS_ZOOM_MAX)};}
export function cameraPoint(camera:CanvasCamera,x:number,y:number){return{x:camera.x+x/camera.z,y:camera.y+y/camera.z};}
/** Keep the world point under the pointer stationary when zooming. */
export function zoomCamera(camera:CanvasCamera,requested:number,x:number,y:number){const z=cleanCamera({...camera,z:requested}).z,anchor=cameraPoint(camera,x,y);return cleanCamera({x:anchor.x-x/z,y:anchor.y-y/z,z});}
export function panCamera(camera:CanvasCamera,dx:number,dy:number){return cleanCamera({...camera,x:camera.x-dx/camera.z,y:camera.y-dy/camera.z});}
export function fitCamera(box:CanvasBox,size:CanvasSize,padding=48){const width=Math.max(1,size.width-padding*2),height=Math.max(1,size.height-padding*2),z=clamp(Math.min(width/Math.max(1,box.w),height/Math.max(1,box.h)),CANVAS_ZOOM_MIN,Math.min(2,CANVAS_ZOOM_MAX));return cleanCamera({x:box.x+box.w/2-size.width/(2*z),y:box.y+box.h/2-size.height/(2*z),z});}
export function cameraBox(camera:CanvasCamera,size:CanvasSize):CanvasBox{return{x:camera.x,y:camera.y,w:size.width/camera.z,h:size.height/camera.z};}
export function intersectsCamera(a:CanvasBox,b:CanvasBox,padding=0){return a.x+a.w>=b.x-padding&&a.x<=b.x+b.w+padding&&a.y+a.h>=b.y-padding&&a.y<=b.y+b.h+padding;}
