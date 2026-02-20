const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { spawn } = require('child_process');
const AdmZip = require('adm-zip');

let win;
let mcProcess = null;
const rootDir = path.join(__dirname, '.minecraft');

function createWindow() {
    win = new BrowserWindow({
        width: 1200, height: 850,
        backgroundColor: '#0a0a0a',
        webPreferences: { nodeIntegration: true, contextIsolation: false }
    });
    win.loadFile('index.html');
}

// --- Java-Management ---
function getRequiredJavaVersion(version) {
    const v = version.split('.');
    const minor = parseInt(v[1]);
    if (minor >= 18) return 21;
    if (minor >= 17) return 17;
    return 8;
}

async function ensureJava(version, log) {
    const runtimeDir = path.join(rootDir, 'runtime');
    const javaDir = path.join(runtimeDir, `java${version}`);
    const javaExe = path.join(javaDir, 'bin', 'java.exe');
    if (fs.existsSync(javaExe)) return javaExe;
    if (!fs.existsSync(runtimeDir)) fs.mkdirSync(runtimeDir, { recursive: true });

    log(`Lade Java ${version} herunter...`, 15);
    const url = `https://api.adoptium.net/v3/binary/latest/${version}/ga/windows/x64/jre/hotspot/normal/eclipse`;
    const tempZip = path.join(runtimeDir, `temp_java_${version}.zip`);
    
    await download(url, tempZip);
    log(`Entpacke Java...`, 30);
    try {
        const zip = new AdmZip(tempZip);
        const rootFolder = zip.getEntries()[0].entryName.split(/[\\\/]/)[0];
        zip.extractAllTo(runtimeDir, true);
        fs.renameSync(path.join(runtimeDir, rootFolder), javaDir);
    } catch (e) { throw new Error("Java Entpackungsfehler"); }
    fs.unlinkSync(tempZip);
    return javaExe;
}

// --- Hilfsfunktion: Natives extrahieren (WICHTIG FÜR ALTE VERSIONEN) ---
function extractNatives(verData, instanceDir) {
    const nativesDir = path.join(instanceDir, 'natives');
    if (!fs.existsSync(nativesDir)) fs.mkdirSync(nativesDir, { recursive: true });

    verData.libraries.forEach(lib => {
        if (lib.extract && lib.downloads?.classifiers) {
            // Suche nach Windows-Natives
            const nativeKey = lib.natives?.windows?.replace('${arch}', '64') || 'natives-windows';
            const nativeArtifact = lib.downloads.classifiers[nativeKey];
            
            if (nativeArtifact) {
                const libPath = path.join(rootDir, 'libraries', nativeArtifact.path);
                if (fs.existsSync(libPath)) {
                    const zip = new AdmZip(libPath);
                    zip.extractAllTo(nativesDir, true);
                }
            }
        }
    });
    return nativesDir;
}

// --- API & IPC ---
ipcMain.on('get-all-versions', async (event) => {
    try {
        const response = await fetch("https://launchermeta.mojang.com/mc/game/version_manifest.json");
        const data = await response.json();
        event.reply('all-versions-list', data.versions.filter(v => v.type === 'release'));
    } catch (err) { console.error(err); }
});

ipcMain.on('get-instances', (event) => {
    const instancesPath = path.join(rootDir, 'instances');
    if (!fs.existsSync(instancesPath)) return;
    fs.readdirSync(instancesPath).forEach(folder => {
        const folderPath = path.join(instancesPath, folder);
        if (fs.statSync(folderPath).isDirectory()) {
            const jsonFile = fs.readdirSync(folderPath).find(f => f.endsWith('.json'));
            if (jsonFile) event.reply('instance-ready', { name: folder, version: jsonFile.replace('.json', '') });
        }
    });
});

ipcMain.on('open-folder', (e, name) => { shell.openPath(path.join(rootDir, 'instances', name)); });

async function download(url, dest) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) return download(res.headers.location, dest).then(resolve).catch(reject);
            if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            const file = fs.createWriteStream(dest);
            res.pipe(file);
            file.on('finish', () => { file.close(); resolve(); });
        }).on('error', reject);
    });
}

