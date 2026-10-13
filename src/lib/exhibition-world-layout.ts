/** All 25 classmates' works fit in the same room. Additional wings start at 33. */
export const WORLD_WING_CAPACITY = 32;

export type WorldWallSlot = {
  x: number;
  y: number;
  z: number;
  rotationY: number;
  wall: "back" | "left" | "right";
};

export function exhibitionRoomDimensions(count: number) {
  const total = Math.max(0, Math.min(WORLD_WING_CAPACITY, Math.floor(count)));
  const back = total <= 6 ? total : Math.min(12, Math.ceil(total * 0.375));
  const left = Math.ceil((total - back) / 2), right = total - back - left;
  const backColumns = back > 6 ? Math.ceil(back / 2) : back;
  const columns = (amount: number) => amount > 5 ? Math.ceil(amount / 2) : amount;
  const sideColumns = Math.max(columns(left), columns(right));
  return { width: backColumns > 5 ? 22 : 18, depth: sideColumns > 4 ? 18 : 14 };
}

/** Balanced across three walls, with two rows at most and no overlapping frames. */
export function exhibitionWallSlots(count: number): WorldWallSlot[] {
  const total = Math.max(0, Math.min(WORLD_WING_CAPACITY, Math.floor(count)));
  const back = total <= 6 ? total : Math.min(12, Math.ceil(total * 0.375));
  const left = Math.ceil((total - back) / 2);
  const right = total - back - left;
  const room = exhibitionRoomDimensions(total);
  const slots: WorldWallSlot[] = [];
  for (const [wall, amount, maxColumns] of [["back", back, 6], ["left", left, 5], ["right", right, 5]] as const) {
    const columns = amount > maxColumns ? Math.ceil(amount / 2) : amount;
    for (let i = 0; i < amount; i++) {
      const row = Math.floor(i / columns);
      const position = (i % columns - (columns - 1) / 2) * 3.25;
      const y = amount > maxColumns ? 2.08 + row * 2.25 : 2.8;
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
