/*
 * Author: madhusudhan
 * Check the LICENSE in the GitHub repo (https://github.com/madhusudhan-rgb/Neo) for more information on permissions to use the code.
 */
$ErrorActionPreference = 'Stop'
$p = 'C:\Users\madyx\AgenticCoder\src\App.tsx'
$t = [System.IO.File]::ReadAllText($p)
$t = $t.Replace([string][char]13 + [string][char]10, [string][char]10)
$fail = 0

function Rep([string]$label, [string]$old, [string]$new) {
  $lf = [char]10
  $crlf = [string][char]13 + $lf
  $old = $old.Replace($crlf, $lf)
  $new = $new.Replace($crlf, $lf)
  if (-not $script:t.Contains($old)) {
    Write-Output ("NOT FOUND: " + $label)
    $script:fail++
    return
  }
  $script:t = $script:t.Replace($old, $new)
  Write-Output ("OK: " + $label)
}

$old1 = @'
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);
'@
$new1 = @'
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
    // Ref mirrors below keep every dependency fresh - this effect registers once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
'@
Rep 'keydown-disable' $old1 $new1

$old2 = @'
    if (!restored) return;
    void bootstrapCloud();
'@
$new2 = @'
    if (!restored) return;
    // Defer the initial bootstrap off the effect body (no setState-in-effect).
    const boot = window.setTimeout(() => void bootstrapCloud(), 0);
'@
Rep 'bootstrap-defer' $old2 $new2

$old3 = @'
    return () => {
      off();
      void unlistenAuthBroadcast.then((unlisten) => unlisten());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restored]);
'@
$new3 = @'
    return () => {
      window.clearTimeout(boot);
      off();
      void unlistenAuthBroadcast.then((unlisten) => unlisten());
    };
  }, [restored]);
'@
Rep 'bootstrap-cleanup' $old3 $new3

$old4 = @'
  launchIdeWindowRef.current = launchIdeWindow;
'@
$new4 = @'
  useLayoutEffect(() => {
    launchIdeWindowRef.current = launchIdeWindow;
  });
'@
Rep 'launchIdeWindowRef' $old4 $new4

$old5 = @'
  const editorTabsRef = useRef<EditorTab[]>([]);
  editorTabsRef.current = editorTabs;
'@
$new5 = @'
  const editorTabsRef = useRef<EditorTab[]>([]);
  useLayoutEffect(() => {
    editorTabsRef.current = editorTabs;
  });
'@
Rep 'editorTabsRef' $old5 $new5

$old6 = @'
  const syncAllOpenTabsRef = useRef<() => void>(() => {});
  syncAllOpenTabsRef.current = syncAllOpenTabs;
'@
$new6 = @'
  const syncAllOpenTabsRef = useRef<() => void>(() => {});
  useLayoutEffect(() => {
    syncAllOpenTabsRef.current = syncAllOpenTabs;
  });
'@
Rep 'syncAllOpenTabsRef' $old6 $new6

$old7 = @'
  const saveEditorFile = async (path: string) => {
    const tab = editorTabs.find((t) => t.path === path);
'@
$new7 = @'
  // Declared as a hoisted function so effects above (auto-save, shortcuts)
  // can reference it without a use-before-declaration violation.
  async function saveEditorFile(path: string) {
    const tab = editorTabs.find((t) => t.path === path);
'@
Rep 'saveEditorFile-decl' $old7 $new7

$old8 = @'
    }
  };

  /**
   * Format Document
'@
$new8 = @'
    }
  }

  /**
   * Format Document
'@
Rep 'saveEditorFile-end' $old8 $new8

$old9 = @'
  const formatDocument = async (path: string | null) => {
    if (!isExtensionEnabled("prettier.formatter")) {
'@
$new9 = @'
  async function formatDocument(path: string | null) {
    if (!isExtensionEnabled("prettier.formatter")) {
'@
Rep 'formatDocument-decl' $old9 $new9

$old10 = @'
    if (out !== tab.content) updateEditorContent(p, out);
  };
'@
$new10 = @'
    if (out !== tab.content) updateEditorContent(p, out);
  }
'@
Rep 'formatDocument-end' $old10 $new10

if ($fail -gt 0) { Write-Output ("FAILED EDITS: " + $fail); exit 1 }

[System.IO.File]::WriteAllText($p, $t, (New-Object System.Text.UTF8Encoding($false)))
Write-Output 'WROTE App.tsx'
