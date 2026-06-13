import fs from 'fs';
import path from 'path';

const logFilePath = path.join(__dirname, '../../workflow.log');

export const Logger = {
  info: (message: string, context?: any) => {
    const log = `[INFO] ${new Date().toISOString()} - ${message} ${context ? JSON.stringify(context) : ''}\n`;
    console.log(log.trim());
    fs.appendFileSync(logFilePath, log);
  },
  error: (message: string, error?: any) => {
    const log = `[ERROR] ${new Date().toISOString()} - ${message} ${error ? error.toString() : ''}\n`;
    console.error(log.trim());
    fs.appendFileSync(logFilePath, log);
  },
  warn: (message: string, context?: any) => {
    const log = `[WARN] ${new Date().toISOString()} - ${message} ${context ? JSON.stringify(context) : ''}\n`;
    console.warn(log.trim());
    fs.appendFileSync(logFilePath, log);
  }
};
