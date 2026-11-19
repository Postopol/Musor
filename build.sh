#!/usr/bin/env bash
# Собирает расширение под три браузера в папку dist/:
#   dist/chrome.zip    — Chrome, Helium, Edge, Яндекс, Opera
#   dist/firefox.xpi   — Firefox (128+)
#   dist/firefox/      — то же распакованным, для about:debugging
#   dist/safari/       — заготовка для Xcode (собирается только на Mac)
set -euo pipefail
cd "$(dirname "$0")"

command -v python3 >/dev/null 2>&1 || { echo "Ошибка: нужен python3"; exit 1; }
command -v zip >/dev/null 2>&1 || { echo "Ошибка: нужен zip"; exit 1; }

FILES=(manifest.json background.js common.js content.js popup.html popup.css popup.js icons)

rm -rf dist
mkdir -p dist/chrome dist/firefox dist/safari
for d in chrome firefox safari; do cp -a "${FILES[@]}" "dist/$d/"; done

# правим manifest под конкретный браузер
python3 - <<'EOF'
import json

def patch(path, fn):
    with open(path, encoding='utf-8') as f:
        m = json.load(f)
    fn(m)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(m, f, ensure_ascii=False, indent=2)
        f.write('\n')

def firefox(m):
    # Firefox не умеет service worker в расширениях — фоновый скрипт обычный
    m['background'] = {'scripts': ['common.js', 'background.js']}
    m['browser_specific_settings'] = {
        'gecko': {
            'id': 'cvet@paket-pechenek',
            'strict_min_version': '128.0',
            'data_collection_permissions': {'required': ['none']},
        }
    }

def safari(m):
    m['browser_specific_settings'] = {'safari': {'strict_min_version': '16.4'}}

patch('dist/firefox/manifest.json', firefox)
patch('dist/safari/manifest.json', safari)
EOF

(cd dist/chrome && zip -qr ../chrome.zip .)
(cd dist/firefox && zip -qr ../firefox.xpi .)
rm -rf dist/chrome

VER="$(grep -o '"version": *"[^"]*"' manifest.json | head -1 | cut -d'"' -f4)"
echo "==> Готово, версия $VER:"
echo "    dist/chrome.zip   — Chrome и другие Chromium-браузеры"
echo "    dist/firefox.xpi  — Firefox (и папка dist/firefox/)"
echo "    dist/safari/      — для Safari: на Mac выполни"
echo "      xcrun safari-web-extension-converter dist/safari --app-name \"Расширение Цвет\""
