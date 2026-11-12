Add-Type -TypeDefinition @"
using System;using System.Text;using System.Runtime.InteropServices;
public class SB{
 [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
 [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr h);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
 public delegate bool EP(IntPtr h,IntPtr l);
 [DllImport("user32.dll")] public static extern bool EnumWindows(EP cb,IntPtr l);}
"@ -Language CSharp
$rows=New-Object System.Collections.ArrayList
$cb=[SB+EP]{param($h,$l)
 if([SB]::IsWindowVisible($h)){
  $n=[SB]::GetWindowTextLength($h)
  if($n -gt 0){
   $sb=New-Object System.Text.StringBuilder ($n+2); [void][SB]::GetWindowText($h,$sb,$sb.Capacity)
   $cn=New-Object System.Text.StringBuilder 256; [void][SB]::GetClassName($h,$cn,256)
   [void]$rows.Add([PSCustomObject]@{Title=$sb.ToString();Class=$cn.ToString()})}}
 return $true}
[void][SB]::EnumWindows($cb,[IntPtr]::Zero)
Write-Output "visible titled windows: $($rows.Count)"
Write-Output "--- anything mentioning sharing / meet / zoom ---"
$hit = $rows | Where-Object { $_.Title -match 'shar|meet\.google|Zoom|Teams' }
if ($hit) { $hit | Format-Table -AutoSize -Wrap | Out-String -Width 150 } else { Write-Output "  (none right now)" }
Write-Output "--- all Chrome-class windows ---"
$rows | Where-Object { $_.Class -like 'Chrome_WidgetWin*' } | Select-Object -First 12 | Format-Table -AutoSize -Wrap | Out-String -Width 150
