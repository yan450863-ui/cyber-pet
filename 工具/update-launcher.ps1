param([string]$InstallDir)
$ErrorActionPreference = 'Stop'
try {
  if (-not $InstallDir) {
    $parent = Split-Path -Parent $PSScriptRoot
    if (Test-Path -LiteralPath (Join-Path $parent 'pet-portable.json')) { $InstallDir = $parent }
    else {
      Add-Type -AssemblyName System.Windows.Forms
      $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
      $dialog.Description = '请选择原软件文件夹（里面有 DSH Desktop.exe）'
      $dialog.ShowNewFolderButton = $false
      if ($dialog.ShowDialog() -ne 'OK') { Write-Host '已取消更新'; exit 0 }
      $InstallDir = $dialog.SelectedPath
    }
  }
  $node = Join-Path $InstallDir 'resources\runtime\x64\primary-runtime\dependencies\node\bin\node.exe'
  if (-not (Test-Path -LiteralPath $node)) { throw '所选目录没有内置 Node，请选择完整解压后的软件目录。' }
  & $node (Join-Path $PSScriptRoot 'apply-update.mjs') $InstallDir
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} catch { Write-Host ('更新停止：' + $_.Exception.Message); exit 1 }
