process.stdin.resume();
process.stdin.once("end", () => {
  process.stdout.write(Buffer.from([0, 0, 0, 24, 0]));
});
