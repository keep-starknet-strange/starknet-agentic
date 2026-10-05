// Prints the arguments this process received as one JSON line, so tests can
// check that spawnServerProcess() delivers every argument unchanged.
process.stdout.write(`${JSON.stringify(process.argv.slice(2))}\n`);
