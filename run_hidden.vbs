If WScript.Arguments.Count < 1 Then WScript.Quit
Dim shell : Set shell = CreateObject("WScript.Shell")
shell.Run WScript.Arguments(0), 0, False