ipcMain.on('run-generator', async (e, { name, version }) => {
    const instanceDir = path.join(rootDir, 'instances', name);
    const log = (msg, prog) => win.webContents.send('status', { msg, prog });
    try {
        const javaVer = getRequiredJavaVersion(version);
        await ensureJava(javaVer, log);

        log(`Hole Version Info...`, 60);
        const manifest = await fetch("https://launchermeta.mojang.com/mc/game/version_manifest.json").then(r => r.json());
        const verEntry = manifest.versions.find(v => v.id === version);
        const jsonPath = path.join(instanceDir, `${version}.json`);
        
        if (!fs.existsSync(instanceDir)) fs.mkdirSync(instanceDir, { recursive: true });
        await download(verEntry.url, jsonPath);
        const verData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

        log(`Lade Dateien...`, 80);
        await download(verData.downloads.client.url, path.join(instanceDir, 'client.jar'));

        // Alle Libraries laden (inklusive Natives)
        const tasks = [];
        verData.libraries.forEach(lib => {
            if (lib.downloads?.artifact) {
                tasks.push(download(lib.downloads.artifact.url, path.join(rootDir, 'libraries', lib.downloads.artifact.path)));
            }
            if (lib.downloads?.classifiers) {
                Object.values(lib.downloads.classifiers).forEach(art => {
                    tasks.push(download(art.url, path.join(rootDir, 'libraries', art.path)));
                });
            }
        });
        await Promise.all(tasks);
        
        log(`Fertig!`, 100);
        e.reply('instance-ready', { name, version });
    } catch (err) { log("Fehler!", 0); console.error(err); }
});

ipcMain.on('game-action', async (event, { action, name, version }) => {
    const instanceDir = path.join(rootDir, 'instances', name);
    if (action === 'start') {
        if (mcProcess) return;

        const javaVer = getRequiredJavaVersion(version);
        const javaPath = path.join(rootDir, 'runtime', `java${javaVer}`, 'bin', 'java.exe');

        const jsonPath = path.join(instanceDir, `${version}.json`);
        const verData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

        // Natives extrahieren
        const nativesDir = extractNatives(verData, instanceDir);

        const jarPath = path.join(instanceDir, 'client.jar');
        let libs = [];
        verData.libraries.forEach(lib => {
            if (lib.downloads?.artifact) {
                const lp = path.join(rootDir, 'libraries', lib.downloads.artifact.path);
                if (fs.existsSync(lp)) libs.push(lp);
            }
        });

        let args = [
            '-Xmx2G',
            `-Djava.library.path=${nativesDir}`, // Hier werden die Natives geladen
            '-cp', [jarPath, ...libs].join(path.delimiter),
            verData.mainClass
        ];

        // Argument-Handling
        if (verData.arguments && verData.arguments.game) {
            // Versionen 1.13+
            args.push('--username', 'Player', '--version', version, '--gameDir', instanceDir, '--assetsDir', path.join(rootDir, 'assets'), '--assetIndex', verData.assetIndex.id, '--uuid', '0', '--accessToken', '0', '--userType', 'legacy');
        } else {
            // Versionen < 1.13
            let mcArgs = verData.minecraftArguments
                .replace('${auth_player_name}', 'Player')
                .replace('${version_name}', version)
                .replace('${game_directory}', instanceDir)
                .replace('${assets_root}', path.join(rootDir, 'assets'))
                .replace('${assets_index_name}', verData.assetIndex?.id || 'legacy')
                .replace('${auth_uuid}', '0')
                .replace('${auth_access_token}', '0')
                .replace('${user_properties}', '{}')
                .replace('${user_type}', 'legacy');
            args.push(...mcArgs.split(' '));
        }

        mcProcess = spawn(javaPath, args, { cwd: instanceDir });
        
        mcProcess.stdout.on('data', d => win.webContents.send('log', d.toString()));
        mcProcess.stderr.on('data', d => win.webContents.send('log', `[DEBUG] ${d.toString()}`));
        mcProcess.on('close', () => { mcProcess = null; win.webContents.send('game-status', 'stopped'); });
        win.webContents.send('game-status', 'running');
    } else {
        if (mcProcess) mcProcess.kill();
    }
});

app.whenReady().then(createWindow);
