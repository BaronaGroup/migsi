"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.delay = (msec) => new Promise(resolve => setTimeout(resolve, msec));
