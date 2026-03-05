const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { spawn } = require('child_process');
const AdmZip = require('adm-zip');

let win;
let mcProcess = null;
const rootDir = path.join(__dirname, '.minecraft');
const MODRINTH_API = "https://api.modrinth.com/v2";

// --- INITIALISIERUNG DER STRUKTUR ---
const folders = [
    path.join(rootDir, 'instances'),
    path.join(rootDir, 'libraries'),
    path.join(rootDir, 'runtime'),
    path.join(rootDir, 'assets'),
    path.join(rootDir, 'assets', 'indexes'),
    path.join(rootDir, 'assets', 'objects')
];
folders.forEach(p => { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); });

function createWindow() {
    win = new BrowserWindow({
        width: 1350, 
        height: 950,
        backgroundColor: '#050505',
        webPreferences: { 
            nodeIntegration: true, 
            contextIsolation: false,
            webSecurity: false 
        }
    });
    win.loadFile('index.html');
}

// --- HILFSFUNKTIONEN (CORE) ---

async function download(url, dest) {
    return new Promise((resolve, reject) => {
        if (!url) return resolve();
        https.get(url, { headers: { 'User-Agent': 'ROJ-Launcher-Pro' } }, (res) => {
            // Redirect-Handling (wichtig für Modrinth/GitHub)
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return download(res.headers.location, dest).then(resolve).catch(reject);
            }
            if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));

            fs.mkdirSync(path.dirname(dest), { recursive: true });
            const file = fs.createWriteStream(dest);
            res.pipe(file);
            file.on('finish', () => { file.close(); resolve(); });
        }).on('error', (err) => {
            if (fs.existsSync(dest)) fs.unlinkSync(dest);
            reject(err);
        });
    });
}

function getRequiredJavaVersion(version) {
    const v = version.split('.');
    const minor = parseInt(v[1]);
    const patch = v[2] ? parseInt(v[2]) : 0;
    // Minecraft Logik für Java-Versionen
    if (minor >= 20 && (minor > 20 || patch >= 5)) return 21;
    if (minor >= 17) return 17;
    return 8;
}

async function ensureJava(version) {
    const javaDir = path.join(rootDir, 'runtime', `java${version}`);
    const javaExe = path.join(javaDir, 'bin', 'java.exe');
    
    if (fs.existsSync(javaExe)) return javaExe;
    
    win.webContents.send('log', `[SYSTEM] Java ${version} fehlt. Automatischer Download startet...\n`);
    const url = `https://api.adoptium.net/v3/binary/latest/${version}/ga/windows/x64/jre/hotspot/normal/eclipse`;
    const tempZip = path.join(rootDir, 'runtime', `temp_j${version}.zip`);
    
    try {
        await download(url, tempZip);
        const zip = new AdmZip(tempZip);
        const rootFolder = zip.getEntries()[0].entryName.split(/[\\\/]/)[0];
        zip.extractAllTo(path.join(rootDir, 'runtime'), true);
        
        if (fs.existsSync(javaDir)) fs.rmSync(javaDir, { recursive: true });
        fs.renameSync(path.join(rootDir, 'runtime', rootFolder), javaDir);
        fs.unlinkSync(tempZip);
        
        win.webContents.send('log', `[SYSTEM] Java ${version} erfolgreich installiert.\n`);
        return javaExe;
    } catch (e) {
        win.webContents.send('log', `[FEHLER] Java Installation fehlgeschlagen: ${e.message}\n`);
        throw e;
    }
}

function getLibPath(libName) {
    const parts = libName.split(':');
    const group = parts[0].replace(/\./g, '/');
    const artifact = parts[1];
    const version = parts[2];
    const classifier = parts[3] ? `-${parts[3]}` : '';
    return path.join(group, artifact, version, `${artifact}-${version}${classifier}.jar`);
}

// --- MODRINTH & LIBRARY LOGIK ---

// 1. Suche im Store
ipcMain.handle('search-modrinth', async (event, { query, facet }) => {
    try {
        const url = `${MODRINTH_API}/search?query=${query}&facets=[["${facet}"]]&limit=25`;
        const res = await fetch(url);
        return await res.json();
    } catch (e) {
        return { hits: [] };
    }
});

