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

function createWindow() {
    win = new BrowserWindow({
        width: 1250, height: 850,
        backgroundColor: '#050505',
        webPreferences: { nodeIntegration: true, contextIsolation: false }
    });
    win.loadFile('index.html');
}

// --- CORE UTILS ---

function getRequiredJavaVersion(version) {
    const v = version.split('.');
    const minor = parseInt(v[1]);
    const patch = v[2] ? parseInt(v[2]) : 0;
    if (minor >= 20 && (minor > 20 || patch >= 5)) return 21;
    if (minor >= 20) return 17;
    return 8;
}

async function download(url, dest) {
    return new Promise((resolve, reject) => {
        if (!url) return resolve();
        https.get(url, { headers: { 'User-Agent': 'ROJ-Launcher' } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) 
                return download(res.headers.location, dest).then(resolve).catch(reject);
            if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            const file = fs.createWriteStream(dest);
            res.pipe(file);
            file.on('finish', () => { file.close(); resolve(); });
        }).on('error', reject);
    });
}

async function ensureJava(version, log) {
    const base = path.join(rootDir, 'runtime');
    const javaDir = path.join(base, `java${version}`);
    const javaExe = path.join(javaDir, 'bin', 'java.exe');
    if (fs.existsSync(javaExe)) return javaExe;
    
    log(`Java ${version} wird benötigt...`, 10);
    const url = `https://api.adoptium.net/v3/binary/latest/${version}/ga/windows/x64/jre/hotspot/normal/eclipse`;
    const tempZip = path.join(base, `temp_j${version}.zip`);
    await download(url, tempZip);
    try {
        const zip = new AdmZip(tempZip);
        const rootFolder = zip.getEntries()[0].entryName.split(/[\\\/]/)[0];
        zip.extractAllTo(base, true);
        fs.renameSync(path.join(base, rootFolder), javaDir);
        fs.unlinkSync(tempZip);
    } catch (e) { throw new Error("Java Install Fail"); }
    return javaExe;
}

function getLibPath(libName) {
    const parts = libName.split(':');
    const group = parts[0].replace(/\./g, '/');
    const artifact = parts[1];
    const version = parts[2];
    const classifier = parts[3] ? `-${parts[3]}` : '';
    return path.join(group, artifact, version, `${artifact}-${version}${classifier}.jar`);
}

// --- MODRINTH INTEGRATION ---

ipcMain.handle('search-mods', async (event, query) => {
    try {
        const res = await fetch(`${MODRINTH_API}/search?query=${query}&facets=[["categories:fabric"]]`);
        return await res.json();
    } catch (e) { return { hits: [] }; }
});

ipcMain.handle('get-mod-versions', async (event, { modId, mcVersion }) => {
    try {
        const res = await fetch(`${MODRINTH_API}/project/${modId}/version?loaders=["fabric"]&game_versions=["${mcVersion}"]`);
        return await res.json();
    } catch (e) { return []; }
});

ipcMain.on('install-mod', async (event, { instName, downloadUrl, fileName }) => {
    const modDir = path.join(rootDir, 'instances', instName, 'mods');
    if (!fs.existsSync(modDir)) fs.mkdirSync(modDir, { recursive: true });
    try {
        await download(downloadUrl, path.join(modDir, fileName));
        win.webContents.send('log', `[Modrinth] Installiert: ${fileName}\n`);
    } catch (e) { win.webContents.send('log', `[ERR] Mod Download: ${e.message}\n`); }
});

// --- VERSIONS & INSTANCES ---

ipcMain.on('get-all-versions', async (ev) => {
    try {
        const r = await fetch("https://launchermeta.mojang.com/mc/game/version_manifest.json");
        const data = await r.json();
        // FILTER: Lässt 1.0-1.12.2 zu UND alles ab 1.20 (Safe Zone)
        const filtered = data.versions.filter(v => {
            if (v.type !== 'release') return false;
            const minor = parseInt(v.id.split('.')[1]);
            return minor < 13 || minor >= 20;
        });
        ev.reply('all-versions-list', filtered);
    } catch (e) {}
});

