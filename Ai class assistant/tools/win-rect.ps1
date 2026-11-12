$sig=@"
using System;using System.Text;using System.Runtime.InteropServices;
public class WR{
 [StructLayout(LayoutKind.Sequential)] public struct RECT{public int L,T,R,B;}
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
 [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
 [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr h);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 public delegate bool EP(IntPtr h,IntPtr l);
 [DllImport("user32.dll")] public static extern bool EnumWindows(EP cb,IntPtr l);
}
"@
Add-Type -TypeDefinition $sig -Language CSharp
$res=$null
$cb=[WR+EP]{param($h,$l)
  if([WR]::IsWindowVisible($h)){
    $n=[WR]::GetWindowTextLength($h)
    if($n -gt 0){
      $sb=New-Object System.Text.StringBuilder ($n+2)
      [void][WR]::GetWindowText($h,$sb,$sb.Capacity)
      if($sb.ToString() -like "*Local Disk*"){
        $r=New-Object WR+RECT
        [void][WR]::GetWindowRect($h,[ref]$r)
        [void][WR]::SetForegroundWindow($h)
        $script:res=[PSCustomObject]@{Title=$sb.ToString();X=$r.L;Y=$r.T;W=($r.R-$r.L);H=($r.B-$r.T)}
      }
    }
  }
  return $true
}
[void][WR]::EnumWindows($cb,[IntPtr]::Zero)
if($res){ $res | ConvertTo-Json -Compress } else { '{"error":"not found"}' }
