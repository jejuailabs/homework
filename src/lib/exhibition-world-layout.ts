/** All 25 classmates' works fit in the same room. Additional wings start at 33. */
export const WORLD_WING_CAPACITY = 32;
/** Screen area is approximately four times a regular 2.65 × 1.87 frame. */
export const GALLERY_SCREEN = {width: 6.4, height: 3, outerWidth: 6.75, outerHeight: 4.97, y: 3.4, imageOffsetX: 0, imageOffsetY: 0};

export type WorldWallSlot = {
  x: number;
  y: number;
  z: number;
  rotationY: number;
  wall: "back" | "left" | "right";
};

/** Reserve the same long side for every work; the mat follows the source aspect ratio. */
export function exhibitionFrameSize(width = 3, height = 2) {
  const ratio = Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 ? width / height : 1.5;
  const imageWidth = ratio >= 1 ? 2.05 : 2.05 * ratio;
  const imageHeight = ratio >= 1 ? 2.05 / ratio : 2.05;
  return {imageWidth, imageHeight, width: imageWidth + .35, height: imageHeight + .35, mat: .13, border: .045};
}

export function exhibitionRoomDimensions(count: number) {
  const total = Math.max(0, Math.min(WORLD_WING_CAPACITY, Math.floor(count)));
  const back = Math.min(total, 8);
  const left = Math.ceil((total - back) / 2), right = total - back - left;
  return { width: 28, depth: Math.max(left, right) > 10 ? 22 : 18 };
}

/** Balanced across three walls, with two rows at most and no overlapping frames. */
export function exhibitionWallSlots(count: number): WorldWallSlot[] {
  const total = Math.max(0, Math.min(WORLD_WING_CAPACITY, Math.floor(count)));
  const back = Math.min(total, 8);
  const left = Math.ceil((total - back) / 2);
  const right = total - back - left;
  const room = exhibitionRoomDimensions(total);
  const slots: WorldWallSlot[] = [];
  for (const [wall, amount, maxColumns] of [["back", back, 4], ["left", left, 5], ["right", right, 5]] as const) {
    const columns = amount > maxColumns ? Math.ceil(amount / 2) : amount;
    for (let i = 0; i < amount; i++) {
      const row = Math.floor(i / columns);
      // The central screen remains clear; every slot reserves a portrait or landscape frame.
      const backPositions = [-7.0, 7.0, -10.25, 10.25];
      const position = wall === "back" ? backPositions[i % columns] : (i % columns - (columns - 1) / 2) * 3.25;
      const y = amount > maxColumns ? 1.95 + row * 2.9 : 2.8;
      slots.push({
        x: wall === "back" ? position : wall === "left" ? -room.width / 2 + 0.16 : room.width / 2 - 0.16,
        y,
        z: wall === "back" ? -room.depth / 2 + 0.16 : wall === "left" ? -position : position,
        rotationY: wall === "back" ? 0 : wall === "left" ? Math.PI / 2 : -Math.PI / 2,
        wall,
      });
    }
  }
  return slots;
}

/** A quiet white mat follows the artwork; the monitor never stretches a portrait. */
export function artScreenSize(width=16,height=9,overview=false){const ratio=Number.isFinite(width)&&Number.isFinite(height)&&width>0&&height>0?width/height:16/9;const imageHeight=overview?3:Math.min(4.2,6.4/ratio),imageWidth=overview?6.4:imageHeight*ratio,surfaceHeight=imageHeight+(overview?0:.42);return{imageWidth,imageHeight,surfaceHeight,width:imageWidth+.35,height:surfaceHeight+.35};}
