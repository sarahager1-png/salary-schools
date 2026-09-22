@echo off
rem Local calc service (the "chashev" button) - two parallel watchers, started at logon by Task Scheduler.
cd /d C:\tmp\work\salary-schools
start "sim-watcher-0" /min cmd /c "node sim-watcher.mjs >> sim-watcher0.log 2>> sim-watcher0.err"
start "sim-watcher-1" /min cmd /c "node sim-watcher.mjs >> sim-watcher1.log 2>> sim-watcher1.err"
