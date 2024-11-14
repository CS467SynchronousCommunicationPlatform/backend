import winston from "winston";

function formatLog({ level, message, timestamp }) {
  return `${timestamp} [${level.toUpperCase()}] ${message}`
}

export const logger = winston.createLogger({
  levels: {
    error: 0,
    info: 1,
    socket: 2,
    http: 3,
    debug: 4
  },
  level: "debug",
  format: winston.format.combine(
    winston.format.timestamp({ format: "MM-DD-YYYY hh:mm:ss.SSSZ" }),
    winston.format.printf(formatLog)
  ),
  transports: [new winston.transports.Console()]
});

