!macro customInstall
  ; Kill running instance before installing
  nsExec::Exec 'taskkill /F /IM "IoT Scale.exe" /T'
!macroend

!macro customUnInstall
  ; Remove autostart registry entry
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "IoT Scale"

  ; Remove custom protocol handler
  DeleteRegKey HKCU "Software\Classes\iotscale"
!macroend
