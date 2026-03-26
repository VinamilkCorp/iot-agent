!macro customInstall
  SetOutPath "$INSTDIR\resources\drivers\CH341SER"
  ExecWait '"$INSTDIR\resources\drivers\CH341SER\CH341SER.EXE" /S' $0
  DetailPrint "CH340/CH341 driver install exit code: $0"
!macroend

!macro customUnInstall
!macroend
