@echo off
rem Opens the York vs Ontario peers site locally at http://york.localhost/ (only this computer can reach it). Close this window to stop.
rem Port 80 is the web default, so no :port is needed. If it is busy, change both 80s below to 8000 and use http://york.localhost:8000/
cd /d "%~dp0docs"
start "" http://york.localhost/
python -m http.server 80 --bind 127.0.0.1
