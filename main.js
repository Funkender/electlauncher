const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { spawn } = require('child_process');

let win;
// Hauptordner für den Launcher (wird im Git ignoriert)
const rootDir = path.join(__dirname, '.minecraft');

function createWindow() {
    win = new BrowserWindow({
        width: 1000,
        height: 700,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        autoHideMenuBar: true
    });
    win.loadFile('index.html');
}

// --- Hilfsfunktion: Dateien sicher herunterladen ---
async function download(url, dest) {
    const folder = path.dirname(dest);
    if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });

    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (res) => {
            if (res.statusCode !== 200) return reject(`Fehler: ${res.statusCode}`);
            res.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => reject(err.message));
        });
    });
}

// --- Java Versionen festlegen ---
function getRequiredJavaVersion(mcVersion) {
    const v = mcVersion.split('.').map(Number);
    if (v[1] >= 20) return "21";
    if (v[1] >= 17) return "17";
    return "8";
}

// --- Java Check & Download ---
async function ensureJava(version, log) {
    const javaPath = path.join(rootDir, 'runtime', `java${version}`, 'bin', 'java.exe');
    if (fs.existsSync(javaPath)) return javaPath;

    log(`Lade Java ${version} herunter...`, 10);
    // Beispiel URLs (hier sollten echte JRE-Links rein, z.B. von Adoptium)
    const jreUrl = version === "21" 
        ? "URL_ZU_JAVA_21_ZIP" 
        : "URL_ZU_JAVA_8_ZIP"; 
    
    // Hinweis: Im echten Launcher müsstest du hier das ZIP entpacken.
    // Der Einfachheit halber setzen wir voraus, dass Java im 'runtime' Ordner liegt.
    return javaPath;
}

// --- IPC: Fabric Loader Liste holen ---
ipcMain.on('get-fabric-loaders', async (event, mcVersion) => {
    try {
        const response = await fetch(`https://meta.fabricmc.net/v2/versions/loader/${mcVersion}`);
        const data = await response.json();
        event.reply('fabric-loaders-list', data.map(v => v.loader.version));
    } catch (err) {
        console.error("Fabric Meta API Fehler:", err);
    }
});

// --- IPC: Instanz erstellen (Vanilla oder Fabric) ---
ipcMain.on('run-generator', async (e, { name, version, fabricVersion = null }) => {
    const instanceDir = path.join(rootDir, 'instances', name);
    const log = (msg, prog) => win.webContents.send('status', { msg, prog });

    try {
        if (!fs.existsSync(instanceDir)) fs.mkdirSync(instanceDir, { recursive: true });

        const javaVer = getRequiredJavaVersion(version);
        await ensureJava(javaVer, log);

        log(`Hole Versions-Profil...`, 20);
        let profileData;
        
        if (fabricVersion) {
            // Fabric Modus: Profil von Fabric Meta laden
            const fabricUrl = `https://meta.fabricmc.net/v2/versions/loader/${version}/${fabricVersion}/profile/json`;
            profileData = await fetch(fabricUrl).then(r => r.json());
        } else {
            // Vanilla Modus: Profil von Mojang laden
            const manifest = await fetch("https://launchermeta.mojang.com/mc/game/version_manifest.json").then(r => r.json());
            const verEntry = manifest.versions.find(v => v.id === version);
            profileData = await fetch(verEntry.url).then(r => r.json());
        }

        // Speichere die JSON der Instanz
        fs.writeFileSync(path.join(instanceDir, 'instance.json'), JSON.stringify(profileData));

        // 1. Client.jar laden (Auch bei Fabric brauchen wir das Vanilla-Original)
        log(`Prüfe client.jar...`, 40);
        const vanillaManifest = await fetch("https://launchermeta.mojang.com/mc/game/version_manifest.json").then(r => r.json());
        const vanillaEntry = vanillaManifest.versions.find(v => v.id === version);
        const vanillaData = await fetch(vanillaEntry.url).then(r => r.json());
        await download(vanillaData.downloads.client.url, path.join(instanceDir, 'client.jar'));

        // 2. Libraries laden (Parallel)
        log(`Lade Libraries...`, 60);
        const libTasks = [];
        profileData.libraries.forEach(lib => {
            if (lib.downloads?.artifact) {
                // Mojang Format
                const dest = path.join(rootDir, 'libraries', lib.downloads.artifact.path);
                if (!fs.existsSync(dest)) libTasks.push(download(lib.downloads.artifact.url, dest));
            } else if (lib.url) {
                // Fabric Maven Format (net.fabricmc:fabric-loader:0.15.7)
                const parts = lib.name.split(':');
                const pathStr = `${parts[0].replace(/\./g, '/')}/${parts[1]}/${parts[2]}/${parts[1]}-${parts[2]}.jar`;
                const url = `${lib.url}${pathStr}`;
                const dest = path.join(rootDir, 'libraries', pathStr);
                if (!fs.existsSync(dest)) libTasks.push(download(url, dest));
            }
        });
        await Promise.all(libTasks);

        log(`Installation abgeschlossen!`, 100);
        e.reply('instance-ready', { name, version });

    } catch (err) {
        console.error(err);
        log(`Fehler: ${err.message}`, 0);
    }
});

// --- Launcher Starten ---
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});