// 2. Versionen für Mod/Shader holen
ipcMain.handle('get-mod-versions', async (event, { modId, mcVersion, loader }) => {
    try {
        // Loader ist optional (für Shader/Packs leer)
        const loaderPart = loader ? `&loaders=["${loader}"]` : "";
        const url = `${MODRINTH_API}/project/${modId}/version?game_versions=["${mcVersion}"]${loaderPart}`;
        const res = await fetch(url);
        return await res.json();
    } catch (e) { return []; }
});

// 3. Lokale Dateien auflisten (Library)
ipcMain.handle('get-local-files', async (event, { instName, folder }) => {
    const p = path.join(rootDir, 'instances', instName, folder);
    if (!fs.existsSync(p)) return [];
    try {
        return fs.readdirSync(p).filter(f => !fs.statSync(path.join(p, f)).isDirectory());
    } catch (e) { return []; }
});

// 4. Content installieren (Smart Sorting)
ipcMain.on('install-content', async (event, { instName, downloadUrl, fileName, type }) => {
    // type kommt vom Filter: 'mods', 'shaderpacks' oder 'resourcepacks'
    const dest = path.join(rootDir, 'instances', instName, type, fileName);
    
    try {
        win.webContents.send('log', `[DOWNLOAD] Starte: ${fileName}...\n`);
        await download(downloadUrl, dest);
        win.webContents.send('log', `[ERFOLG] ${fileName} wurde in ${type} gespeichert.\n`);
        win.webContents.send('refresh-required'); // UI sagen, dass sie die Liste neu laden soll
    } catch (e) {
        win.webContents.send('log', `[FEHLER] Konnte ${fileName} nicht laden: ${e.message}\n`);
    }
});

// 5. Datei löschen
ipcMain.on('delete-file', (event, { instName, folder, fileName }) => {
    const p = path.join(rootDir, 'instances', instName, folder, fileName);
    if (fs.existsSync(p)) {
        fs.unlinkSync(p);
        win.webContents.send('log', `[SYSTEM] Datei entfernt: ${fileName}\n`);
        win.webContents.send('refresh-required');
    }
});

// --- INSTANZ VERWALTUNG & GENERATOR ---

ipcMain.on('get-all-versions', async (ev) => {
    try {
        const r = await fetch("https://launchermeta.mojang.com/mc/game/version_manifest.json");
        const data = await r.json();
        ev.reply('all-versions-list', data.versions.filter(v => v.type === 'release'));
    } catch (e) {}
});

ipcMain.on('get-fabric-loaders', async (ev, v) => {
    try {
        const r = await fetch(`https://meta.fabricmc.net/v2/versions/loader/${v}`);
        const data = await r.json();
        ev.reply('fabric-loaders-list', data.map(l => l.loader.version));
    } catch (e) {}
});

ipcMain.on('get-instances', (ev) => {
    const p = path.join(rootDir, 'instances');
    if (!fs.existsSync(p)) return;
    fs.readdirSync(p).forEach(f => {
        const c = path.join(p, f);
        if (fs.statSync(c).isDirectory()) {
            const j = fs.readdirSync(c).find(file => file.endsWith('.json'));
            if (j) ev.reply('instance-ready', { name: f, version: j.replace('.json', '') });
        }
    });
});

