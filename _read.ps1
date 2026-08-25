$c = Get-Content 'C:\Users\madyx\AgenticCoder\src\agentic.ts'
Write-Output ('total lines: ' + $c.Count)
Write-Output '--- 300-345:'
$c[299..344]
Write-Output '--- 355-430:'
$c[354..429]
Write-Output '--- 740-809:'
$c[739..809]
