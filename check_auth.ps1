# Author: madhusudhan
# Check the LICENSE in the GitHub repo (https://github.com/madhusudhan-rgb/Neo) for more information on permissions to use this code.
$anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nd2RxanF3Ymp5eWdwdXFybXlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyNjM0MDAsImV4cCI6MjA5ODgzOTQwMH0.SzpYMny4YJgX0A5p_CRGSOzqaZxgdNPIqRUOAtwpcAs'
$url = 'https://ogwdqjqwbjyygpuqrmyf.supabase.co'

Write-Output '=== GoTrue settings (enabled providers) ==='
try {
    $res = Invoke-RestMethod -Uri "$url/auth/v1/settings" -Headers @{ 'apikey' = $anonKey } -Method Get -ErrorAction Stop
    $res | ConvertTo-Json -Depth 5
} catch {
    Write-Output "ERROR: $_"
    if ($_.Exception.Response) {
        $s = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
        Write-Output "BODY: $($s.ReadToEnd())"
        $s.Close()
    }
}

Write-Output ''
Write-Output '=== Redirect URLs in URL Configuration ==='
try {
    $res = Invoke-RestMethod -Uri "$url/auth/v1/urls" -Headers @{ 'apikey' = $anonKey } -Method Get -ErrorAction Stop
    $res | ConvertTo-Json -Depth 10
} catch {
    Write-Output "ERROR: $_"
    if ($_.Exception.Response) {
        $s = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
        Write-Output "BODY: $($s.ReadToEnd())"
        $s.Close()
    }
}
