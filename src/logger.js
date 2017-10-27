"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const log = (...args) => {
    if (!process.env.MIGSI_QUIET) {
        console.log(...args);
    }
};
const warn = (...args) => {
    if (!process.env.MIGSI_QUIET) {
        console.warn(...args);
    }
};
const error = (...args) => {
    if (!process.env.MIGSI_QUIET) {
        console.error(...args);
    }
};
const write = (data) => {
    if (!process.env.MIGSI_QUIET) {
        process.stdout.write(data);
    }
};
const api = {
    log,
    warn,
    error,
    write
};
exports.default = api;
