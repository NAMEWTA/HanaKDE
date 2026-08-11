function response(status) {
  const body = Buffer.alloc(22);
  body.write("HSF1", 0, "ascii");
  body.writeUInt8(1, 4);
  body.writeUInt8(status, 5);
  const frame = Buffer.alloc(4 + body.byteLength);
  frame.writeUInt32BE(body.byteLength, 0);
  body.copy(frame, 4);
  process.stdout.write(frame);
}

process.stdin.resume();
process.stdin.once("end", () => response(3));
