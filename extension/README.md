# Meanwhile — UI preview

Half-screen waiting room panel for Cursor / VS Code. **Static mock only** (v0.1).

## Preview in Cursor

1. Open this folder as the workspace root for the extension:

   ```bash
   cursor /home/felix/projects/slop_ide/extension
   ```

   Or in Cursor: **File → Open Folder…** → select `slop_ide/extension`.

2. Press **F5** (or Run → Start Debugging). Pick **VS Code Extension Development Host** if asked. A new Cursor/Code window opens with the extension loaded.

3. In that window: **Cmd/Ctrl+Shift+P** → run **Meanwhile: Open**  
   (or **Cmd/Ctrl+Alt+M**)

4. A **Meanwhile** panel opens in the editor column beside the active editor (~half screen).

## From the monorepo

If your workspace is `slop_ide` (not `extension/`), open the Command Palette and run **Developer: Install Extension from Location…**, then choose the `extension` folder — or use F5 with a launch config pointed at `extension`.

### Optional launch config (repo root)

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Meanwhile UI",
      "type": "extensionHost",
      "request": "launch",
      "args": ["--extensionDevelopmentPath=${workspaceFolder}/extension"]
    }
  ]
}
```

Then press **F5** from the repo root.
