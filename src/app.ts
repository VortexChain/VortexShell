import express from 'express';
import cookieParser from 'cookie-parser';
import os from 'os';
import pty = require('node-pty');
import fetch from 'node-fetch';

const app = express();
app.use(cookieParser());
const expressWs = require('express-ws')(app);
import SSE from 'express-sse';

const shell = os.platform() === 'win32' ? `cmd.exe` : 'bash';

import admin from "firebase-admin";
const serviceAccount = require(`../firebase-vortex.json`);

import { stepBat } from './batch/index'
import { StepOptions } from './types/stepOptions'

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://vortex-4b6db.firebaseio.com"
});

expressWs.app.ws('/shell', async (ws, req) => {

    let pingTimer = setInterval(() => {
        if(ws.readyState == 3) {
            clearInterval(pingTimer);
            return;
        }
        else{
            ws.ping("heartbeat");
        }
    }, 500);

    try{
        let claims = await admin.auth().verifyIdToken(req.cookies.access_token);
        let sshUserId: number = req.query.sshUserId;
        if(sshUserId) {
            let sshConnectionString: string = await fetch(`http://localhost:5000/service/GetSshConnecton?sshUserId=${sshUserId}&uid=${claims.user_id}`).then(res => res.json());

            ws.send('Loading...');

            const ptyProcess = pty.spawn(shell, ['/k', 'ssh', sshConnectionString], {
                name: 'xterm-color',
                cwd: process.env.PWD,
                env: process.env
            });

            ptyProcess.onData((data) => {
                console.log(data)
                ws.send(data);
            });

            ws.on('message', (msg) => {
                try{
                    let command = JSON.parse(msg);
                    if(!command.ptySafeCommand){
                        ptyProcess.write(msg);
                        return;
                    }
                    console.log(command);
                    if(command.command == 'resize'){
                        ptyProcess.resize(command.data.cols, command.data.rows)
                    }
                }catch{
                    ptyProcess.write(msg);
                }
            });

        }
        else{
            ws.close();
        }
    }catch(error){
        console.log('Unauthorized')
        ws.send('Unauthorized')
        ws.close()
        return;
    }
});

app.get('/addUser', async (req, res) => {
    let claims = await admin.auth().verifyIdToken(req.cookies.access_token);

    let args = req.query;
    let serverId = args.serverId;
    let username = args.username;

    let server = await fetch(`http://localhost:5000/service/CanCreateUser?username=${username}&serverId=${serverId}`).then(res => res.json());
    console.log('Server string', server);

    let steps = {
        CreateUser: 'Wait',
        CreateHomeDir: 'Wait',
        CreateSshDir: 'Wait',
        AssociateKeys: 'Wait'
    };

    let sse = new SSE();
    sse.init(req, res);

    let options: StepOptions = new StepOptions()
    options.sse = sse
    options.steps = steps

    options.currentStep = 'CreateUser'
    await stepBat('bat_scripts\\create_user.bat', server, username, options)

    options.currentStep = 'CreateHomeDir'
    await stepBat('bat_scripts\\create_home_dir.bat', server, username, options)

    options.currentStep = 'CreateSshDir'
    await stepBat('bat_scripts\\create_ssh_dir.bat', server, username, options)

    options.currentStep = 'AssociateKeys'
    await stepBat('bat_scripts\\add_authorized_key.bat', server, username, options)

    await fetch(`http://localhost:5000/service/AddSshUser?uid=${claims.user_id}&username=${username}&serverId=${serverId}`);
    sse.send({ completed: true });
})

// Start the application
app.listen(6000);