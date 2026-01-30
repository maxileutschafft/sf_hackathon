// Centralized logging utility with environment-based control

const DEBUG = process.env.NODE_ENV !== 'production' && process.env.REACT_APP_DEBUG !== 'false';

export const logger = {
  debug: (...args) => {
    if (DEBUG) console.log('[DEBUG]', ...args);
  },
  
  info: (...args) => {
    if (DEBUG) console.info('[INFO]', ...args);
  },
  
  warn: (...args) => {
    console.warn('[WARN]', ...args);
  },
  
  error: (...args) => {
    console.error('[ERROR]', ...args);
  }
};
