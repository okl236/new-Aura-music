const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { exec } = require('child_process');
const cheerio = require('cheerio');
const crypto = require('crypto-js');
const dayjs = require('dayjs');
const he = require('he');
const qs = require('qs');
const bigInt = require('big-integer');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const NETEASE_API_BASE = process.env.NETEASE_API_BASE || 'http://localhost:3001';
const LRC_API_BASE = process.env.LRC_API_BASE || 'https://api.lrc.cx/api/v1/lyrics';

const PUBLIC_DIR = path.join(__dirname, 'public');

app.use(cors());
app.use(express.static(PUBLIC_DIR));
app.use(express.json());

const PLUGINS_DIR = path.join(__dirname, 'plugins');
if (!fs.existsSync(PLUGINS_DIR)) {
    fs.mkdirSync(PLUGINS_DIR);
}

// Global context for plugins
const pluginContext = {
    require: (moduleName) => {
        if (moduleName === 'axios') return axios;
        if (moduleName === 'cheerio') return cheerio;
        if (moduleName === 'crypto-js') return crypto;
        if (moduleName === 'dayjs') return dayjs;
        if (moduleName === 'he') return he;
        if (moduleName === 'qs') return qs;
        if (moduleName === 'big-integer') return bigInt;
        return require(moduleName);
    },
    module: { exports: {} },
    console: console,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setInterval: setInterval,
    clearInterval: clearInterval
};

const loadedPlugins = {};

process.on('unhandledRejection', err => {
    console.error('Unhandled promise rejection:', err);
});

// Helper to download and load a plugin
async function loadPlugin(name, url) {
    const filePath = path.join(PLUGINS_DIR, `${name}.js`);
    
    try {
        let code;
        if (fs.existsSync(filePath)) {
            console.log(`Loading local plugin: ${name}`);
            code = fs.readFileSync(filePath, 'utf8');
        } else {
            console.log(`Downloading plugin: ${name} from ${url}`);
            const response = await axios.get(url);
            code = response.data;
            fs.writeFileSync(filePath, code);
        }

        const context = { 
        ...pluginContext, 
        module: { exports: {} },
        exports: {} // Add exports
    };
    // Link exports to module.exports?
    // In node, they are initially the same object.
    context.exports = context.module.exports;

    vm.createContext(context);
    vm.runInContext(code, context);
    loadedPlugins[name] = context.module.exports;
        console.log(`Plugin ${name} loaded successfully.`);
        return true;
    } catch (error) {
        console.error(`Failed to load plugin ${name}:`, error.message);
        return false;
    }
}

async function fetchAndLoadPlugins() {
    await loadPlugin('qq', '');
    await loadPlugin('netease', '');
    await loadPlugin('___', '');
    await loadPlugin('____', '');
}

fetchAndLoadPlugins();

const USERS_FILE = path.join(__dirname, 'users.json');

// Helper to read/write users
function readUsers() {
    if (!fs.existsSync(USERS_FILE)) {
        return {};
    }
    try {
        return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    } catch (e) {
        console.error('Error reading users file:', e);
        return {};
    }
}

function writeUsers(users) {
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    } catch (e) {
        console.error('Error writing users file:', e);
    }
}

// Auth Endpoints
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }

    const users = readUsers();
    if (users[username]) {
        return res.status(400).json({ error: 'Username already exists' });
    }

    // Simple hash (for demonstration, use bcrypt in production usually, but crypto-js is available)
    const hashedPassword = crypto.SHA256(password).toString();

    users[username] = {
        password: hashedPassword,
        data: {
            playlists: [],
            history: [],
            liked: []
        }
    };

    writeUsers(users);
    res.json({ success: true, message: 'Registration successful' });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const users = readUsers();
    const user = users[username];

    if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    const hashedPassword = crypto.SHA256(password).toString();
    if (user.password !== hashedPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Return the user data along with success
    res.json({ 
        success: true, 
        username: username,
        data: user.data 
    });
});

