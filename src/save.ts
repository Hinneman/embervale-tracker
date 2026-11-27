import { decompress } from "fzstd";

const ascii = (bytes: Uint8Array, offset: number, length: number) => String.fromCharCode(...bytes.subarray(offset, offset + length));

// An SV2C container holds the directory offset at 0x28 (plus 40) and the block count at 0x2c.
// Each directory entry is 20 bytes: name offset (relative to the entry), name length, block offset, block size, hash.
// Each block starts with "S2BH". Byte 9 is the zstd flag and the payload starts at byte 14.
function readBlocks(save: Uint8Array): Map<string, () => Uint8Array> {
  const view = new DataView(save.buffer, save.byteOffset, save.byteLength);

  if (save.length < 0x30 || ascii(save, 0, 4) !== "SV2C") {
    throw new Error("This file is not an Enshrouded save. Select a characterN.ksd file.");
  }

  const directoryOffset = view.getUint32(0x28, true) + 40;
  const blockCount = view.getUint32(0x2c, true);
  const blocks = new Map<string, () => Uint8Array>();

  for (let blockIndex = 0; blockIndex < blockCount; blockIndex++) {
    const entryOffset = directoryOffset + 20 * blockIndex;
    const name = ascii(save, entryOffset + view.getUint32(entryOffset, true), view.getUint32(entryOffset + 4, true));
    const blockOffset = view.getUint32(entryOffset + 8, true);
    const block = save.subarray(blockOffset, blockOffset + view.getUint32(entryOffset + 12, true));

    // Payloads are read only when asked for, because some are large.
    blocks.set(name, () => {
      if (ascii(block, 0, 4) !== "S2BH") {
        throw new Error(`The save is damaged: its ${name} block has no S2BH header.`);
      }
      return block[9] === 1 ? decompress(block.subarray(14)) : block.subarray(14);
    });
  }

  return blocks;
}

// The player_knowledge payload is: u32 state, u32 count, count ids, count values.
export function readKnowledge(save: Uint8Array): Set<number> {
  const knowledge = readBlocks(save).get("player_knowledge");
  if (!knowledge) {
    throw new Error("This file holds no character knowledge. It can be a world save. Select characterN.ksd.");
  }

  const payload = knowledge();
  const payloadView = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const idCount = payloadView.getUint32(4, true);
  if (payload.length !== 8 + 8 * idCount) {
    throw new Error("The save is damaged: its knowledge block has an unexpected size.");
  }

  return new Set(Array.from({ length: idCount }, (_, idIndex) => payloadView.getUint32(8 + 4 * idIndex, true)));
}

// The explored map: one byte per cell, from 0 (in fog) to 255 (explored), with soft edges in between.
// Row 0 is the north edge of the world, unlike the game's biome map, where row 0 is the south edge.
export type FogMap = {
  size: number;
  cells: Uint8Array;
};

const fogHeaderLength = 13;

// The fogofwar payload is a 13-byte header with the tag "FGOW" at byte 8, then a square grid of cells.
// Saves from before the fog was stored, and trimmed saves, have no fogofwar block.
export function readFog(save: Uint8Array): FogMap | null {
  const fog = readBlocks(save).get("fogofwar");
  if (!fog) {
    return null;
  }

  const payload = fog();
  const size = Math.sqrt(payload.length - fogHeaderLength);
  if (ascii(payload, 8, 4) !== "FGOW" || !Number.isInteger(size)) {
    return null;
  }

  return {
    size,
    cells: payload.subarray(fogHeaderLength),
  };
}
