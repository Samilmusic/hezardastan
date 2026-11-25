#!/bin/sh
# Compare the vendored MediaPipe runtime with the official npm package. Needs npm access.
set -e
tmp=$(mktemp -d); cd "$tmp"
npm pack @mediapipe/tasks-vision@0.10.18 >/dev/null && tar xzf mediapipe-tasks-vision-0.10.18.tgz
root=$(cd "$(dirname "$0")/.." && pwd)/dist/air/vendor/mediapipe
status=0
for f in vision_bundle.mjs wasm/vision_wasm_internal.js wasm/vision_wasm_internal.wasm wasm/vision_wasm_nosimd_internal.js wasm/vision_wasm_nosimd_internal.wasm; do
  if cmp -s "package/$f" "$root/$f"; then echo "OK   $f"; else echo "DIFF $f"; status=1; fi
done
exit $status
