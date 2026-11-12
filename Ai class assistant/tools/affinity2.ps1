Add-Type -TypeDefinition @"
using System;using System.Text;using System.Runtime.InteropServices;
public class AF2{
 [DllImport("user32.dll")] public static extern bool GetWindowDisplayAffinity(IntPtr h, out uint a);
 [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
 [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr h);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 public delegate bool EP(IntPtr h,IntPtr l);
 [DllImport("user32.dll")] public static extern bool EnumWindows(EP cb,IntPtr l);}
"@ -Language CSharp
$rows = New-Object System.Collections.ArrayList
$cb = [AF2+EP]{
  param($h,$l)
  if ([AF2]::IsWindowVisible($h)) {
    $n = [AF2]::GetWindowTextLength($h)
    if ($n -gt 0) {
      $sb = New-Object System.Text.StringBuilder ($n+2)
      [void][AF2]::GetWindowText($h, $sb, $sb.Capacity)
      $a = 0
      [void][AF2]::GetWindowDisplayAffinity($h, [ref]$a)
      [void]$rows.Add([PSCustomObject]@{ Title = $sb.ToString(); Affinity = $a })
    }
  }
  return $true
}
[void][AF2]::EnumWindows($cb, [IntPtr]::Zero)
Write-Output "total visible titled windows: $($rows.Count)"
Write-Output "--- any with affinity != 0 ---"
$rows | Where-Object { $_.Affinity -ne 0 } | Format-Table -AutoSize | Out-String -Width 120
Write-Output "--- matching 'Copilot' ---"
$rows | Where-Object { $_.Title -match 'Copilot' } | Format-Table -AutoSize | Out-String -Width 120
