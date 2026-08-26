import sql from "mssql";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Falta la variable de entorno ${name}. Revisa la configuracion de este servidor MCP en claude_desktop_config.json.`
    );
  }
  return value;
}

const config: sql.config = {
  server: requiredEnv("MSSQL_SERVER"),
  database: requiredEnv("MSSQL_DATABASE"),
  user: requiredEnv("MSSQL_USER"),
  password: requiredEnv("MSSQL_PASSWORD"),
  port: process.env.MSSQL_PORT ? Number(process.env.MSSQL_PORT) : 1433,
  options: {
    encrypt: true,
    trustServerCertificate: process.env.MSSQL_TRUST_CERT === "true",
  },
  // Nunca se necesita mas de una consulta a la vez para este servidor.
  pool: { max: 3, min: 0, idleTimeoutMillis: 30000 },
  requestTimeout: 15000,
};

let poolPromise: Promise<sql.ConnectionPool> | null = null;

export function getPool(): Promise<sql.ConnectionPool> {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(config).connect();
  }
  return poolPromise;
}
