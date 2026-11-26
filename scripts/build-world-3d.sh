#!/bin/sh
# Bundles the 3D view of «جهانِ هزارآوا» (scripts/world-3d.src.mjs) with Three.js into dist/world/view3d.mjs.
# Needs esbuild and a checkout of three.js (MIT licence) reachable as the package "three":
#   THREE_MODULES=/path/to/node_modules ESBUILD=/path/to/esbuild sh scripts/build-world-3d.sh
# The scene model (dist/world/scene.mjs) stays a separate file that both renderers import.
set -e
cd "$(dirname "$0")/.."
NODE_PATH="${THREE_MODULES:-node_modules}" "${ESBUILD:-esbuild}" scripts/world-3d.src.mjs --bundle --format=esm --minify --target=es2020 \
  --external:./scene.mjs --legal-comments=none --banner:js="/* جهانِ هزارآوا 3D view. Includes three.js (c) 2010-2025 three.js authors, MIT licence. Built from scripts/world-3d.src.mjs */" \
  --outfile=dist/world/view3d.mjs
ls -l dist/world/view3d.mjs
