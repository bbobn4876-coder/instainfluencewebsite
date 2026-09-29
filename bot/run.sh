#!/usr/bin/env bash
# Запуск бота. Нужен только python3 — ставить нечего.
set -euo pipefail
cd "$(dirname "$0")"
exec python3 main.py
