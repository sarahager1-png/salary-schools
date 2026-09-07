@echo off
rem שירות החישוב המקומי — שני מופעים מקבילים, נרשם ב-Task Scheduler
rem להרצה בכל כניסה למחשב (החישובים נתקעים כשאיש לא מריץ אותו אחרי אתחול).
cd /d C:\tmp\work\salary-schools
start "sim-watcher-0" /min cmd /c "node sim-watcher.mjs >> sim-watcher0.log 2>> sim-watcher0.err"
start "sim-watcher-1" /min cmd /c "node sim-watcher.mjs >> sim-watcher1.log 2>> sim-watcher1.err"
