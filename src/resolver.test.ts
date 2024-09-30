import { describe, it } from "node:test";
import Assert from "node:assert";
import { resolveModule } from "./resolver.js";

import { Volume, createFsFromVolume } from "memfs";

describe("Resolver", () => {
  it("does resolve relative files", () => {
    const vol = Volume.fromJSON({
      "/folder/module.js": "",
    });

    const result = resolveModule(
      "./module.js",
      "/folder/file",
      createFsFromVolume(vol) as any,
    );

    Assert.deepEqual(result, [
      {
        isFile: true,
        path: "/folder/module.js",
      },
    ]);
  });

  it("does resolve (relative) typescript files", () => {
    const vol = Volume.fromJSON({
      "/folder/module.ts": "",
    });

    const result = resolveModule(
      "./module.js",
      "/folder/file.ts",
      createFsFromVolume(vol) as any,
    );

    Assert.deepEqual(result, [
      {
        isFile: true,
        path: "/folder/module.ts",
      },
    ]);
  });

  it("does throw error on unresolved relative imports", () => {
    const vol = Volume.fromJSON({});

    try {
      resolveModule(
        "./module.js",
        "/folder/file.ts",
        createFsFromVolume(vol) as any,
      );
    } catch (err) {
      Assert.ok(err instanceof Error);
      Assert.equal(
        err.message,
        `Cannot find package './module.js' from '/folder/file.ts'`,
      );
    }
  });

  it("does resolve packages with index file", () => {
    const vol = Volume.fromJSON({
      "/folder/node_modules/tool/index.js": JSON.stringify({}),
    });

    const result = resolveModule(
      "tool",
      "/folder/file",
      createFsFromVolume(vol) as any,
    );

    Assert.deepEqual(result, [
      {
        isFile: true,
        path: "/folder/node_modules/tool/index.js",
      },
    ]);
  });

  it("does resolve packages with package.json main entry", () => {
    const vol = Volume.fromJSON({
      "/folder/node_modules/tool/package.json": JSON.stringify({
        main: "dist/index.js",
      }),
    });

    const result = resolveModule(
      "tool",
      "/folder/file",
      createFsFromVolume(vol) as any,
    );

    Assert.deepEqual(result, [
      {
        isFile: false,
        path: "/folder/node_modules/tool/package.json",
      },
      {
        isFile: true,
        path: "/folder/node_modules/tool/dist/index.js",
      },
    ]);
  });

  it("does resolve packages with package.json simple export map", () => {
    const vol = Volume.fromJSON({
      "/folder/node_modules/tool/package.json": JSON.stringify({
        exports: {
          ".": "./dist/index.js",
        },
      }),
    });

    const result = resolveModule(
      "tool",
      "/folder/file",
      createFsFromVolume(vol) as any,
    );

    Assert.deepEqual(result, [
      {
        isFile: false,
        path: "/folder/node_modules/tool/package.json",
      },
      {
        isFile: true,
        path: "/folder/node_modules/tool/dist/index.js",
      },
    ]);
  });

  it("does resolve packages with package.json export map and default kind", () => {
    const vol = Volume.fromJSON({
      "/folder/node_modules/tool/package.json": JSON.stringify({
        exports: {
          ".": {
            import: {
              types: "./dist/index.d.ts",
              default: "./dist/index.js",
            },
          },
        },
      }),
    });

    const result = resolveModule(
      "tool",
      "/folder/file",
      createFsFromVolume(vol) as any,
    );

    Assert.deepEqual(result, [
      {
        isFile: false,
        path: "/folder/node_modules/tool/package.json",
      },
      {
        isFile: true,
        path: "/folder/node_modules/tool/dist/index.js",
      },
    ]);
  });

  it("does throw an error on unresolved imports", () => {
    const vol = Volume.fromJSON({});

    try {
      resolveModule("tool", "/folder/file", createFsFromVolume(vol) as any);
    } catch (err) {
      Assert.ok(err instanceof Error);
      Assert.equal(
        err.message,
        `Cannot find package 'tool' from '/folder/file'`,
      );
    }
  });

  it("does throw an error on invalid (no package.json and no index file)", () => {
    const vol = Volume.fromJSON({});
    vol.mkdirSync("/folder/node_modules/tool", { recursive: true });

    try {
      resolveModule("tool", "/folder/file", createFsFromVolume(vol) as any);
    } catch (err) {
      Assert.ok(err instanceof Error);
      Assert.equal(
        err.message,
        `Cannot find package 'tool' from '/folder/file'`,
      );
    }
  });

  it("does resolve symbolic links", () => {
    const vol = Volume.fromJSON({
      "/folder/node_modules/tool@123/index.js": "",
    });
    vol.symlinkSync(
      "/folder/node_modules/tool@123",
      "/folder/node_modules/tool",
    );

    const result = resolveModule(
      "tool",
      "/folder/file",
      createFsFromVolume(vol) as any,
    );

    Assert.deepEqual(result, [
      {
        isFile: false,
        path: "/folder/node_modules/tool",
      },
      {
        isFile: true,
        path: "/folder/node_modules/tool@123/index.js",
      },
    ]);
  });

  it("does resolve deep imports with export map", () => {
    const vol = Volume.fromJSON({
      "/folder/node_modules/tool/package.json": JSON.stringify({
        exports: {
          "./some": "./dist/index.js",
        },
      }),
      "/folder/node_modules/tool/dist/index.js": "",
    });

    const result = resolveModule(
      "tool/some",
      "/folder/file",
      createFsFromVolume(vol) as any,
    );

    Assert.deepEqual(result, [
      {
        isFile: false,
        path: "/folder/node_modules/tool/package.json",
      },
      {
        isFile: true,
        path: "/folder/node_modules/tool/dist/index.js",
      },
    ]);
  });

  it("does resolve scoped packages", () => {
    const vol = Volume.fromJSON({
      "/folder/node_modules/@scope/tool/index.js": JSON.stringify({}),
    });

    const result = resolveModule(
      "@scope/tool",
      "/folder/file",
      createFsFromVolume(vol) as any,
    );

    Assert.deepEqual(result, [
      {
        isFile: true,
        path: "/folder/node_modules/@scope/tool/index.js",
      },
    ]);
  });
});
