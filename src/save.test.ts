import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

import { flameLocations, locations } from "./locations.ts";
import { readCharacter, readFog, readKnowledge } from "./save.ts";

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

// Builds an SV2C save with uncompressed blocks, laid out as readBlocks expects:
// the header, the directory entries, the block names, then the blocks.
function saveWithBlocks(blocks: Record<string, Uint8Array>): Uint8Array {
  const headerLength = 0x30;
  const entryLength = 20;
  const entries = Object.entries(blocks);
  const namesOffset = headerLength + entryLength * entries.length;
  const blocksOffset = namesOffset + entries.reduce((total, [name]) => total + name.length, 0);
  const save = new Uint8Array(blocksOffset + entries.reduce((total, [, payload]) => total + 14 + payload.length, 0));
  const view = new DataView(save.buffer);
  const writeAscii = (offset: number, text: string) =>
    save.set(
      [...text].map((character) => character.charCodeAt(0)),
      offset,
    );

  writeAscii(0, "SV2C");
  view.setUint32(0x28, headerLength - 40, true);
  view.setUint32(0x2c, entries.length, true);

  let nameOffset = namesOffset;
  let blockOffset = blocksOffset;
  entries.forEach(([name, payload], blockIndex) => {
    const entryOffset = headerLength + entryLength * blockIndex;
    view.setUint32(entryOffset, nameOffset - entryOffset, true);
    view.setUint32(entryOffset + 4, name.length, true);
    view.setUint32(entryOffset + 8, blockOffset, true);
    view.setUint32(entryOffset + 12, 14 + payload.length, true);
    writeAscii(nameOffset, name);
    writeAscii(blockOffset, "S2BH");
    save.set(payload, blockOffset + 14);
    nameOffset += name.length;
    blockOffset += 14 + payload.length;
  });

  return save;
}

const saveWithBlock = (name: string, payload: Uint8Array) => saveWithBlocks({ [name]: payload });

function characterData(name: string): Uint8Array {
  const bytes = new TextEncoder().encode(name);
  const payload = new Uint8Array(9 + bytes.length + 4);
  new DataView(payload.buffer).setUint32(5, bytes.length, true);
  payload.set(bytes, 9);
  return payload;
}

function playerCharacter(level: number): Uint8Array {
  const payload = new Uint8Array(0x60);
  new DataView(payload.buffer).setUint32(0x3a, level, true);
  return payload;
}

describe("readCharacter", () => {
  test("NameAndLevel", () => {
    const save = saveWithBlocks({
      character_data: characterData("Milana"),
      player_character: playerCharacter(45),
    });

    expect(readCharacter(save)).toEqual({ name: "Milana", level: 45 });
  });

  test("NonAsciiName", () => {
    expect(readCharacter(saveWithBlock("character_data", characterData("Åsa")))).toEqual({ name: "Åsa", level: null });
  });

  test("ImplausibleLevel", () => {
    expect(readCharacter(saveWithBlock("player_character", playerCharacter(70000))).level).toBeNull();
    expect(readCharacter(saveWithBlock("player_character", playerCharacter(0))).level).toBeNull();
  });

  test("DamagedNameLength", () => {
    const payload = characterData("Nami");
    new DataView(payload.buffer).setUint32(5, 500, true);

    expect(readCharacter(saveWithBlock("character_data", payload)).name).toBeNull();
  });

  test("SaveWithoutCharacterBlocks", async () => {
    const save = await readFile(new URL("character0.ksd", fixtures));

    expect(readCharacter(save)).toEqual({ name: null, level: null });
  });
});

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
