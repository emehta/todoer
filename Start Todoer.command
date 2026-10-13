#!/bin/sh
# Double-click to start Todoer. Keep the window that opens: closing it stops Todoer.
cd "$(dirname "$0")" || exit 1
npm start
