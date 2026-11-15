# Windows local run

1. Close older API/website windows with `Ctrl+C` so ports 3001 and 5173 are free.
2. Double-click `start-local.cmd` from the extracted project root.
3. The launcher adds MSYS2 runtime folders to PATH, compiles the C++17 engine, builds/runs C++ tests, installs missing npm packages (including Three.js for the real 3D welcome object) and opens API + website terminals.
4. Open `http://localhost:5173`.
5. API health: `http://localhost:3001/api/health` — expected engine status: `C++17 online`.

Keep both **ASGARD API** and **ASGARD Website** terminals open. The launcher expects GCC at `C:\msys64\ucrt64\bin\g++.exe` and Node.js/npm on PATH.

If npm install fails, run `npm.cmd install` separately in `server` and `frontend` folders, then rerun the launcher.
