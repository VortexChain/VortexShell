/*jshint esversion: 8 */
const express = require('express');
const cookieParser = require('cookie-parser');
const os = require('os');
const pty = require('node-pty');
const fetch = require('node-fetch');

//Express & Shell
const app = express();
app.use(cookieParser());
var expressWs = require('express-ws')(app);
const shell = os.platform() === 'win32' ? `cmd.exe` : 'bash';

//Firebase Admin
const admin = require("firebase-admin");
const serviceAccount = require("./firebase-vortex.json");
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://vortex-4b6db.firebaseio.com"
});

//Open websocket
expressWs.app.ws('/shell', (ws, req) => {
    //Verify user
    admin.auth().verifyIdToken(req.cookies.access_token).then(async (claims) => {
        //Get sshUserId arg
        let sshUserId = req.query.sshUserId;

        if(sshUserId){
            //Request sshConnectionString from core
            let sshConnectionString = await fetch(`http://localhost:5000/service/GetSshConnecton?sshUserId=${sshUserId}&uid=${claims.user_id}`).then(res => res.json());

            // Spawn the shell
            const ptyProcess = pty.spawn(shell, ['/k', 'ssh', sshConnectionString], {
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
        }
        else{
            ws.close();
        }
    });
    //Heartbeat
    let pingTimer = setInterval(() => {
        if(ws.readyState == 3) {
            clearInterval(pingTimer);
            return;
        }
        else{
            ws.ping("heartbeat");
        }
    }, 500);

});

// Start the application
app.listen(6000);
