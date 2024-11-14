import { logger } from "../logger.js";

// helper function to calculate string representation for a request
export function requestString(req) {
  return `${req.method} ${req.protocol}://${req.hostname}${req.url}`;
}

// helper function to log request for an endpoint
export function logHandler(req, res, next) {
  logger.http(`Received request ${requestString(req)}`);
  next();
}