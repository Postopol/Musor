#!/usr/bin/env bash
set -euo pipefail

REPO="https://git.lab.ai-hr.kz/APA-AI-LAB/POLEZNYI-MUSOR"
DEST="${1:-$HOME/расширение-цвет}"

command -v curl >/dev/null 2>&1 || { echo "Ошибка: нужен curl"; exit 1; }
command -v tar >/dev/null 2>&1 || { echo "Ошибка: нужен tar"; exit 1; }

if [ -d "$DEST" ]; then
  echo "==> Обновляю расширение в $DEST"
else
  echo "==> Установка не найдена ($DEST), ставлю с нуля"
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "==> Скачиваю последнюю версию..."
curl -fsSL "$REPO/archive/main.tar.gz" -o "$TMP/ext.tar.gz"
tar xzf "$TMP/ext.tar.gz" -C "$TMP"
INNER="$(find "$TMP" -mindepth 1 -maxdepth 1 -type d -print -quit)"

mkdir -p "$DEST"
cp -a "$INNER/." "$DEST/"

VER="$(grep -o '"version": *"[^"]*"' "$DEST/manifest.json" | head -1 | cut -d'"' -f4)"
echo "==> Готово! Версия: ${VER:-неизвестна} ($DEST)"
echo ""
echo "Последний шаг — обнови расширение в браузере:"
echo "  chrome://extensions → кнопка «Обновить» (или перезапусти браузер)"