app.post('/api/user/sync', (req, res) => {
    const { username, password, data } = req.body;
    // For simplicity, we're re-verifying credentials on sync since we don't have a session store/JWT setup yet.
    // In a real app, use a token.
    
    const users = readUsers();
    const user = users[username];

    if (!user) {
        return res.status(401).json({ error: 'User not found' });
    }

    // Verify password (or token if we implemented it)
    // Assuming the client sends the raw password or a hash? 
    // To be safe, let's just assume the client sends the password for this simple implementation
    // OR, we can implement a simple token system.
    // Let's stick to password verification for this "stateless" sync for now to avoid complexity,
    // or better: generate a token on login and store it in memory/file.
    
    // Actually, let's just verify password again for now as requested "simple login".
    const hashedPassword = crypto.SHA256(password).toString();
    if (user.password !== hashedPassword) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    if (data) {
        // Merge or overwrite? Let's overwrite for now as the client should have the latest state
        // But to be safer, maybe we just update specific fields
        if (data.playlists) user.data.playlists = data.playlists;
        if (data.history) user.data.history = data.history;
        if (data.liked) user.data.liked = data.liked;
        
        writeUsers(users);
    }

    res.json({ success: true, data: user.data });
});

// Get List of Loaded Plugins
app.get('/api/plugins', (req, res) => {
    res.json(Object.keys(loadedPlugins));
});

app.get('/api/platforms', (req, res) => {
    res.json(Object.keys(loadedPlugins));
});

