const { app, BrowserWindow } = require('electron');
const path = require('path');
const { startServer } = require('./server');

let mainWindow;
let serverInstance;
let serverPort;

function createWindow(port) {
    if (mainWindow) {
        mainWindow.loadURL(`http://localhost:${port}`);
        return;
    }

    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 960,
        minHeight: 600,
        backgroundColor: '#121212',
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            zoomFactor: 0.8
        }
    });

    mainWindow.loadURL(`http://localhost:${port}`);

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function startBackend() {
    process.env.DISABLE_AUTO_BROWSER = '1';
    const basePort = process.env.PORT ? parseInt(process.env.PORT, 10) || 3000 : 3000;
    serverInstance = startServer(basePort, (port, server) => {
        serverPort = port;
        serverInstance = server;
        createWindow(port);
    });
}

function stopBackend() {
    if (serverInstance && serverInstance.close) {
        try {
            serverInstance.close();
        } catch (e) {
        }
        serverInstance = null;
    }
}

app.whenReady().then(() => {
    startBackend();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0 && serverPort) {
            createWindow(serverPort);
        }
    });
});

app.on('window-all-closed', () => {
    stopBackend();
    if (process.platform === 'darwin') {
        return;
    }
    app.quit();
});
