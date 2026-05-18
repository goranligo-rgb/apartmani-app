// Generator brand ikona iz public/icon/icon.jpeg.
//
// Izlazi:
//   app/icon.png         (32×32)   — browser tab favicon (Next.js auto pick-up)
//   app/apple-icon.png   (180×180) — iPhone Home Screen (Next.js auto pick-up)
//   public/icon-192.png  (192×192) — PWA manifest
//   public/icon-512.png  (512×512) — PWA manifest
//   app/favicon.ico      (multi-size 16+32+48) — legacy browser fallback
//
// Re-pokretanje (npr. ako se ažurira izvorni icon.jpeg):
//   npx tsx scripts/generate-icons.ts

import sharp from "sharp";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const SRC = path.resolve("public/icon/icon.jpeg");

async function genPng(size: number, outPath: string): Promise<void> {
  await sharp(SRC).resize(size, size, { fit: "cover" }).png().toFile(outPath);
  const meta = await sharp(outPath).metadata();
  console.log(`  ${outPath} → ${meta.width}×${meta.height} px (${meta.size} B)`);
}

// Sharp nema native ICO output. ICO je jednostavan binarni container:
//   ICONDIR (6 B) + N × ICONDIRENTRY (16 B) + N × PNG payload
async function genIco(outPath: string, sizes: number[]): Promise<void> {
  const buffers = await Promise.all(
    sizes.map((s) => sharp(SRC).resize(s, s, { fit: "cover" }).png().toBuffer()),
  );

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type = ICO
  header.writeUInt16LE(sizes.length, 4); // count

  const entrySize = 16;
  let offset = 6 + entrySize * sizes.length;
  const entries = sizes.map((size, i) => {
    const entry = Buffer.alloc(entrySize);
    entry.writeUInt8(size === 256 ? 0 : size, 0); // width (0 znači 256)
    entry.writeUInt8(size === 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // colors u paleti (0 = bez palete)
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bpp
    entry.writeUInt32LE(buffers[i].length, 8); // dataSize
    entry.writeUInt32LE(offset, 12); // dataOffset
    offset += buffers[i].length;
    return entry;
  });

  const ico = Buffer.concat([header, ...entries, ...buffers]);
  await fs.writeFile(outPath, ico);
  console.log(`  ${outPath} → multi-size [${sizes.join(", ")}] (${ico.length} B)`);
}

async function main() {
  console.log(`Izvor: ${SRC}`);
  const srcMeta = await sharp(SRC).metadata();
  console.log(`  ${srcMeta.width}×${srcMeta.height} px, format=${srcMeta.format}`);
  console.log("");
  console.log("Generiram:");

  await genPng(32, "app/icon.png");
  await genPng(180, "app/apple-icon.png");
  await genPng(192, "public/icon-192.png");
  await genPng(512, "public/icon-512.png");
  await genIco("app/favicon.ico", [16, 32, 48]);

  console.log("");
  console.log("Gotovo.");
}

main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
