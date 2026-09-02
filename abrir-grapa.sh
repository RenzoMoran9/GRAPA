#!/bin/sh
# Abre Grapa en el navegador predeterminado (Linux / macOS).
DIR="$(cd "$(dirname "$0")" && pwd)"
if command -v xdg-open >/dev/null 2>&1; then xdg-open "$DIR/index.html"
elif command -v open >/dev/null 2>&1; then open "$DIR/index.html"
else echo "Abre manualmente: $DIR/index.html"; fi
