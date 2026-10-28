#!/bin/sh
# Builds dist/ruler.zip (a ruler/ folder with only the files the extension loads).
# The name stays the same across versions so the README can link to the latest release's download.
set -eu
cd "$(dirname "$0")/.."

version=$(sed -n 's/^  "version": "\(.*\)",$/\1/p' manifest.json)
[ -n "$version" ] || { echo "No version found in manifest.json" >&2; exit 1; }

stage="dist/ruler"
rm -rf dist
mkdir -p "$stage"
cp -R manifest.json background.js content.js popup.html popup.js icons "$stage/"
(cd dist && zip -qrX ruler.zip ruler)
rm -rf "$stage"
echo "Built dist/ruler.zip (v$version)"
