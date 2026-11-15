#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
npm install --prefix server
g++ -std=c++17 -O2 -Wall -Wextra -Iengine/include engine/src/engine.cpp engine/src/main.cpp -o engine/matching_engine
