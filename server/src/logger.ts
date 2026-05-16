import pino from "pino";
import pinoPretty from "pino-pretty";

const isDev = process.env.NODE_ENV !== "production";
const level = process.env.LOG_LEVEL ?? (isDev ? "debug" : "info");

export const logger = isDev
  ? pino({ level }, pinoPretty({ colorize: true, translateTime: "SYS:HH:MM:ss" }))
  : pino({ level });
