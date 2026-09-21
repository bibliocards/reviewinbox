#!/bin/sh
set -eu

asset_dir="${NGINX_ENVSUBST_OUTPUT_DIR:-/usr/share/nginx/html}"
cp "$asset_dir/ngsw.json.build" "$asset_dir/ngsw.json"

# envsubst runs at step 20. Keep Angular's integrity hashes aligned with
# the resulting bundles, starting from the build manifest on every restart.
for template in "$asset_dir"/*.js.template; do
  [ -f "$template" ] || continue
  original_hash=$(sha1sum "$template" | cut -d ' ' -f 1)
  runtime_hash=$(sha1sum "${template%.template}" | cut -d ' ' -f 1)
  if [ "$original_hash" != "$runtime_hash" ]; then
    sed "s/\"$original_hash\"/\"$runtime_hash\"/g" "$asset_dir/ngsw.json" > "$asset_dir/ngsw.json.tmp"
    mv "$asset_dir/ngsw.json.tmp" "$asset_dir/ngsw.json"
  fi
done
