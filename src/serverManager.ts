/**
 * ServerManager handles the logic for detecting available ports 
 * and verifying if an Ollama instance is actually running.
 */

export async function checkServerHealth(baseUrl: string): Promise<{ online: boolean; status: number }> {
  try {
    // Ollama's /api/version is lightweight AND exclusive to real Ollama
    // servers. A random local app that happens to answer on the same port
    // must not be mistaken for Ollama — that made port "discovery" latch
    // onto foreign servers and every model call then break.
    const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/version`);
    if (!response.ok) return { online: false, status: response.status };
    const body: unknown = await response.json().catch(() => null);
    const isOllama = !!body && typeof body === "object" && "version" in body;
    return { online: isOllama, status: response.status };
  } catch {
    return { online: false, status: 0 };
  }
}

export async function findAvailableOllamaPort(startPort = 11434, maxTries = 5): Promise<string | null> {
  for (let i = 0; i < maxTries; i++) {
    const port = startPort + i;
    const url = `http://localhost:${port}`;
    const health = await checkServerHealth(url);
    
    if (health.online) {
      return url; // Found a running server!
    }
  }
  return null; // No servers found on the attempted ports
}

/**
 * Attempts to "wake up" or suggest the starting of a server.
 * In a full Tauri implementation, this would call a Rust command to execute 'ollama serve'.
 */
export async function ensureServerRunning(settings: { baseUrl: string }) {
  const health = await checkServerHealth(settings.baseUrl);
  if (!health.online) {
    console.warn(`Server at ${settings.baseUrl} is not responding.`);
    // Here we could trigger a Tauri command to start the process
    // Example: await invoke('start_ollama_server');
    return false;
  }
  return true;
}
