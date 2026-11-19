#!/usr/bin/env bash
set -euo pipefail

REPO="https://git.lab.ai-hr.kz/APA-AI-LAB/POLEZNYI-MUSOR"
DEST="${1:-$HOME/расширение-цвет}"

command -v curl >/dev/null 2>&1 || { echo "Ошибка: нужен curl"; exit 1; }
command -v tar >/dev/null 2>&1 || { echo "Ошибка: нужен tar"; exit 1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "==> Скачиваю расширение..."
curl -fsSL "$REPO/archive/main.tar.gz" -o "$TMP/ext.tar.gz"

echo "==> Распаковываю в $DEST"
mkdir -p "$DEST"
tar xzf "$TMP/ext.tar.gz" -C "$TMP"
INNER="$(find "$TMP" -mindepth 1 -maxdepth 1 -type d -print -quit)"
cp -a "$INNER/." "$DEST/"

echo "==> Готово! Папка: $DEST"
echo ""
echo "Установка в браузер (Helium/Chrome/Chromium):"
echo "  1. Открой страницу расширений: chrome://extensions"
echo "  2. Включи «Режим разработчика»"
echo "  3. «Загрузить распакованное расширение» и выбери папку: $DEST"
