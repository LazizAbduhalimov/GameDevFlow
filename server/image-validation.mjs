const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const GIF87A = Buffer.from('GIF87a');
const GIF89A = Buffer.from('GIF89a');
const BMP = Buffer.from('BM');

export function detectRasterImage(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer.subarray(0, 8).equals(PNG)) return { extension: '.png', mediaType: 'image/png' };
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { extension: '.jpg', mediaType: 'image/jpeg' };
  if (buffer.subarray(0, 6).equals(GIF87A) || buffer.subarray(0, 6).equals(GIF89A)) return { extension: '.gif', mediaType: 'image/gif' };
  if (buffer.subarray(0, 2).equals(BMP)) return { extension: '.bmp', mediaType: 'image/bmp' };
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return { extension: '.webp', mediaType: 'image/webp' };
  }
  return null;
}

// Checks the PNG container only. It deliberately does not try to infer a
// silhouette from pixels: this is a native-transparency gate, not background
// removal.
export function hasPngTransparency(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 33 || !buffer.subarray(0, 8).equals(PNG)) return false;
  const colorType = buffer[25];
  if (colorType === 4 || colorType === 6) return true;
  let offset = 8;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const typeStart = offset + 4;
    const dataStart = offset + 8;
    const next = dataStart + length + 4;
    if (next > buffer.length) return false;
    const type = buffer.toString('ascii', typeStart, typeStart + 4);
    if (type === 'tRNS') {
      if (colorType !== 3) return true;
      return buffer.subarray(dataStart, dataStart + length).some((alpha) => alpha < 255);
    }
    if (type === 'IEND') return false;
    offset = next;
  }
  return false;
}
