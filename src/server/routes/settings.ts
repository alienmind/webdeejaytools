import { Hono } from 'hono';
import { store } from '../db/index.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);
const app = new Hono();

/**
 * Triggers a native visual folder picker on Windows, macOS, or Linux.
 */
async function promptDirectoryDialog(defaultPath?: string): Promise<string | null> {
  const platform = process.platform;
  const initialPath = defaultPath ? path.resolve(defaultPath) : process.cwd();

  if (platform === 'win32') {
    // PowerShell FolderBrowserDialog
    const psScript = `
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = 'Select Default Download Directory'
$dialog.ShowNewFolderButton = $true
$dialog.SelectedPath = '${initialPath.replace(/'/g, "''")}'
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    Write-Output $dialog.SelectedPath
}
`.trim();
    try {
      const { stdout } = await execAsync(`powershell -NoProfile -NonInteractive -Command "${psScript.replace(/"/g, '\\"')}"`);
      const selected = stdout.trim();
      return selected || null;
    } catch (err) {
      console.error('[FolderDialog] PowerShell error:', err);
      return null;
    }
  } else if (platform === 'darwin') {
    // macOS AppleScript
    try {
      const { stdout } = await execAsync(`osascript -e 'POSIX path of (choose folder with prompt "Select Default Download Directory")'`);
      const selected = stdout.trim();
      return selected || null;
    } catch {
      return null;
    }
  } else {
    // Linux: try zenity or kdialog
    try {
      const { stdout } = await execAsync(`zenity --file-selection --directory --title="Select Default Download Directory" --filename="${initialPath}/"`);
      return stdout.trim() || null;
    } catch {
      try {
        const { stdout } = await execAsync(`kdialog --getexistingdirectory "${initialPath}"`);
        return stdout.trim() || null;
      } catch {
        return null;
      }
    }
  }
}

// Get settings
app.get('/', (c) => {
  return c.json(store.getSettings());
});

// Update settings
app.put('/', async (c) => {
  try {
    const body = await c.req.json();
    const updated = store.updateSettings(body);
    return c.json(updated);
  } catch (err: any) {
    return c.json({ error: err.message || 'Failed to update settings' }, 400);
  }
});

// Visual folder browser dialog
app.post('/browse-folder', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const currentPath = body.currentPath || store.getSettings().defaultDownloadDir;
    const selected = await promptDirectoryDialog(currentPath);
    if (selected) {
      return c.json({ path: selected, canceled: false });
    }
    return c.json({ canceled: true });
  } catch (err: any) {
    return c.json({ error: err.message, canceled: true }, 500);
  }
});

export default app;
