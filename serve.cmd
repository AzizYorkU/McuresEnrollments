@echo off
rem Opens the York vs Ontario peers site locally (only this computer can reach it). Close this window to stop.
cd /d "%~dp0docs"
start "" http://127.0.0.1:8000/
python -m http.server 8000 --bind 127.0.0.1