ipcMain.on('run-generator', async (e, { name, version, fabricVersion }) => {
    const instDir = path.join(rootDir, 'instances', name);
    const log = (msg, prog) => win.webContents.send('status', { msg, prog });

    try {
        log("Bereite Ordner vor...", 5);
        if (!fs.existsSync(instDir)) fs.mkdirSync(instDir, { recursive: true });
        ['mods', 'shaderpacks', 'resourcepacks', 'natives'].forEach(f => {
            const p = path.join(instDir, f);
            if (!fs.existsSync(p)) fs.mkdirSync(p);
        });

        log("Lade Minecraft Metadaten...", 15);
        const manifest = await fetch("https://launchermeta.mojang.com/mc/game/version_manifest.json").then(r => r.json());
        const vUrl = manifest.versions.find(v => v.id === version).url;
        const vData = await fetch(vUrl).then(r => r.json());

        let finalData = vData;
        if (fabricVersion) {
            log("Integriere Fabric...", 30);
            const fData = await fetch(`https://meta.fabricmc.net/v2/versions/loader/${version}/${fabricVersion}/profile/json`).then(r => r.json());
            finalData = { 
                ...fData, 
                assetIndex: vData.assetIndex, 
                downloads: { client: vData.downloads.client },
                libraries: [...fData.libraries, ...vData.libraries] 
            };
        }

        fs.writeFileSync(path.join(instDir, `${version}.json`), JSON.stringify(finalData, null, 2));
        
        log("Downloade Client.jar...", 50);
        await download(vData.downloads.client.url, path.join(instDir, 'client.jar'));

        log("Downloade Libraries...", 70);
        const libPromises = finalData.libraries.map(lib => {
            const lp = lib.downloads?.artifact ? lib.downloads.artifact.path : getLibPath(lib.name);
            const url = lib.downloads?.artifact ? lib.downloads.artifact.url : (lib.url || "https://libraries.minecraft.net/") + lp.replace(/\\/g, '/');
            return download(url, path.join(rootDir, 'libraries', lp));
        });
        await Promise.all(libPromises);

        log("Installation abgeschlossen!", 100);
        e.reply('instance-ready', { name, version });
    } catch (err) {
        win.webContents.send('log', `[FEHLER] Generator-Abbruch: ${err.message}\n`);
        log("Fehler!", 0);
    }
});

// --- SPIEL STARTEN ---

ipcMain.on('game-action', async (event, { action, name, version }) => {
    const instDir = path.join(rootDir, 'instances', name);
    
    if (action === 'start') {
        if (mcProcess) return;
        try {
            const verData = JSON.parse(fs.readFileSync(path.join(instDir, `${version}.json`), 'utf8'));
            const javaPath = await ensureJava(getRequiredJavaVersion(version));

            // Classpath bauen
            let libs = [path.join(instDir, 'client.jar')];
            verData.libraries.forEach(lib => {
                const lp = lib.downloads?.artifact ? lib.downloads.artifact.path : getLibPath(lib.name);
                const fullP = path.join(rootDir, 'libraries', lp);
                if (fs.existsSync(fullP)) libs.push(fullP);
            });

            const common = {
                '${auth_player_name}': 'ROJ_Player',
                '${version_name}': version,
                '${game_directory}': instDir,
                '${assets_root}': path.join(rootDir, 'assets'),
                '${assets_index_name}': verData.assetIndex ? verData.assetIndex.id : version,
                '${auth_uuid}': '0',
                '${auth_access_token}': '0',
                '${user_type}': 'legacy',
                '${version_type}': 'release'
            };

            let args = [
                '-Xmx4G', // 4GB RAM für Mods/Shader
                '-Djava.library.path=' + path.join(instDir, 'natives'),
                '-cp', libs.join(path.delimiter),
                verData.mainClass
            ];

            // Argumente parsen
            if (verData.arguments?.game) {
                args.push(...verData.arguments.game.filter(x => typeof x === 'string').map(a => {
                    let s = a; Object.keys(common).forEach(k => s = s.split(k).join(common[k])); return s;
                }));
            } else {
                let s = verData.minecraftArguments || "";
                Object.keys(common).forEach(k => s = s.split(k).join(common[k]));
                args.push(...s.split(' '));
            }

            win.webContents.send('log', `[START] Minecraft ${version} wird gestartet...\n`);
            mcProcess = spawn(javaPath, args, { cwd: instDir });

            mcProcess.stdout.on('data', d => win.webContents.send('log', d.toString()));
            mcProcess.stderr.on('data', d => win.webContents.send('log', `[MINECRAFT] ${d.toString()}`));
            
            mcProcess.on('close', () => {
                mcProcess = null;
                win.webContents.send('game-status', 'stopped');
                win.webContents.send('log', `[SYSTEM] Spiel beendet.\n`);
            });

            win.webContents.send('game-status', 'running');
        } catch (e) {
            win.webContents.send('log', `[FEHLER] Start fehlgeschlagen: ${e.message}\n`);
        }
    } else {
        if (mcProcess) mcProcess.kill();
    }
});

ipcMain.on('open-folder', (e, n) => shell.openPath(path.join(rootDir, 'instances', n)));

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.whenReady().then(createWindow);
