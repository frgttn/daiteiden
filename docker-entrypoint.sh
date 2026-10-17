#!/bin/sh
set -e
Xvfb :99 -screen 0 1280x900x24 -nolisten tcp &
x11vnc -display :99 -localhost -forever -shared -nopw -quiet &
websockify --web /usr/share/novnc 6080 localhost:5900 >/dev/null 2>&1 &
exec node src/main.ts
