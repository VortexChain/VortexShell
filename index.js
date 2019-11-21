const express = require('express');
const os = require('os');
const pty = require('node-pty');

const app = express();
var expressWs = require('express-ws')(app);
const shell = os.platform() === 'win32' ? `${__dirname}/start.bat` : 'bash';

app.use(express.static(`${__dirname}/static`));

expressWs.app.ws('/shell', (ws, req) => {

    //Heartbeat
    let pingTimer = setInterval(() => {
        if(ws.readyState == 3) {
            clearInterval(pingTimer)
            return
        }
        else{
            ws.ping("heartbeat");
        }
    }, 500);

    // Spawn the shell
    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-color',
      cwd: process.env.PWD,
      env: process.env
    });
    // For all shell data send it to the websocket
    ptyProcess.on('data', (data) => {
      ws.send(data);
    });
    // For all websocket data send it to the shell
    ws.on('message', (msg) => {
        ptyProcess.write(msg);
    });
});

// Start the application
app.listen(6000);