// Search
app.get('/api/search', async (req, res) => {
    const { query, source, page = 1, type = 'music' } = req.query;
    
    if (!source || !loadedPlugins[source]) {
        // Fallback: search all or default
        // For now, return error if source not found
        return res.status(400).json({ error: 'Plugin not found or not specified' });
    }

    try {
        const plugin = loadedPlugins[source];
        if (plugin.search) {
            const result = await plugin.search(query, parseInt(page), type);
            res.json(result);
        } else {
            res.status(500).json({ error: 'Plugin does not support search' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/recommendPlaylists', async (req, res) => {
    const { refresh } = req.query; // Check if refresh is requested
    const source = 'qq';
    const plugin = loadedPlugins[source];
    if (!plugin || !plugin.search) {
        return res.status(500).json({ error: 'QQ plugin not ready' });
    }

    // Dynamic queries to ensure variety on refresh
    const rParam = refresh ? ` ${Date.now()}` : ''; // Add unique param if refreshing (though search might cache)
    
    // Better strategy: Rotate queries or use random offsets
    const queries = {
        rnb: ['R&B 流行', 'R&B 热歌', 'R&B 经典', 'R&B 新歌'],
        jp: ['日语 流行', '日语 动漫', '日语 治愈', 'J-Pop'],
        en: ['欧美 流行', 'Billboard 热歌', '欧美 经典', '欧美 节奏'],
        cn: ['华语 流行', '华语 金曲', '华语 新歌', 'C-Pop'],
        kr: ['K-Pop 热歌', '韩语 流行', '韩语 OST', 'K-Pop 舞曲']
    };

    const getRandomQuery = (key) => {
        const list = queries[key];
        return list[Math.floor(Math.random() * list.length)];
    };

    const configs = [
        { id: 'rnb', title: 'R&B 流行精选', badge: 'R&B', query: getRandomQuery('rnb') },
        { id: 'jp', title: '日语热歌推荐', badge: '日语', query: getRandomQuery('jp') },
        { id: 'en', title: '英文热门推荐', badge: '英文', query: getRandomQuery('en') },
        { id: 'cn', title: '中文流行推荐', badge: '中文', query: getRandomQuery('cn') },
        { id: 'kr', title: '韩语节奏推荐', badge: '韩语', query: getRandomQuery('kr') }
    ];

    try {
        const tasks = configs.map(async (cfg) => {
            try {
                // Add random page offset for variety (1-3)
                const randomPage = Math.floor(Math.random() * 3) + 1;
                const result = await plugin.search(cfg.query, randomPage, 'music');
                let list = [];
                if (result && Array.isArray(result.data)) {
                    list = result.data;
                } else if (Array.isArray(result)) {
                    list = result;
                }
                if (!list.length) return null;
                
                // Shuffle the list to make it look different even if same page
                for (let i = list.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [list[i], list[j]] = [list[j], list[i]];
                }

                const tracks = list.slice(0, 100);
                const first = tracks[0] || {};
                return {
                    id: cfg.id,
                    title: cfg.title,
                    badge: cfg.badge,
                    cover: first.artwork || first.cover || '',
                    subtitle: `${tracks.length} 首歌曲`,
                    tracks
                };
            } catch (e) {
                console.error('recommend playlist error', cfg.id, e.message || e);
                return null;
            }
        });

        const playlists = (await Promise.all(tasks)).filter(Boolean);
        res.json({ source, playlists });
    } catch (error) {
        console.error('recommend playlists error', error);
        res.status(500).json({ error: 'Failed to build recommend playlists' });
    }
});

app.post('/api/play', async (req, res) => {
    const { source, musicItem } = req.body;

    if (!source || !loadedPlugins[source]) {
        return res.status(400).json({ error: 'Plugin not found' });
    }

    try {
        const plugin = loadedPlugins[source];
        if (!plugin.getMediaSource) {
            return res.status(400).json({ error: 'Plugin does not support getMediaSource' });
        }

        const result = await plugin.getMediaSource(musicItem);
        if (!result || !result.url) {
            return res.status(500).json({ error: 'No media URL returned by plugin' });
        }

        if (result.headers || source === 'bilibili') {
            const proxyUrl = `/api/proxy?url=${encodeURIComponent(result.url)}`;
            return res.json({ url: proxyUrl });
        }

        res.json(result);
    } catch (error) {
        console.error('Play error:', error);
        res.status(500).json({ error: 'Failed to get media source' });
    }
});

// Proxy Endpoint
app.get('/api/proxy', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).send('Missing URL');

    try {
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Referer': 'https://www.bilibili.com/'
        };

        const response = await axios({
            method: 'get',
            url: url,
            headers: headers,
            responseType: 'stream'
        });

        // Forward headers like content-type
        if (response.headers['content-type']) {
            res.setHeader('Content-Type', response.headers['content-type']);
        }
        if (response.headers['content-length']) {
            res.setHeader('Content-Length', response.headers['content-length']);
        }

        response.data.pipe(res);
    } catch (error) {
        console.error('Proxy error:', error.message);
        res.status(500).send('Proxy failed');
    }
});

function hasTimeTag(text) {
    if (!text || typeof text !== 'string') return false;
    return /\[\d{1,2}:\d{2}(?:\.\d{1,3})?]/.test(text);
}

async function tryGetLyricFromPlugin(name, musicItem, options = {}) {
    const plugin = loadedPlugins[name];
    if (!plugin || !plugin.getLyric) return null;
    const requireTimeTag = options.requireTimeTag === true;
    if (options.useSearch) {
        if (!plugin.search) return null;
        const title = musicItem && musicItem.title ? musicItem.title : '';
        const artist = musicItem && musicItem.artist ? musicItem.artist : '';
        const query = `${title} ${artist}`.trim();
        if (!query) return null;
        const searchRes = await plugin.search(query, 1, 'lyric');
        const list = searchRes && Array.isArray(searchRes.data) ? searchRes.data : [];
        if (!list.length) return null;
        const target = list[0];
        const result = await plugin.getLyric(target);
        if (!result) return null;
        const lrc = result.lrc || result.rawLrc;
        if (!lrc) return null;
        if (requireTimeTag && !hasTimeTag(lrc)) return null;
        return lrc;
    } else {
        const result = await plugin.getLyric(musicItem);
        if (!result) return null;
        const lrc = result.lrc || result.rawLrc;
        if (!lrc) return null;
        if (requireTimeTag && !hasTimeTag(lrc)) return null;
        return lrc;
    }
}

async function getExternalFullLyric(musicItem) {
    const title = musicItem && musicItem.title ? String(musicItem.title) : '';
    const artist = musicItem && musicItem.artist ? String(musicItem.artist) : '';
    if (!title && !artist) return null;
    const base = String(LRC_API_BASE || '').replace(/\/$/, '');
    try {
        const res = await axios.get(`${base}/single`, {
            params: {
                title,
                artist
            }
        });
        if (typeof res.data !== 'string') return null;
        return res.data;
    } catch (e) {
        console.error('External full lyric api error:', e.message || e);
        return null;
    }
}

async function getNeteaseLyricBySearch(musicItem) {
    const title = musicItem && musicItem.title ? String(musicItem.title) : '';
    const artist = musicItem && musicItem.artist ? String(musicItem.artist) : '';
    const keywords = `${title} ${artist}`.trim();
    if (!keywords) return null;
    const searchRes = await axios.get(`${NETEASE_API_BASE}/search`, {
        params: {
            keywords,
            limit: 1
        }
    });
    const songs = searchRes.data && searchRes.data.result && Array.isArray(searchRes.data.result.songs)
        ? searchRes.data.result.songs
        : [];
    if (!songs.length) return null;
    const songId = songs[0].id;
    if (!songId) return null;
    const lyricRes = await axios.get(`${NETEASE_API_BASE}/lyric`, {
        params: {
            id: songId
        }
    });
    const data = lyricRes.data || {};
    let text = null;
    if (data.lrc && typeof data.lrc.lyric === 'string') {
        text = data.lrc.lyric;
    } else if (data.klyric && typeof data.klyric.lyric === 'string') {
        text = data.klyric.lyric;
    } else if (data.yrc && typeof data.yrc.lyric === 'string') {
        text = data.yrc.lyric;
    }
    if (!text) return null;
    return text;
}

app.post('/api/lyric', async (req, res) => {
    const { source, musicItem } = req.body;
    if (!source || !loadedPlugins[source]) return res.status(400).json({ error: 'Plugin not found' });

    try {
        let lrc = null;

        const fromSourcePrimary = await tryGetLyricFromPlugin(source, musicItem, { requireTimeTag: true }).catch(() => null);
        if (fromSourcePrimary) {
            lrc = fromSourcePrimary;
        }

        if (!hasTimeTag(lrc) && source === 'qq' && musicItem && musicItem.id) {
            try {
                const externalRes = await axios.get('https://matomo.oiapi.net/api/QQMusicLyric', {
                    params: { id: musicItem.id }
                });
                if (externalRes.data && externalRes.data.code === 1 && typeof externalRes.data.message === 'string') {
                    const candidate = externalRes.data.message;
                    if (hasTimeTag(candidate)) {
                        lrc = candidate;
                    } else if (!lrc) {
                        lrc = candidate;
                    }
                }
            } catch (e) {
                console.error('External lyric api error:', e.message || e);
            }
        }

        if (musicItem) {
            const fromExternalFull = await getExternalFullLyric(musicItem);
            if (fromExternalFull && hasTimeTag(fromExternalFull) && (!lrc || fromExternalFull.length > lrc.length)) {
                lrc = fromExternalFull;
            }
        }

        if (!hasTimeTag(lrc)) {
            try {
                const fromNetease = await getNeteaseLyricBySearch(musicItem);
                if (fromNetease) {
                    lrc = fromNetease;
                }
            } catch (e) {
                console.error('Netease lyric api error:', e.message || e);
            }
        }

        if (!hasTimeTag(lrc)) {
            const lyricProviders = ['____', '___'];
            for (const name of lyricProviders) {
                try {
                    const fromProvider = await tryGetLyricFromPlugin(name, musicItem, { useSearch: true, requireTimeTag: true });
                    if (fromProvider) {
                        lrc = fromProvider;
                        break;
                    }
                } catch (e) {
                }
            }
        }

        res.json({ lrc });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/import', async (req, res) => {
    const { url, source } = req.query;
    if (!url) {
        return res.status(400).json({ error: 'Missing url' });
    }

    try {
        const isNeteasePlaylist = /music\.163\.com/.test(url) && /playlist\?id=\d+/.test(url);
        if (isNeteasePlaylist) {
            const neteasePlugin = loadedPlugins['netease'];
            const qqPlugin = loadedPlugins['qq'];
            if (!neteasePlugin || !neteasePlugin.importMusicSheet) {
                return res.status(500).json({ error: 'Netease plugin not available' });
            }
            if (!qqPlugin || !qqPlugin.search) {
                return res.status(500).json({ error: 'QQ plugin not available' });
            }

            let imported = await neteasePlugin.importMusicSheet(url);
            let songs = [];
            if (Array.isArray(imported)) {
                songs = imported;
            } else if (imported && Array.isArray(imported.data)) {
                songs = imported.data;
            }

            if (!songs.length) {
                return res.json({ source: 'qq', list: [] });
            }

            const matched = [];
            for (const song of songs) {
                if (!song) continue;
                const title = song.title || song.name || '';
                const artist = song.artist || song.artists || song.singer || '';
                const parts = [];
                if (title) parts.push(String(title));
                if (artist) parts.push(String(artist));
                const query = parts.join(' ').trim();
                if (!query) continue;
                try {
                    const searchRes = await qqPlugin.search(query, 1, 'music');
                    let list = [];
                    if (searchRes && Array.isArray(searchRes.data)) {
                        list = searchRes.data;
                    } else if (Array.isArray(searchRes)) {
                        list = searchRes;
                    }
                    if (!list.length) continue;
                    matched.push(list[0]);
                } catch (e) {
                }
            }

            let playlistTitle = '';
            try {
                const pageRes = await axios.get(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0'
                    }
                });
                const $ = cheerio.load(pageRes.data || '');
                const rawTitle = $('title').text() || '';
                if (rawTitle) {
                    playlistTitle = rawTitle.split('-')[0].trim();
                }
            } catch (e) {
            }

            return res.json({
                source: 'qq',
                list: matched,
                title: playlistTitle
            });
        }

        for (const name in loadedPlugins) {
            const plugin = loadedPlugins[name];
            if (!plugin || !plugin.importMusicSheet) continue;
            if (source && source !== name) continue;
            try {
                const result = await plugin.importMusicSheet(url);
                if (result && result.length > 0) {
                    return res.json({ source: name, list: result });
                }
            } catch (e) {
            }
        }

        res.status(404).json({ error: 'No plugin could import this URL' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


function startServer(port, onListening) {
    const server = app.listen(port, () => {
        console.log(`Server running on http://localhost:${port}`);
        if (!process.env.DISABLE_AUTO_BROWSER) {
            openBrowser(port);
        }
        if (onListening) {
            onListening(port, server);
        }
    });

    server.on('error', err => {
        if (err.code === 'EADDRINUSE') {
            const nextPort = port + 1;
            console.log(`Port ${port} in use, trying ${nextPort}...`);
            startServer(nextPort, onListening);
        } else {
            console.error('Server error:', err);
        }
    });

    return server;
}

function openBrowser(port) {
    const url = `http://localhost:${port}`;
    let command;
    if (process.platform === 'win32') {
        command = `start "" "${url}"`;
    } else if (process.platform === 'darwin') {
        command = `open "${url}"`;
    } else {
        command = `xdg-open "${url}"`;
    }
    exec(command, err => {
        if (err) {
            console.error('Failed to open browser automatically:', err.message);
        }
    });
}

if (require.main === module) {
    const disableAutoBrowser = process.env.DISABLE_AUTO_BROWSER === '1' || process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';
    if (disableAutoBrowser) {
        process.env.DISABLE_AUTO_BROWSER = '1';
    }
    startServer(PORT);
}

module.exports = {
    startServer,
    app
};
