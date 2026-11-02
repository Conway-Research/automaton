import fs from "node:fs";

/** Bounded local reads; no URL resolution, evaluation or external lookup. */
export function readBounded(file: string, max: number): Buffer {
  const fd = fs.openSync(file, "r");
  try {
    const info = fs.fstatSync(fd);
    if (!info.isFile() || info.size > max || info.size === 0) throw new Error("Invalid input file size/type");
    const buffer = Buffer.alloc(info.size);
    let read = 0;
    while (read < buffer.length) {
      const n = fs.readSync(fd, buffer, read, buffer.length - read, read);
      if (!n) throw new Error("Input file changed during read");
      read += n;
    }
    const after = fs.fstatSync(fd);
    if (after.size !== info.size || after.mtimeMs !== info.mtimeMs) throw new Error("Input file changed during read");
    return buffer;
  } finally { fs.closeSync(fd); }
}
