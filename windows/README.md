# Life widget na Windows

Małe okno z apką Life, bez ramki i zawsze na wierzchu. Te same dane co w przeglądarce i na telefonie.

## Instalacja

1. Zainstaluj [Python 3.12](https://www.python.org/downloads/release/python-31210/) (zaznacz **Add python.exe to PATH**).
2. Otwórz **PowerShell** i wklej całość:

```powershell
$dir = "$env:LOCALAPPDATA\LifeWidget"
New-Item -ItemType Directory -Force $dir | Out-Null
python -m pip install pywebview
Invoke-WebRequest https://raw.githubusercontent.com/antoniabc/life-app-releases/main/windows/life_widget.pyw -OutFile "$dir\life_widget.pyw"
$s = (New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop') + '\Life widget.lnk')
$s.TargetPath = (Get-Command pythonw).Source
$s.Arguments = "`"$dir\life_widget.pyw`""
$s.Save()
```

3. Uruchom skrót **Life widget** z pulpitu i kliknij „Zaloguj przez Google”. Logowanie otworzy się w przeglądarce.

## Obsługa

- Okno przeciągasz za górny pasek.
- **—** zwija do małej pigułki, **✕** zamyka.
- W nagłówku widać, na jakie konto jesteś zalogowany.

## Odinstalowanie

Usuń skrót z pulpitu i folder `%LOCALAPPDATA%\LifeWidget`.
