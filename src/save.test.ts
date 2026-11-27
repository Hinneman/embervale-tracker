import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

import { flameLocations, locations } from "./locations.ts";
import { readFog, readKnowledge } from "./save.ts";

const fixtures = new URL("fixtures/", import.meta.url);

// Knowledge ids of the flame shrines found in fixtures/character0.ksd.
const expectedFoundIds = [
  62057186, 98744454, 165320110, 298017050, 300749593, 474159492, 506394430, 563774187, 601551183, 654257561, 780194091, 795911939, 805046254, 933247311,
  998467702, 1165517057, 1300199041, 1302557524, 1409075416, 1504051331, 1864446768, 1934786452, 2006844891, 2086262577, 2298824156, 2312230310, 2363930928,
  2680496851, 2847136040, 2909259168, 2979201379, 3040022919, 3079831042, 3090900730, 3134136988, 3177880864, 3204653507, 3237784541, 3291487762, 3360510043,
  3447418605, 3477110730, 3694994425, 3729720625, 3835884090, 3900914039, 3961375235, 4124619577, 4269520231, 4287852732,
];

// The character in fixtures/character0.ksd has activated all 8 Ancient Spires.
const expectedSpireIds = [44169957, 923286397, 1559870974, 2867992476, 3605729000, 3726514941, 3859989218, 3976707756];

const foundIn = (knowledgeIds: Set<number>, targets: typeof locations) =>
  targets
    .map((location) => location.knowledgeId)
    .filter((knowledgeId) => knowledgeIds.has(knowledgeId))
    .toSorted((first, second) => first - second);

describe("readKnowledge", () => {
  test("CharacterSave", async () => {
    const save = await readFile(new URL("character0.ksd", fixtures));

    expect(foundIn(readKnowledge(save), flameLocations)).toEqual(expectedFoundIds);
  });

  test("CharacterSaveSpires", async () => {
    const save = await readFile(new URL("character0.ksd", fixtures));
    const spires = locations.filter((location) => location.kind === "spire");

    expect(foundIn(readKnowledge(save), spires)).toEqual(expectedSpireIds);
  });

  test("NotASave", () => {
    expect(() => readKnowledge(new Uint8Array(64))).toThrow(new Error("This file is not an Enshrouded save. Select a characterN.ksd file."));
  });

  test("WorldSave", async () => {
    const save = await readFile(new URL("world5.ksd", fixtures));

    expect(() => readKnowledge(save)).toThrow(new Error("This file holds no character knowledge. It can be a world save. Select characterN.ksd."));
  });
});

// Builds an SV2C save with one uncompressed block, laid out as readBlocks expects.
function saveWithBlock(name: string, payload: Uint8Array): Uint8Array {
  const headerLength = 0x30;
  const entryLength = 20;
  const blockOffset = headerLength + entryLength + name.length;
  const save = new Uint8Array(blockOffset + 14 + payload.length);
  const view = new DataView(save.buffer);
  const writeAscii = (offset: number, text: string) =>
    save.set(
      [...text].map((character) => character.charCodeAt(0)),
      offset,
    );

  writeAscii(0, "SV2C");
  view.setUint32(0x28, headerLength - 40, true);
  view.setUint32(0x2c, 1, true);
  view.setUint32(headerLength, entryLength, true);
  view.setUint32(headerLength + 4, name.length, true);
  view.setUint32(headerLength + 8, blockOffset, true);
  view.setUint32(headerLength + 12, 14 + payload.length, true);
  writeAscii(headerLength + entryLength, name);
  writeAscii(blockOffset, "S2BH");
  save.set(payload, blockOffset + 14);
  return save;
}

describe("readFog", () => {
  test("SaveWithoutFog", async () => {
    const save = await readFile(new URL("character0.ksd", fixtures));

    expect(readFog(save)).toBeNull();
  });

  test("SaveWithFog", () => {
    const size = 4;
    const payload = new Uint8Array(13 + size * size);
    payload.set(
      [..."FGOW"].map((character) => character.charCodeAt(0)),
      8,
    );
    payload[13 + 5] = 255;

    const fog = readFog(saveWithBlock("fogofwar", payload));

    expect(fog?.size).toBe(size);
    expect(fog?.cells[5]).toBe(255);
    expect(fog?.cells[0]).toBe(0);
  });
});
