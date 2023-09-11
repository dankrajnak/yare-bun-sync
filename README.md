# yare-bun-sync

Compile, bundle, and sync your code to yare using bun!

## Usage

Add this package to your project's devDependencies

```bash
bun install --dev yare-bun-sync
```

Sync via bunx

```bash
bunx yare-bun-sync sync
```

or add a script

```json
{
    //...your package.json
    "scripts" {
        "sync": "bunx yare-bun-sync sync"
    }
}
```

By default, `yare-bun-sync` will use `src/index.ts` as the entrypoint and will watch the `src` directory for changes,
but this can be overridden via the `--file`, and `--watch-dir` arguments respectively.

## Help

Run

```bash
yare-bun-sync help
```

for all options.

---

This project was created using `bun init` in bun v1.0.0. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.
