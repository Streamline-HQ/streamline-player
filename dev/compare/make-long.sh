#!/usr/bin/env bash
# A 40 s HEVC clip with sound for the scenarios that play through a real browser player: dev/compare/make-long.sh [dir].
set -eu
dir=${1:-${MEDIA_DIR:-/tmp/streamline-player}}
ffmpeg -y -v error -f lavfi -i testsrc=d=40:s=640x360:r=24 -f lavfi -i sine=f=440:d=40 \
  -c:v libx265 -pix_fmt yuv420p -preset ultrafast -x265-params log-level=error:keyint=48 -c:a aac -metadata:s:a:0 language=eng \
  "$dir/long.mkv"
