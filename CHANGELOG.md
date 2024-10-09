# node-modules-minimizer

## 0.7.0

### Minor Changes

- 920fcb6: Handle optional (unlisted) dependencies

### Patch Changes

- b5f5d59: Use loop instead of recursion
- da485d2: Remove log output

## 0.6.0

### Minor Changes

- 4801e46: Add heuristic for optional imports/requires

## 0.5.1

### Patch Changes

- 109337a: Fix package.json without main or module entry resolution

## 0.5.0

### Minor Changes

- 6cc40d5: Resolve directory indexes

## 0.4.0

### Minor Changes

- fd88727: Allow requires without file extension

## 0.3.0

### Minor Changes

- 3e06d56: Support for commonjs require imports

## 0.2.2

### Patch Changes

- 93d7c8f: Fix absolute modules

## 0.2.1

### Patch Changes

- 72ac22d: Resolve symlinks in more cases
- 72ac22d: Fix absolute files

## 0.2.0

### Minor Changes

- f7b59c9: Entrypoints are optional

## 0.1.2

### Patch Changes

- 0768eb4: Reimplement export map resolution

## 0.1.1

### Patch Changes

- f989a8b: Remove invalid access while resolving export maps

## 0.1.0

### Minor Changes

- 82e36dd: Support @scope/name resolution

## 0.0.2

### Patch Changes

- 7b8ee15: Import ts-blank-space from source

  This ensures that the import is resolved from the tools installation
  instead of the current directory.
