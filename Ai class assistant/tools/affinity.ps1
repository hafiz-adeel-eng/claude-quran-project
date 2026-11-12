$sig=@"
using System;using System.Text;using System.Runtime.InteropServices;
public class AF{
 [DllImport("user32.dll")] public static extern bool GetWindowDisplayAffinity(IntPtr h, out uint a);
 [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
 [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr h);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 public delegate bool EP(IntPtr h,IntPtr l);
 [DllImport("user32.dll")] public static extern bool EnumWindows(EP cb,IntPtr l);}
"@
Add-Type -TypeDefinition $sig -Language CSharp
$cb=[AF+EP]{param($h,$l)
 if([AF]::IsWindowVisible($h)){
  $n=[AF]::GetWindowTextLength($h)
  if($n -gt 0){
   $sb=New-Object System.Text.StringBuilder ($n+2)
   [void][AF]::GetWindowText($h,$sb,$sb.Capacity)
   $t=$sb.ToString()
   if($t -like "*Meeting Copilot*"){
     $a=0;[void][AF]::GetWindowDisplayAffinity($h,[ref]$a)
     $name = switch($a){0{"NONE - capturable"}1{"WDA_MONITOR - black box"}17{"WDA_EXCLUDEFROMCAPTURE - hidden"}default{"unknown"}}
     Write-Output ("{0,-32} affinity {1,-3} {2}" -f $t,$a,$name)
   }}}
 return $true}
[void][AF]::EnumWindows($cb,[IntPtr]::Zero)
