const audio = document.getElementById('audio-player');
const platformSelect = document.getElementById('platform-select');
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const songList = document.getElementById('song-list');
const immersivePlayer = document.getElementById('immersive-player');
const expandBtn = document.getElementById('expand-btn');
const collapseBtn = document.getElementById('collapse-btn');
const barCover = document.getElementById('bar-cover');
const immersiveCover = document.getElementById('immersive-cover');

const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_BASE = isLocal
    ? 'http://localhost:3000'
    : 'https://42c78fba-3049-40a4-9f7c-fb8351517ceb-00-sxs6c9q1b5c4.sisko.replit.dev';

// State
let currentPlaylist = [];
let currentIndex = -1;
let isPlaying = false;

// Init
async function init() {
    try {
        const res = await fetch(`${API_BASE}/api/platforms`);
        const platforms = await res.json();
        platformSelect.innerHTML = platforms.map(p => `<option value="${p}">${p.toUpperCase()}</option>`).join('');
    } catch (e) {
        console.error('Failed to load platforms', e);
    }

    // Event Listeners
    searchBtn.addEventListener('click', doSearch);
    searchInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') doSearch();
    });

    document.getElementById('bar-play-btn').addEventListener('click', togglePlay);
    document.getElementById('immersive-play-btn').addEventListener('click', togglePlay);
    
    expandBtn.addEventListener('click', () => immersivePlayer.classList.add('active'));
    collapseBtn.addEventListener('click', () => immersivePlayer.classList.remove('active'));
    
    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('ended', playNext);
    
    document.querySelector('.search-bar-container').style.display = 'flex';
    
    document.querySelector('.action-btn').addEventListener('click', importPlaylist);
    const actionBtns = document.querySelectorAll('.action-btn');
    if (actionBtns.length > 1) {
        actionBtns[1].addEventListener('click', importPlaylist);
    }
}

async function importPlaylist() {
    const url = prompt('Please enter the playlist URL (NetEase, etc.):');
    if (!url) return;

    songList.innerHTML = '<div style="padding:20px; text-align:center;">Importing...</div>';
    
    try {
        const res = await fetch(`${API_BASE}/api/import?url=${encodeURIComponent(url)}`);
        if (!res.ok) throw new Error('Import failed');
        
        const data = await res.json();
        const list = data.list || [];
        
        if (list.length === 0) {
            alert('No songs found in playlist.');
            return;
        }
        
        currentPlaylist = list;
        renderList(list);
        alert(`Imported ${list.length} songs from ${data.source}`);
    } catch (e) {
        console.error(e);
        alert('Failed to import playlist. Ensure the plugin supports it.');
        songList.innerHTML = '';
    }
}

async function doSearch() {
    const platform = platformSelect.value;
    const query = searchInput.value;
    if (!query) return;

    songList.innerHTML = '<div style="padding:20px; text-align:center;">Loading...</div>';

    try {
        const res = await fetch(`${API_BASE}/api/search?source=${platform}&query=${encodeURIComponent(query)}&type=music`);
        const data = await res.json();
        
        // Bilibili plugin structure: { musicList: [...] } or { data: [...] } depending on version
        // The checked plugin returns { data: [...], ... } from searchAlbum/searchArtist
        // But the search function in the file returns the result of searchAlbum directly.
        // Let's inspect the result in console if needed, but for now assume standard structure.
        
        let list = data.data || data.musicList || [];
        if (!Array.isArray(list)) list = [];
        
        currentPlaylist = list;
        renderList(list);
    } catch (e) {
        console.error(e);
        songList.innerHTML = '<div style="padding:20px; text-align:center;">Search failed</div>';
    }
}

function renderList(list) {
    songList.innerHTML = '';
    list.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'song-item';
        div.innerHTML = `
            <span class="col-index">${index + 1}</span>
            <div class="col-title">
                <img src="${item.artwork || 'https://placehold.co/40'}" alt="cover">
                <span>${item.title}</span>
            </div>
            <span class="col-artist">${item.artist || 'Unknown'}</span>
            <span class="col-album">${item.album || ''}</span>
            <span class="col-time">${formatTime(item.duration)}</span>
        `;
        div.addEventListener('click', () => playSong(index));
        songList.appendChild(div);
    });
}

async function playSong(index) {
    currentIndex = index;
    const item = currentPlaylist[index];
    
    // Update UI
    updatePlayerUI(item);
    
    try {
        const platform = platformSelect.value;
        const res = await fetch(`${API_BASE}/api/play`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                source: platform,
                musicItem: item
            })
        });
        const data = await res.json();
        
        if (data.url) {
            audio.src = data.url;
            audio.play();
            isPlaying = true;
            updatePlayButtons();
            
            // Show immersive player automatically
            immersivePlayer.classList.add('active');
        } else {
            alert('No playback URL found');
        }
    } catch (e) {
        console.error(e);
        alert('Failed to play song');
    }
}

function updatePlayerUI(item) {
    const title = item.title || 'No Title';
    const artist = item.artist || 'Unknown';
    const cover = item.artwork || 'https://placehold.co/400';

    document.getElementById('bar-title').innerText = title;
    document.getElementById('bar-artist').innerText = artist;
    document.getElementById('bar-cover').src = cover;
    
    document.getElementById('immersive-title').innerText = title;
    document.getElementById('immersive-artist').innerText = artist;
    document.getElementById('immersive-cover').src = cover;
    
    // Update background gradient based on cover (simulated with random colors for now)
    // In a real app we'd extract colors.
}

function togglePlay() {
    if (audio.paused) {
        audio.play();
        isPlaying = true;
    } else {
        audio.pause();
        isPlaying = false;
    }
    updatePlayButtons();
}

function updatePlayButtons() {
    const icon = isPlaying ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
    document.getElementById('bar-play-btn').innerHTML = icon;
    document.getElementById('immersive-play-btn').innerHTML = icon;
}

function updateProgress() {
    const percent = (audio.currentTime / audio.duration) * 100 || 0;
    document.getElementById('bar-progress').style.width = `${percent}%`;
    document.getElementById('immersive-progress').style.width = `${percent}%`;
    
    document.getElementById('bar-current-time').innerText = formatTime(audio.currentTime);
    document.getElementById('bar-duration').innerText = formatTime(audio.duration);
    document.getElementById('immersive-current-time').innerText = formatTime(audio.currentTime);
    document.getElementById('immersive-duration').innerText = formatTime(audio.duration);
}

function playNext() {
    if (currentIndex < currentPlaylist.length - 1) {
        playSong(currentIndex + 1);
    }
}

function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

init();
