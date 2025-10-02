// ========= Utilidades =========
function getInputs() {
    const raw = document.getElementById('urls').value.trim();
    const urls = raw.split(/\n+/).map(s => s.trim()).filter(Boolean);
    const name = (document.getElementById('filename').value.trim() || 'AbrirEnlaces')
        .replace(/[^\w\- ]+/g, '').slice(0, 64) || 'AbrirEnlaces';
    const delay = Math.max(0, parseInt(document.getElementById('delay').value || '0', 10) || 0);
    if (!urls.length) { alert('Ingresa al menos un enlace.'); return null; }
    for (const u of urls) {
        try { const x = new URL(u); if (!/^https?:$/.test(x.protocol)) throw new Error(); }
        catch { alert('Enlace no válido: ' + u); return null; }
    }
    return { urls, name, delay };
}

function getURLsRaw() {
    return document.getElementById('urls').value;
}

function setURLsFromArray(arr) {
    document.getElementById('urls').value = arr.join('\n');
}

function appendURLsFromArray(arr) {
    const area = document.getElementById('urls');
    const existing = area.value
        .split(/\n+/).map(s => s.trim()).filter(Boolean);
    const incoming = arr
        .map(s => s.trim()).filter(Boolean);

    // Evita duplicados conservando el orden original
    const seen = new Set(existing);
    incoming.forEach(u => { if (!seen.has(u)) { existing.push(u); seen.add(u); } });
    area.value = existing.join('\n');
}


function download(filename, content, mime) {
    const blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function sleepCmd(ms) {
    return {
        bat: ms > 0 ? `timeout /t ${Math.ceil(ms / 1000)} /nobreak >nul\n` : '',
        vbs: ms > 0 ? `WScript.Sleep ${ms}\n` : '',
        ps1: ms > 0 ? `Start-Sleep -Milliseconds ${ms}\n` : '',
        sh: ms > 0 ? `sleep ${Math.ceil(ms / 1000)}\n` : ''
    };
}

// ========= Importar / Exportar =========
function normalizeToLines(text) {
    // Acepta CSV y TXT: divide por comas o saltos de línea, elimina vacíos
    return text
        .replace(/\r/g, '')
        .split(/[\n,]+/)
        .map(s => s.trim())
        .filter(Boolean);
}

function triggerImport() {
    const inp = document.getElementById('importFile');
    inp.value = ''; // reset para permitir reimportar el mismo archivo
    inp.click();
}

function importFromFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        const text = String(reader.result || '');
        const urls = normalizeToLines(text);
        if (!urls.length) { alert('No se encontraron enlaces en el archivo.'); return; }
        appendURLsFromArray(urls);
    };
    reader.onerror = () => alert('No se pudo leer el archivo.');
    reader.readAsText(file, 'utf-8');
}

function exportTXT() {
    const raw = getURLsRaw().trim();
    if (!raw) { alert('No hay enlaces para exportar.'); return; }
    const name = (document.getElementById('filename').value.trim() || 'AbrirEnlaces')
        .replace(/[^\w\- ]+/g, '').slice(0, 64) || 'AbrirEnlaces';
    download(`${name}.txt`, raw.endsWith('\n') ? raw : raw + '\n', 'text/plain;charset=utf-8');
}

