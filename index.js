/*jshint esversion: 8 */
const express = require('express');
const cookieParser = require('cookie-parser');
const os = require('os');
const pty = require('node-pty');
const fetch = require('node-fetch');
const { spawn } = require('child_process');

//Express & Shell
const app = express();
app.use(cookieParser());
var expressWs = require('express-ws')(app);
const SSE = require('express-sse');

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

app.get('/addUser', (req, res) => {
    admin.auth().verifyIdToken(req.cookies.access_token).then(async (claims) => {
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

        steps.CreateUser = 'Processing';
        sse.send(steps);
        console.log('Start create_user');
        execBat('bat_scripts\\create_user.bat', server, username)
        .then(() => {
            steps.CreateUser = 'Completed';
            sse.send(steps);

            steps.CreateHomeDir = 'Processing';
            sse.send(steps);
            console.log('Start create_home');
            execBat('bat_scripts\\create_home_dir.bat', server, username).then(() => {
                steps.CreateHomeDir = 'Completed';
                sse.send(steps);

                steps.CreateSshDir = 'Processing';
                sse.send(steps);
                console.log('Start create_ssh');
                execBat('bat_scripts\\create_ssh_dir.bat', server, username).then(() => {
                    steps.CreateSshDir = 'Completed';
                    sse.send(steps);

                    steps.AssociateKeys = 'Processing';
                    sse.send(steps);
                    console.log('Start add_authorized_key');
                    execBat('bat_scripts\\add_authorized_key.bat', server, username).then(async () => {
                        steps.AssociateKeys = 'Completed';
                        sse.send(steps);
                        await fetch(`http://localhost:5000/service/AddSshUser?uid=${claims.user_id}&username=${username}&serverId=${serverId}`);
                        console.log('Completed');
                        sse.send({ completed: true });
                    }).catch(() => {
                        steps.AssociateKeys = 'Failed';
                        sse.send(steps);
                        console.log('Failed');
                        sse.send({ completed: false });
                    });
                }).catch(() => {
                    steps.CreateSshDir = 'Failed';
                    sse.send(steps);
                    console.log('Failed');
                    sse.send({ completed: false });
                });
            }).catch(() => {
                steps.CreateHomeDir = 'Failed';
                sse.send(steps);
                console.log('Failed');
                sse.send({ completed: false });
            });
        })
        .catch(() => {
            steps.CreateUser = 'Failed';
            sse.send(steps);
            console.log('Failed');
            sse.send({ completed: false });
        });

        // setTimeout(() => {
        //     sse.send(steps);
        //     steps.CreateUser = "Complete";
        //     steps.CreateHomeDir = "Processing";
        //     setTimeout(() => {
        //         sse.send(steps);
        //         steps.CreateHomeDir = "Complete";
        //         steps.AssociateKeys = "Processing";
        //         setTimeout(() => {
        //             sse.send(steps);
        //             steps.AssociateKeys = "Complete";
        //             setTimeout(() => {
        //                 sse.send(steps);
        //                 setTimeout(() => {
        //                     sse.send({ completed: true });
        //                 }, 2000);
        //             }, 2000);
        //         }, 2000);
        //     }, 2000);
        // }, 1000);
    })
    .catch((err) => {

    });
});

function execBat(name, server, username){
    return new Promise((resolve, reject) => {
        let process = spawn('cmd.exe', ['/c', name, server, username]);
        console.log(process);
        process.stdout.on('data', (data) => {
            console.log(data);
        });
        process.on('close', (code) => {
            if(code == 0){
                resolve();
            }else{
                reject();
            }
        });
    });
}

// Start the application
app.listen(6000);
