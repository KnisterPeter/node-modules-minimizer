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

  it("does resolve absolute files", () => {
    const vol = Volume.fromJSON({
      "/folder/module.js": "",
    });

    const result = resolveModule(
      "/folder/module.js",
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
      "/folder/node_modules/tool/dist/index.js": "",
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

  it("does resolve file entry from export map", () => {
    const vol = Volume.fromJSON({
      "/folder/node_modules/tool/package.json": JSON.stringify({
        exports: "./dist/index.js",
      }),
      "/folder/node_modules/tool/dist/index.js": "",
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

  it("does resolve package-name entry from export map", () => {
    const vol = Volume.fromJSON({
      "/folder/node_modules/tool/package.json": JSON.stringify({
        exports: {
          ".": "./dist/index.js",
        },
      }),
      "/folder/node_modules/tool/dist/index.js": "",
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

  it("does resolve subpath import entry from export map", () => {
    const vol = Volume.fromJSON({
      "/folder/node_modules/tool/package.json": JSON.stringify({
        exports: {
          "./deep": "./dist/deep/index.js",
        },
      }),
      "/folder/node_modules/tool/dist/deep/index.js": "",
    });

    const result = resolveModule(
      "tool/deep",
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
        path: "/folder/node_modules/tool/dist/deep/index.js",
      },
    ]);
  });

  it("does resolve conditional export entry from export map", () => {
    const vol = Volume.fromJSON({
      "/folder/node_modules/tool/package.json": JSON.stringify({
        type: "module",
        exports: {
          import: "./dist/index.js",
          require: "./dist/index.cjs",
        },
      }),
      "/folder/node_modules/tool/dist/index.js": "",
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

  it("does resolve conditional export (order check) entry from export map", () => {
    const vol = Volume.fromJSON({
      "/folder/node_modules/tool/package.json": JSON.stringify({
        type: "module",
        exports: {
          require: "./dist/index.cjs",
          import: "./dist/index.js",
        },
      }),
      "/folder/node_modules/tool/dist/index.js": "",
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

  it("does resolve conditional export (default) entry from export map", () => {
    const vol = Volume.fromJSON({
      "/folder/node_modules/tool/package.json": JSON.stringify({
        type: "module",
        exports: {
          require: "./dist/index.cjs",
          default: "./dist/index.js",
        },
      }),
      "/folder/node_modules/tool/dist/index.js": "",
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

  it("does resolve conditional export (default order) entry from export map", () => {
    const vol = Volume.fromJSON({
      "/folder/node_modules/tool/package.json": JSON.stringify({
        type: "module",
        exports: {
          default: "./dist/index.js",
          import: "./dist/index.mjs",
        },
      }),
      "/folder/node_modules/tool/dist/index.js": "",
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

  it("does resolve conditional export (default order) entry from export map", () => {
    const vol = Volume.fromJSON({
      "/folder/node_modules/tool/package.json": JSON.stringify({
        type: "module",
        exports: {
          "./deep": {
            import: "./dist/index.mjs",
            default: "./dist/index.js",
          },
        },
      }),
      "/folder/node_modules/tool/dist/index.mjs": "",
    });

    const result = resolveModule(
      "tool/deep",
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
        path: "/folder/node_modules/tool/dist/index.mjs",
      },
    ]);
  });

  it("does resolve conditional export (nested default) entry from export map", () => {
    const vol = Volume.fromJSON({
      "/folder/node_modules/tool/package.json": JSON.stringify({
        type: "module",
        exports: {
          "./deep": {
            node: {
              require: "./dist/index.cjs",
            },
            default: "./dist/index.js",
          },
        },
      }),
      "/folder/node_modules/tool/dist/index.js": "",
    });

    const result = resolveModule(
      "tool/deep",
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

  it("does resolve modules without file extension", () => {
    const vol = Volume.fromJSON({
      "/folder/other.js": "",
    });

    const result = resolveModule(
      "./other",
      "/folder/file",
      createFsFromVolume(vol) as any,
    );

    Assert.deepEqual(result, [
      {
        isFile: true,
        path: "/folder/other.js",
      },
    ]);
  });

  it("does resolve modules from directory names", () => {
    const vol = Volume.fromJSON({
      "/folder/other/index.js": "",
    });

    const result = resolveModule(
      "./other",
      "/folder/file",
      createFsFromVolume(vol) as any,
    );

    Assert.deepEqual(result, [
      {
        isFile: true,
        path: "/folder/other/index.js",
      },
    ]);
  });

  it("does resolve deep imports without export map", () => {
    const vol = Volume.fromJSON({
      "/folder/node_modules/other/package.json": JSON.stringify({}),
      "/folder/node_modules/other/dist/index.js": "",
    });

    const result = resolveModule(
      "other/dist/index",
      "/folder/file",
      createFsFromVolume(vol) as any,
    );

    Assert.deepEqual(result, [
      {
        isFile: false,
        path: "/folder/node_modules/other/package.json",
      },
      {
        isFile: true,
        path: "/folder/node_modules/other/dist/index.js",
      },
    ]);
  });
});