ipcMain.on('get-fabric-loaders', async (ev, v) => {
    try {
        const r = await fetch(`https://meta.fabricmc.net/v2/versions/loader/${v}`);
        ev.reply('fabric-loaders-list', (await r.json()).map(l => l.loader.version));
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

ipcMain.on('open-folder', (e, n) => shell.openPath(path.join(rootDir, 'instances', n)));

// --- GENERATOR ---

ipcMain.on('run-generator', async (e, { name, version, fabricVersion = null }) => {
    const instDir = path.join(rootDir, 'instances', name);
    const log = (msg, prog) => win.webContents.send('status', { msg, prog });
    try {
        await ensureJava(getRequiredJavaVersion(version), log);
        const manifest = await fetch("https://launchermeta.mojang.com/mc/game/version_manifest.json").then(r => r.json());
        const vData = await fetch(manifest.versions.find(v => v.id === version).url).then(r => r.json());
        let finalData = vData;

        if (fabricVersion) {
            log("Fabric Setup...", 40);
            const fData = await fetch(`https://meta.fabricmc.net/v2/versions/loader/${version}/${fabricVersion}/profile/json`).then(r => r.json());
            finalData = { ...fData, assetIndex: vData.assetIndex, libraries: [...fData.libraries, ...vData.libraries] };
        }

        if (!fs.existsSync(instDir)) fs.mkdirSync(instDir, { recursive: true });
        fs.writeFileSync(path.join(instDir, `${version}.json`), JSON.stringify(finalData));
        await download(vData.downloads.client.url, path.join(instDir, 'client.jar'));

        const tasks = finalData.libraries.map(lib => {
            if (lib.downloads?.artifact) return download(lib.downloads.artifact.url, path.join(rootDir, 'libraries', lib.downloads.artifact.path));
            const lp = getLibPath(lib.name);
            return download(`${lib.url || "https://libraries.minecraft.net/"}${lp.replace(/\\/g, '/')}`, path.join(rootDir, 'libraries', lp));
        });
        await Promise.all(tasks);
        log(`Instanz erstellt!`, 100);
        e.reply('instance-ready', { name, version });
    } catch (err) { log("Installation fehlgeschlagen", 0); }
});

// --- GAME ACTION ---

ipcMain.on('game-action', async (event, { action, name, version }) => {
    const instDir = path.join(rootDir, 'instances', name);
    if (action === 'start') {
        if (mcProcess) return;
        try {
            const verData = JSON.parse(fs.readFileSync(path.join(instDir, `${version}.json`), 'utf8'));
            const javaPath = path.join(rootDir, 'runtime', `java${getRequiredJavaVersion(version)}`, 'bin', 'java.exe');

            let libs = [path.join(instDir, 'client.jar')];
            verData.libraries.forEach(lib => {
                const lp = lib.downloads?.artifact ? path.join(rootDir, 'libraries', lib.downloads.artifact.path) : path.join(rootDir, 'libraries', getLibPath(lib.name));
                if (fs.existsSync(lp)) libs.push(lp);
                if (lib.downloads?.classifiers) {
                    const nKey = lib.natives?.windows?.replace('${arch}', '64') || 'natives-windows';
                    const nArt = lib.downloads.classifiers[nKey];
                    if (nArt) {
                        const np = path.join(rootDir, 'libraries', nArt.path);
                        if (fs.existsSync(np)) libs.push(np);
                    }
                }
            });

            const common = {
                '${auth_player_name}': 'Player', '${version_name}': version, '${game_directory}': instDir,
                '${assets_root}': path.join(rootDir, 'assets'), '${assets_index_name}': verData.assetIndex ? verData.assetIndex.id : version,
                '${auth_uuid}': '0', '${auth_access_token}': '0', '${user_type}': 'legacy', '${version_type}': 'release'
            };

            let args = ['-Xmx2G', '-cp', libs.join(path.delimiter), verData.mainClass];
            if (verData.arguments?.game) {
                args.push(...verData.arguments.game.filter(x => typeof x === 'string').map(a => {
                    let s = a; Object.keys(common).forEach(k => s = s.split(k).join(common[k])); return s;
                }));
            } else {
                let s = verData.minecraftArguments || "";
                Object.keys(common).forEach(k => s = s.split(k).join(common[k]));
                args.push(...s.split(' '));
            }

            mcProcess = spawn(javaPath, args, { cwd: instDir });
            mcProcess.stdout.on('data', d => win.webContents.send('log', d.toString()));
            mcProcess.stderr.on('data', d => win.webContents.send('log', `[GAME] ${d.toString()}`));
            mcProcess.on('close', () => { mcProcess = null; win.webContents.send('game-status', 'stopped'); });
            win.webContents.send('game-status', 'running');
        } catch (e) { win.webContents.send('log', "Fehler: " + e.message); }
    } else if (mcProcess) mcProcess.kill();
});

app.whenReady().then(createWindow);
