; Custom NSIS hooks for the ugit installer.
;
; electron-builder automatically includes an "installer.nsh" found in the
; buildResources directory (see "directories.buildResources: assets" in
; electron-builder.yml) and invokes the customInstall / customUnInstall macros
; below from the install and uninstall sections.
;
; These macros register a Windows Explorer context-menu entry ("Open with ugit")
; on folders. Because the installer is per-user (nsis.perMachine: false), the keys
; live under HKCU\Software\Classes, which requires no administrator elevation.
;
;   Directory\shell            -> right-clicking a folder
;   Directory\Background\shell -> right-clicking the empty space inside a folder
;
; "%V" expands to the folder path for both locations.

!macro customInstall
  WriteRegStr HKCU "Software\Classes\Directory\shell\ugit" "" "Open with ugit"
  WriteRegStr HKCU "Software\Classes\Directory\shell\ugit" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  WriteRegStr HKCU "Software\Classes\Directory\shell\ugit\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%V"'

  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\ugit" "" "Open with ugit"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\ugit" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\ugit\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%V"'
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\Directory\shell\ugit"
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\ugit"
!macroend
