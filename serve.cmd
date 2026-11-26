@echo off
rem Opens the York vs Ontario peers dashboard locally (only this computer can reach it). Close this window to stop.
rem   Basic:    http://york.localhost/           (docs/, the site on GitHub Pages)
rem   Advanced: http://advanced.york.localhost/  (advanced/site/, local only)
rem Rebuild both with: python scripts\gen.py
rem Port 80 is the web default, so no :port is needed. If it is busy, run: python scripts\serve.py 8000  and add :8000 to the addresses.
cd /d "%~dp0"
start "" http://york.localhost/
start "" http://advanced.york.localhost/
python scripts\serve.py
