import pty = require('node-pty');
import { StepOptions } from '../types/stepOptions';

export function execBat(name: string, server: string, username: string): Promise<void>{
    return new Promise((resolve, reject) => {
        let ptyProcess = pty.spawn('cmd.exe', ['/c', name, server, username], {
            name: 'xterm-color',
            cwd: process.env.HOME,
            env: process.env
        });

        ptyProcess.on('data', (data) => {
        });

        ptyProcess.on('exit', (code, signal?) => {
            if(code == 0){
                resolve();
            }else{
                reject();
            }
        });
    });
}

export async function stepBat(name: string, server: string, username: string, options: StepOptions): Promise<void>{
    return new Promise((resolve, reject) => {
        options.steps[options.currentStep] = 'Processing';
        options.sse.send(options.steps);
        execBat(name, server, username).then(() => {
            options.steps[options.currentStep] = 'Completed';
            options.sse.send(options.steps);
            resolve();
        }).catch(() => {
            options.steps[options.currentStep] = 'Failed';
            options.sse.send(options.steps);
            options.sse.send({ completed: false });
            reject();
        })
    })
}