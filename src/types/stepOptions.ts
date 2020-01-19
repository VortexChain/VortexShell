import SSE = require('express-sse');

export class StepOptions {
    steps: object;
    currentStep: string;
    sse: SSE;
}