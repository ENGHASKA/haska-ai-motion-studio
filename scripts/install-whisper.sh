#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
DOWNLOAD_DIR="$ROOT_DIR/downloads"
CMAKE_ROOT_DIR="$ROOT_DIR/tools/cmake-root"
SOURCE_DIR="$ROOT_DIR/tools/whisper.cpp"
MODEL_DIR="$ROOT_DIR/tools/whisper-models"
VERSION="v1.9.5"
MODEL="small"
MODEL_SHA1="55356645c2b361a969dfd0ef2c5a50d530afd8d5"

mkdir -p "$DOWNLOAD_DIR" "$CMAKE_ROOT_DIR" "$MODEL_DIR" "$ROOT_DIR/tools"

if [[ ! -x "$CMAKE_ROOT_DIR/usr/bin/cmake" || ! -f "$CMAKE_ROOT_DIR/usr/lib/x86_64-linux-gnu/librhash.so.1" ]]; then
  echo "Downloading Kali cmake packages for project-local extraction (no system install)..."
  (
    cd "$DOWNLOAD_DIR"
    apt download cmake cmake-data librhash1
  )
  for package in "$DOWNLOAD_DIR"/cmake_*.deb "$DOWNLOAD_DIR"/cmake-data_*.deb "$DOWNLOAD_DIR"/librhash1_*.deb; do
    dpkg-deb -x "$package" "$CMAKE_ROOT_DIR"
  done
fi

CMAKE_BIN="$CMAKE_ROOT_DIR/usr/bin/cmake"
CMAKE_DATA="$(find "$CMAKE_ROOT_DIR/usr/share" -maxdepth 1 -type d -name 'cmake-*' | sort -V | tail -n 1)"
if [[ ! -x "$CMAKE_BIN" || -z "$CMAKE_DATA" ]]; then
  echo "Could not prepare project-local CMake." >&2
  exit 1
fi

if [[ ! -d "$SOURCE_DIR/.git" ]]; then
  echo "Cloning reviewed whisper.cpp release $VERSION..."
  git clone --depth 1 --branch "$VERSION" https://github.com/ggml-org/whisper.cpp.git "$SOURCE_DIR"
fi

export CMAKE_ROOT="$CMAKE_DATA"
export LD_LIBRARY_PATH="$CMAKE_ROOT_DIR/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
BUILD_DIR="$SOURCE_DIR/build-cpu"

if command -v nvcc >/dev/null 2>&1 && command -v g++-13 >/dev/null 2>&1; then
  echo "Building whisper.cpp $VERSION with CUDA 12.x for RTX compute capability 8.9..."
  CUDA_BUILD="$SOURCE_DIR/build-cuda"
  if "$CMAKE_BIN" -S "$SOURCE_DIR" -B "$CUDA_BUILD" \
      -DGGML_CUDA=ON -DGGML_NATIVE=ON -DCMAKE_CUDA_ARCHITECTURES=89 \
      -DCMAKE_CUDA_HOST_COMPILER=/usr/bin/g++-13 \
      -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_SERVER=OFF \
    && "$CMAKE_BIN" --build "$CUDA_BUILD" --config Release --parallel "$(nproc)"; then
    BUILD_DIR="$CUDA_BUILD"
  else
    echo "CUDA build was unavailable; falling back to the optimized local CPU build." >&2
  fi
fi

if [[ ! -x "$BUILD_DIR/bin/whisper-cli" ]]; then
  echo "Building optimized CPU fallback..."
  "$CMAKE_BIN" -S "$SOURCE_DIR" -B "$BUILD_DIR" \
    -DGGML_NATIVE=ON -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_SERVER=OFF
  "$CMAKE_BIN" --build "$BUILD_DIR" --config Release --parallel "$(nproc)"
fi

ln -sfn "$BUILD_DIR/bin/whisper-cli" "$ROOT_DIR/tools/whisper-cli"

MODEL_PATH="$MODEL_DIR/ggml-$MODEL.bin"
if [[ ! -f "$MODEL_PATH" ]]; then
  echo "Downloading multilingual Whisper $MODEL model (466 MiB)..."
  curl --fail --location --retry 5 --output "$MODEL_PATH.partial" \
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-$MODEL.bin"
  mv "$MODEL_PATH.partial" "$MODEL_PATH"
fi

printf '%s  %s\n' "$MODEL_SHA1" "$MODEL_PATH" | sha1sum --check --status
echo "Verified whisper.cpp $VERSION and model: $MODEL_PATH"
"$ROOT_DIR/tools/whisper-cli" --help 2>&1 | sed -n '1,4p'
