import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const directory = await mkdtemp(
  join(process.cwd(), "node_modules/.drawscii-tests-"),
);
try {
  const outfile = join(directory, "regressions.cjs");
  await build({
    entryPoints: ["tests/regressions.ts"],
    outfile,
    bundle: true,
    platform: "node",
    format: "cjs",
  });
  await build({
    entryPoints: ["tests/interactions.tsx"],
    outfile: join(directory, "interactions.cjs"),
    bundle: true,
    packages: "external",
    platform: "node",
    format: "cjs",
  });
  const result = spawnSync(
    process.execPath,
    ["--test", outfile, join(directory, "interactions.cjs")],
    { stdio: "inherit" },
  );
  process.exitCode = result.status ?? 1;
} finally {
  await rm(directory, { recursive: true, force: true });
}
