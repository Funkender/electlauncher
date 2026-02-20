<!DOCTYPE html>
<html>
<head>
    <style>
        :root { 
            --accent: #00ff88; 
            --accent-glow: rgba(0, 255, 136, 0.3);
            --bg: #050505; 
            --panel: rgba(15, 15, 15, 0.85); 
            --card: rgba(255, 255, 255, 0.03);
            --text-main: #ffffff;
            --text-dim: #777;
            --glass-border: rgba(255, 255, 255, 0.07);
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }

        body { 
            background: var(--bg); 
            background-image: radial-gradient(circle at 50% -10%, #11251b 0%, var(--bg) 70%);
            color: var(--text-main); 
            font-family: 'Inter', sans-serif; 
            display: flex; margin: 0; height: 100vh; overflow: hidden; 
        }

        /* SIDEBAR */
        .sidebar { 
            width: 320px; 
            background: var(--panel); 
            backdrop-filter: blur(20px);
            border-right: 1px solid var(--glass-border); 
            padding: 40px 24px; 
            display: flex; flex-direction: column;
        }

        .sidebar h2 {
            font-size: 0.8rem;
            letter-spacing: 4px;
            color: var(--text-dim);
            text-transform: uppercase;
            margin-bottom: 40px;
        }

        /* INSTANZ KARTEN */
        .inst-list { flex: 1; overflow-y: auto; margin-bottom: 20px; }
        .inst-card { 
            background: var(--card); 
            padding: 18px; 
            border-radius: 14px; 
            border: 1px solid var(--glass-border); 
            cursor: pointer; 
            margin-bottom: 12px; 
            display: flex; justify-content: space-between; align-items: center; 
            transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .inst-card:hover { 
            background: rgba(255, 255, 255, 0.07);
            transform: scale(1.02);
        }

        .inst-card.active { 
            border-color: var(--accent); 
            background: rgba(0, 255, 136, 0.05);
        }

        /* BUTTONS */
        .btn-add { 
            background: white; color: black; padding: 14px; border-radius: 12px;
            font-weight: 700; border: none; margin-bottom: 30px; cursor: pointer;
            transition: 0.3s;
        }

        .play-btn { 
            background: var(--accent); width: 380px; height: 90px; 
            font-size: 24px; font-weight: 800; letter-spacing: 6px;
            border-radius: 18px; color: black; border: none; cursor: pointer;
            transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .play-btn:disabled { background: #111; color: #333; cursor: not-allowed; }

        /* MODAL */
        .modal-overlay { 
            position: fixed; inset: 0; background: rgba(0,0,0,0.85); 
            backdrop-filter: blur(15px); display: none; justify-content: center; 
            align-items: center; z-index: 100;
        }

        .modal-content { 
            background: #0f0f0f; padding: 40px; border-radius: 28px; 
            border: 1px solid var(--glass-border); width: 500px; 
            display: flex; flex-direction: column; gap: 20px;
        }

        /* MOD SEARCH SPECIFIC */
        #mod-results { height: 350px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
        .mod-item { 
            display: flex; align-items: center; gap: 15px; background: rgba(255,255,255,0.03);
            padding: 12px; border-radius: 12px; border: 1px solid var(--glass-border);
        }

        /* MISC */
        .main { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 30px; }
        #log { width: 80%; height: 100px; background: rgba(0,0,0,0.3); border-radius: 12px; padding: 15px; font-family: monospace; font-size: 10px; color: #555; overflow-y: auto; }
        input, select { padding: 12px; border-radius: 8px; background: #1a1a1a; border: 1px solid #333; color: white; }
        .folder-btn { background: none; border: 1px solid #333; color: white; padding: 8px; border-radius: 8px; cursor: pointer; }
        .folder-btn:hover { background: white; color: black; }
    </style>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap" rel="stylesheet">
</head>
<body>

    <div id="gen-modal" class="modal-overlay">
        <div class="modal-content">
            <h2 style="margin:0">Neue Instanz</h2>
            <input type="text" id="new-name" placeholder="Name...">
            <select id="version-select" onchange="updateLoaderOptions()"></select>
            <select id="loader-type" onchange="updateLoaderOptions()">
                <option value="vanilla">Vanilla</option>
                <option value="fabric">Fabric</option>
            </select>
            <div id="fabric-group" style="display:none;"><select id="fabric-select" style="width:100%"></select></div>
            <div id="gen-status" style="text-align:center; color:var(--accent); font-size:12px;">Bereit</div>
            <div style="display:flex; gap:10px">
                <button class="btn-add" style="background:#222; color:white; flex:1; margin:0" onclick="closeModal('gen-modal')">Abbrechen</button>
                <button class="btn-add" style="flex:2; margin:0" onclick="confirmGen()">Erstellen</button>
            </div>
        </div>
    </div>

    <div id="mod-modal" class="modal-overlay">
        <div class="modal-content" style="width: 600px;">
            <h2 style="margin:0">Modrinth Explorer</h2>
            <div style="display:flex; gap:10px">
                <input type="text" id="mod-search-input" placeholder="Suche Mods (z.B. Sodium)..." style="flex:1">
                <button class="btn-add" style="margin:0; padding:0 20px" onclick="searchMods()">Suche</button>
            </div>
            <div id="mod-results"></div>
            <button class="btn-add" style="background:#222; color:white; width:100%; margin:0" onclick="closeModal('mod-modal')">Schließen</button>
        </div>
    </div>

    <div class="sidebar">
        <h2>ROJ Launcher</h2>
        <button class="btn-add" onclick="openModal('gen-modal')">+ NEUE INSTANZ</button>
        <div id="instance-list" class="inst-list"></div>
    </div>

    <div class="main">
        <div style="text-align:center">
            <h1 id="current-name" style="font-size:4rem; margin:0">ROJ</h1>
            <p id="current-meta" style="color:#444; letter-spacing:3px; font-weight:bold">WÄHLE EINE INSTANZ</p>
            <button id="mod-mgr-btn" class="folder-btn" onclick="openModal('mod-modal')" style="display:none; margin-top:15px; border-color:var(--accent); color:var(--accent)">📦 MODS VERWALTEN</button>
        </div>

        <button id="play-btn" class="play-btn" onclick="toggleGame()" disabled>SPIELEN</button>
        <div id="log">Console ready...</div>
    </div>

    <script>
        const { ipcRenderer } = require('electron');
        let selected = null;
        let isRunning = false;

        window.onload = () => {
            ipcRenderer.send('get-instances');
            ipcRenderer.send('get-all-versions');
        };

        function openModal(id) { document.getElementById(id).style.display = 'flex'; }
        function closeModal(id) { document.getElementById(id).style.display = 'none'; }

        // --- VERSIONEN & FABRIC ---
        ipcRenderer.on('all-versions-list', (e, v) => {
            const s = document.getElementById('version-select');
            s.innerHTML = v.map(v => `<option value="${v.id}">Minecraft ${v.id}</option>`).join('');
            updateLoaderOptions();
        });

        function updateLoaderOptions() {
            const type = document.getElementById('loader-type').value;
            const mcVer = document.getElementById('version-select').value;
            if (type === 'fabric') {
                document.getElementById('fabric-group').style.display = 'block';
                ipcRenderer.send('get-fabric-loaders', mcVer);
            } else {
                document.getElementById('fabric-group').style.display = 'none';
            }
        }

        ipcRenderer.on('fabric-loaders-list', (e, l) => {
            document.getElementById('fabric-select').innerHTML = l.map(v => `<option value="${v}">Fabric ${v}</option>`).join('');
        });

        // --- INSTANZEN ---
        function confirmGen() {
            const name = document.getElementById('new-name').value;
            const version = document.getElementById('version-select').value;
            const loader = document.getElementById('loader-type').value;
            if(!name) return;
            ipcRenderer.send('run-generator', { name, version, fabricVersion: loader === 'fabric' ? document.getElementById('fabric-select').value : null });
        }

        ipcRenderer.on('instance-ready', (e, data) => {
            closeModal('gen-modal');
            const div = document.createElement('div');
            div.className = 'inst-card';
            div.innerHTML = `<div><b>${data.name}</b><br><small style="color:#555">${data.version}</small></div><button class="folder-btn" onclick="openFolder(event, '${data.name}')">📂</button>`;
            div.onclick = () => {
                document.querySelectorAll('.inst-card').forEach(c => c.classList.remove('active'));
                div.classList.add('active');
                selected = data;
                document.getElementById('play-btn').disabled = false;
                document.getElementById('current-name').innerText = data.name;
                document.getElementById('current-meta').innerText = data.version;
                // Zeige Mod-Manager nur wenn Fabric erkannt wird
                document.getElementById('mod-mgr-btn').style.display = data.version.toLowerCase().includes('fabric') ? 'inline-block' : 'none';
            };
            document.getElementById('instance-list').appendChild(div);
        });

        // --- MODRINTH LOGIK ---
        async function searchMods() {
            const query = document.getElementById('mod-search-input').value;
            const res = await ipcRenderer.invoke('search-mods', query);
            const container = document.getElementById('mod-results');
            container.innerHTML = res.hits.map(mod => `
                <div class="mod-item">
                    <img src="${mod.icon_url}" style="width:40px;height:40px;border-radius:8px">
                    <div style="flex:1"><b>${mod.title}</b><br><small style="color:#555">${mod.author}</small></div>
                    <button class="folder-btn" onclick="installMod('${mod.project_id}', '${mod.title}')">Install</button>
                </div>
            `).join('');
        }

        async function installMod(id, title) {
            const versions = await ipcRenderer.invoke('get-mod-versions', { modId: id, mcVersion: selected.version });
            if(!versions.length) return alert("Keine Version für " + selected.version + " gefunden!");
            const file = versions[0].files.find(f => f.primary) || versions[0].files[0];
            ipcRenderer.send('install-mod', { instName: selected.name, downloadUrl: file.url, fileName: file.filename });
        }

        // --- GAME CONTROL ---
        function toggleGame() { ipcRenderer.send('game-action', { action: isRunning ? 'stop' : 'start', name: selected.name, version: selected.version }); }
        function openFolder(e, n) { e.stopPropagation(); ipcRenderer.send('open-folder', n); }

        ipcRenderer.on('game-status', (e, s) => {
            isRunning = (s === 'running');
            const btn = document.getElementById('play-btn');
            btn.innerText = isRunning ? 'STOP' : 'SPIELEN';
            btn.style.background = isRunning ? '#ff3333' : '#00ff88';
        });

        ipcRenderer.on('status', (e, d) => { document.getElementById('gen-status').innerText = `${d.msg} ${d.prog}%`; });
        ipcRenderer.on('log', (e, m) => { const l = document.getElementById('log'); l.innerText += m; l.scrollTop = l.scrollHeight; });
    </script>
</body>
</html>
