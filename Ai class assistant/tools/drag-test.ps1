param([int]$ox=60,[int]$oy=14)
$sig=@"
using System;using System.Text;using System.Runtime.InteropServices;
public class DT{
 [StructLayout(LayoutKind.Sequential)] public struct RECT{public int L,T,R,B;}
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
 [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
 [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr h);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h,IntPtr a,int x,int y,int cx,int cy,uint f);
 [DllImport("user32.dll")] public static extern void mouse_event(uint f,uint dx,uint dy,uint d,IntPtr e);
 public delegate bool EP(IntPtr h,IntPtr l);
 [DllImport("user32.dll")] public static extern bool EnumWindows(EP cb,IntPtr l);
}
"@
Add-Type -TypeDefinition $sig -Language CSharp
$LEFTDOWN=0x0002; $LEFTUP=0x0004

$target=[IntPtr]::Zero
$cb=[DT+EP]{param($h,$l)
 if([DT]::IsWindowVisible($h)){
  $n=[DT]::GetWindowTextLength($h)
  if($n -gt 0){
   $sb=New-Object System.Text.StringBuilder ($n+2)
   [void][DT]::GetWindowText($h,$sb,$sb.Capacity)
   if($sb.ToString() -eq "Meeting Copilot"){ $script:target=$h }
  }}
 return $true}
[void][DT]::EnumWindows($cb,[IntPtr]::Zero)
if($target -eq [IntPtr]::Zero){ Write-Output "overlay window not found"; exit 1 }

# Park the window at a known spot so repeated tests are comparable and the
# grab point never drifts off-screen.
[void][DT]::SetWindowPos($target,[IntPtr]::Zero,120,40,0,0,0x0001 -bor 0x0004)
Start-Sleep -Milliseconds 350
$r=New-Object DT+RECT
[void][DT]::GetWindowRect($target,[ref]$r)
Write-Output ("before: x={0} y={1}  ({2}x{3})" -f $r.L,$r.T,($r.R-$r.L),($r.B-$r.T))

# grab point comes from the command line: <dx> <dy> from the window origin
$gx = $r.L + $ox
$gy = $r.T + $oy
[void][DT]::SetCursorPos($gx,$gy)
Start-Sleep -Milliseconds 250
[DT]::mouse_event($LEFTDOWN,0,0,0,[IntPtr]::Zero)
Start-Sleep -Milliseconds 150
# move in steps so the window manager tracks it
for($i=1;$i -le 10;$i++){
  [void][DT]::SetCursorPos($gx + ($i*12), $gy + ($i*6))
  Start-Sleep -Milliseconds 40
}
Start-Sleep -Milliseconds 150
[DT]::mouse_event($LEFTUP,0,0,0,[IntPtr]::Zero)
Start-Sleep -Milliseconds 400

$r2=New-Object DT+RECT
[void][DT]::GetWindowRect($target,[ref]$r2)
Write-Output ("after : x={0} y={1}" -f $r2.L,$r2.T)
$dx=$r2.L-$r.L; $dy=$r2.T-$r.T
Write-Output ("moved : dx={0} dy={1}  (expected about dx=120 dy=60)" -f $dx,$dy)
if([Math]::Abs($dx) -gt 40 -and [Math]::Abs($dy) -gt 20){ Write-Output "RESULT: DRAG WORKS" }
else { Write-Output "RESULT: DRAG DOES NOT WORK" }
