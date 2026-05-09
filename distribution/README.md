# Distribution manifests

These manifests publish the Windows fork to package managers. They are NOT auto-applied — you must edit and submit them manually.

## winget (`distribution/winget/`)

Three files (`Clui.installer.yaml`, `Clui.locale.en-US.yaml`, `Clui.yaml`) form a v1.6 multi-file manifest.

**Bootstrap workflow:**

1. Replace every `<YOUR_GITHUB_HANDLE>` with your GitHub username.
2. Build a signed (or unsigned) NSIS installer locally: `npm run dist:win:nsis`.
3. Upload the `.exe` to a GitHub Release.
4. Compute SHA256: `Get-FileHash .\release\Clui-Setup-0.2.0-win.0.exe`.
5. Patch `InstallerUrl` and `InstallerSha256` in `Clui.installer.yaml`.
6. Validate: `winget validate distribution/winget`.
7. Submit: `wingetcreate submit distribution/winget`. (Requires GitHub auth via `wingetcreate`.)

**Per-release update:**

Once accepted, future releases use the `wingetcreate update` command, which re-derives the installer URL/hash from your latest GitHub Release. Wire that into the release CI in Phase 7.

## scoop (`distribution/scoop/`)

Single `clui.json` manifest. Easiest distribution path: host your own bucket.

**Bootstrap workflow:**

1. Create a separate repo `scoop-bucket` under your handle.
2. Copy `distribution/scoop/clui.json` into the root of that repo.
3. Replace `<YOUR_GITHUB_HANDLE>` and the SHA256 placeholder.
4. Users install with:
   ```powershell
   scoop bucket add clui https://github.com/<YOUR_GITHUB_HANDLE>/scoop-bucket
   scoop install clui/clui
   ```

The `checkver` + `autoupdate` blocks let you run `scoop update clui` (in your bucket repo) to bump the version + recompute the hash automatically when a new release lands. Submit to the official `extras` bucket once stable.
