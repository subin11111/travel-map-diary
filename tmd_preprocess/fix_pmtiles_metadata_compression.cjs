/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const zlib = require("zlib");

const pmtilesPath = process.argv[2];

if (!pmtilesPath) {
  throw new Error("Usage: node tmd_preprocess/fix_pmtiles_metadata_compression.cjs <pmtiles-path>");
}

const input = fs.readFileSync(pmtilesPath);
const header = Buffer.from(input.subarray(0, 127));

if (header.subarray(0, 7).toString("utf8") !== "PMTiles") {
  throw new Error(`Not a PMTiles file: ${pmtilesPath}`);
}

const metadataOffset = Number(header.readBigUInt64LE(24));
const metadataLength = Number(header.readBigUInt64LE(32));
const leafOffset = Number(header.readBigUInt64LE(40));
const leafLength = Number(header.readBigUInt64LE(48));
const tileOffset = Number(header.readBigUInt64LE(56));
const internalCompression = header.readUInt8(97);
const metadata = input.subarray(metadataOffset, metadataOffset + metadataLength);

if (internalCompression !== 2 || (metadata[0] === 0x1f && metadata[1] === 0x8b)) {
  console.log("PMTiles metadata compression is already consistent.");
  process.exit(0);
}

const metadataText = metadata.toString("utf8").replace(/\0+$/g, "");
JSON.parse(metadataText);

const compressedMetadata = zlib.gzipSync(Buffer.from(metadataText, "utf8"), {
  level: 9,
});

if (compressedMetadata.length > metadataLength) {
  throw new Error(
    `Compressed metadata (${compressedMetadata.length}) is larger than reserved metadata section (${metadataLength}).`
  );
}

const delta = metadataLength - compressedMetadata.length;
header.writeBigUInt64LE(BigInt(compressedMetadata.length), 32);
header.writeBigUInt64LE(BigInt(leafOffset - delta), 40);
header.writeBigUInt64LE(BigInt(tileOffset - delta), 56);

const output = Buffer.concat([
  header,
  input.subarray(127, metadataOffset),
  compressedMetadata,
  input.subarray(leafOffset, leafOffset + leafLength),
  input.subarray(tileOffset),
]);

fs.writeFileSync(pmtilesPath, output);

console.log("PMTiles metadata compressed and offsets updated.", {
  pmtilesPath,
  metadataLength,
  compressedMetadataLength: compressedMetadata.length,
  oldSize: input.length,
  newSize: output.length,
});
