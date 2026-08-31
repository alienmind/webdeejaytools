import { Hono } from 'hono';
import { store } from '../db/index.js';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { appSettingsSchema, browseFolderSchema } from '../../shared/schemas.js';
import { errorResponse, parseBody } from '../util/validate.js';
import { grantSessionRoot } from '../util/paths.js';

const execFileAsync = promisify(execFile);
const app = new Hono();

/**
 * Hook installed by the Electron main process so the folder picker uses the native dialog instead
 * of shelling out. Set via setNativeDirectoryPicker() at startup.
 */
let nativeDirectoryPicker: ((defaultPath?: string, description?: string) => Promise<string | null>) | null = null;

export function setNativeDirectoryPicker(
  picker: (defaultPath?: string, description?: string) => Promise<string | null>
): void {
  nativeDirectoryPicker = picker;
}

/**
 * Triggers a native visual folder picker on Windows, macOS, or Linux.
 *
 * Everything here uses execFile with an argument array, never a shell string. The previous
 * implementation interpolated the caller-supplied dialog title into a shell command and escaped
 * only double quotes, which left $(...), backticks and backslashes live on macOS and Linux - a
 * title of `$(...)` executed.
 */
async function promptDirectoryDialog(defaultPath?: string, description?: string): Promise<string | null> {
  if (nativeDirectoryPicker) {
    return nativeDirectoryPicker(defaultPath, description);
  }

  const platform = process.platform;
  const initialPath = defaultPath ? path.resolve(defaultPath) : process.cwd();
  const dialogDesc = (description || 'Select Directory').replace(/[\r\n]+/g, ' ').slice(0, 200);

  if (platform === 'win32') {
    // PowerShell FolderBrowserDialog via base64 EncodedCommand. Values are embedded in
    // single-quoted PowerShell literals where doubling the quote is the complete escape.
    const psScript = `
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = '${dialogDesc.replace(/'/g, "''")}'
$dialog.ShowNewFolderButton = $true
if (Test-Path '${initialPath.replace(/'/g, "''")}') {
    $dialog.SelectedPath = '${initialPath.replace(/'/g, "''")}'
}
$dummy = New-Object System.Windows.Forms.Form
$dummy.TopMost = $true
$res = $dialog.ShowDialog($dummy)
$dummy.Dispose()
if ($res -eq [System.Windows.Forms.DialogResult]::OK) {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    Write-Output $dialog.SelectedPath
}
`.trim();

    try {
      const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
      const { stdout } = await execFileAsync('powershell.exe', [
        '-NoProfile',
        '-STA',
        '-EncodedCommand',
        encoded,
      ]);
      return stdout.trim() || null;
    } catch (err) {
      console.error('[FolderDialog] PowerShell error:', err);
      return null;
    }
  }

  if (platform === 'darwin') {
    // The AppleScript source is passed as a single execFile argument, so no shell parses it. The
    // prompt is still quote-escaped because it lands inside an AppleScript string literal.
    const appleScript = `POSIX path of (choose folder with prompt "${dialogDesc.replace(/["\\]/g, '\\$&')}")`;
    try {
      const { stdout } = await execFileAsync('osascript', ['-e', appleScript]);
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }

  try {
    const { stdout } = await execFileAsync('zenity', [
      '--file-selection',
      '--directory',
      `--title=${dialogDesc}`,
      `--filename=${initialPath}${path.sep}`,
    ]);
    return stdout.trim() || null;
  } catch {
    try {
      const { stdout } = await execFileAsync('kdialog', ['--getexistingdirectory', initialPath]);
      return stdout.trim() || null;
    } catch {
      return null;
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
    // Validated against a schema rather than written straight through: this body used to land in
    // db.json verbatim, whatever keys it carried.
    const body = await parseBody(c, appSettingsSchema);
    const updated = store.updateSettings(body);
    return c.json(updated);
  } catch (err) {
    return errorResponse(c, err, 'API settings/update');
  }
});

// Visual folder browser dialog
app.post('/browse-folder', async (c) => {
  try {
    const body = await parseBody(c, browseFolderSchema);
    const settings = store.getSettings();
    const currentPath = body.currentPath || settings.defaultLibraryDir || settings.defaultDownloadDir;
    const selected = await promptDirectoryDialog(currentPath, body.title || 'Select Directory');

    if (selected) {
      // The user picked this folder in a native dialog, so it is an explicit grant for this run.
      grantSessionRoot(selected);
      return c.json({ path: selected, canceled: false });
    }
    return c.json({ canceled: true });
  } catch (err) {
    return errorResponse(c, err, 'API settings/browse-folder');
  }
});

export default app;