function exportCSV() {
    // CSV simple: cada enlace como un campo; si tuviese coma, lo envolvemos en comillas
    const raw = getURLsRaw().trim();
    if (!raw) { alert('No hay enlaces para exportar.'); return; }
    const lines = raw.split(/\n+/).map(s => s.trim()).filter(Boolean);
    const row = lines.map(u => /[",\n]/.test(u) ? `"${u.replace(/"/g, '""')}"` : u).join(',');
    const name = (document.getElementById('filename').value.trim() || 'AbrirEnlaces')
        .replace(/[^\w\- ]+/g, '').slice(0, 64) || 'AbrirEnlaces';
    download(`${name}.csv`, row + '\n', 'text/csv;charset=utf-8');
}

function clearURLs() {
    document.getElementById('urls').value = '';
}

// ========= Drag & Drop (TXT/CSV o texto plano) =========
function setupDragAndDrop() {
    const area = document.getElementById('urls');
    if (!area) return;

    // Evita que el navegador abra el archivo
    ;['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => {
        area.addEventListener(evt, e => e.preventDefault());
        document.body.addEventListener(evt, e => e.preventDefault());
    });

    let dragCounter = 0;

    area.addEventListener('dragenter', () => {
        dragCounter++;
        area.classList.add('dropping');
    });

    area.addEventListener('dragleave', () => {
        dragCounter = Math.max(0, dragCounter - 1);
        if (dragCounter === 0) area.classList.remove('dropping');
    });

    area.addEventListener('dragover', () => {
        // Solo para mantener estilo
        area.classList.add('dropping');
    });

    area.addEventListener('drop', (e) => {
        dragCounter = 0;
        area.classList.remove('dropping');

        const dt = e.dataTransfer;
        if (!dt) return;

        // 1) Si hay archivos, leerlos (aceptamos varios)
        if (dt.files && dt.files.length) {
            const files = Array.from(dt.files).filter(f => /\.txt$|\.csv$/i.test(f.name) || !/\./.test(f.name));
            if (!files.length) {
                // si no coincide extensión, intentamos igual como texto
                tryReadPlainTextFromDataTransfer(dt);
                return;
            }
            readMultipleFilesAsText(files).then(allText => {
                const urls = normalizeToLines(allText);
                if (urls.length) appendURLsFromArray(urls);
                else alert('No se encontraron enlaces en los archivos soltados.');
            }).catch(() => alert('No se pudieron leer los archivos.'));
            return;
        }

        // 2) Si no hay archivos, intentar texto plano (copy/drag desde otra app)
        tryReadPlainTextFromDataTransfer(dt);
    });
}

function readMultipleFilesAsText(files) {
    return new Promise((resolve, reject) => {
        let remaining = files.length;
        let acc = '';
        files.forEach(f => {
            const r = new FileReader();
            r.onload = () => {
                acc += (r.result || '') + '\n';
                if (--remaining === 0) resolve(acc);
            };
            r.onerror = reject;
            r.readAsText(f, 'utf-8');
        });
    });
}

function tryReadPlainTextFromDataTransfer(dt) {
    const text = dt.getData && (dt.getData('text/plain') || dt.getData('Text'));
    if (text) {
        const urls = normalizeToLines(String(text));
        if (urls.length) appendURLsFromArray(urls);
        else alert('No se encontraron enlaces en el contenido soltado.');
    } else {
        alert('No se pudo obtener contenido de los datos arrastrados.');
    }
}

// ========= Constructores =========

// Windows .url (1 enlace) – usar CRLF
function buildURLShortcut() {
    const data = getInputs(); if (!data) return;
    const { urls, name } = data;
    if (urls.length > 1) {
        alert('El formato .url solo admite un enlace. Se usará el primero. Para varios, usa .bat/.vbs/.ps1/.sh/.command/.desktop');
    }
    const url = urls[0];
    const content = `[InternetShortcut]\r\nURL=${url}\r\nIconIndex=0\r\n`;
    download(`${name}.url`, content, 'text/plain');
}

// Windows .bat – varios enlaces
function buildBAT() {
    const data = getInputs(); if (!data) return;
    const { urls, name, delay } = data;
    const d = sleepCmd(delay).bat;
    const lines = ["@echo off\n"];
    urls.forEach((u, i) => {
        lines.push(`start "" "${u}"\n`);
        if (i < urls.length - 1) lines.push(d);
    });
    download(`${name}.bat`, lines.join(''), 'text/x-batch');
}

// Windows .vbs – sin ventana (mejor escapado)
function buildVBS() {
    const data = getInputs(); if (!data) return;
    const { urls, name, delay } = data;
    const d = sleepCmd(delay).vbs;
    let s = 'Set sh=WScript.CreateObject("WScript.Shell")\n';
    urls.forEach((u, i) => {
        // cmd /c start "" "URL"  ("" = título de ventana)
        s += 'sh.Run "cmd /c start """" "' + u + '""",0\n';
        if (i < urls.length - 1) s += d;
    });
    download(`${name}.vbs`, s, 'text/vbscript');
}

// Windows .ps1 – Start-Process
function buildPS1() {
    const data = getInputs(); if (!data) return;
    const { urls, name, delay } = data;
    const d = sleepCmd(delay).ps1;
    let s = '$ErrorActionPreference = "SilentlyContinue"\n';
    urls.forEach((u, i) => {
        s += `Start-Process "${u}"\n`;
        if (i < urls.length - 1) s += d;
    });
    download(`${name}.ps1`, s, 'text/plain');
}

// macOS .command – open
function buildCommand() {
    const data = getInputs(); if (!data) return;
    const { urls, name, delay } = data;
    const d = sleepCmd(delay).sh;
    let s = '#!/bin/bash\nset -e\n';
    urls.forEach((u, i) => {
        s += `open "${u}"\n`;
        if (i < urls.length - 1) s += d;
    });
    download(`${name}.command`, s, 'text/x-shellscript');
}

// Linux .sh – xdg-open
function buildSH() {
    const data = getInputs(); if (!data) return;
    const { urls, name, delay } = data;
    const d = sleepCmd(delay).sh;
    let s = '#!/usr/bin/env bash\nset -e\n';
    urls.forEach((u, i) => {
        s += `xdg-open "${u}" >/dev/null 2>&1 || sensible-browser "${u}" || echo "Abre manualmente: ${u}"\n`;
        if (i < urls.length - 1) s += d;
    });
    download(`${name}.sh`, s, 'text/x-shellscript');
}

// Linux .desktop – lanzador gráfico
function buildDESKTOP() {
    const data = getInputs(); if (!data) return;
    const { urls, name, delay } = data;
    const d = sleepCmd(delay).sh;

    let execBody = '#!/usr/bin/env bash\nset -e\n';
    urls.forEach((u, i) => {
        execBody += `xdg-open "${u}" >/dev/null 2>&1 || sensible-browser "${u}" || echo "Abre manualmente: ${u}"\n`;
        if (i < urls.length - 1) execBody += d;
    });

    // Escapar comillas simples para bash -lc '...'
    const escaped = execBody.replace(/'/g, `'\\''`);

    const desktop = [
        '[Desktop Entry]',
        'Type=Application',
        `Name=${name}`,
        'Terminal=false',
        `Exec=bash -lc '${escaped}'`,
        'Icon=applications-internet',
        'Categories=Network;Utility;'
    ].join('\n');

    download(`${name}.desktop`, desktop, 'application/x-desktop');
}
