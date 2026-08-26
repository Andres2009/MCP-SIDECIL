import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { getPool } from "./db.js";
import { assertReadOnlySelect, assertOnlyAllowedTables } from "./sqlGuard.js";

// Para agregar otra tabla despues: (1) dale GRANT SELECT en SQL Server al
// login mcp_readonly sobre esa tabla, (2) agregala aqui.
const ALLOWED_TABLES = ["dbo.VW_VISTAPRUEBAS"];
const [MAIN_TABLE_SCHEMA, MAIN_TABLE_NAME] = ALLOWED_TABLES[0].split(".");

const MAX_ROWS = 200;

function buildServer(): McpServer {
  const server = new McpServer({
    name: "facturas-mcp",
    version: "1.0.0",
  });

  server.tool(
    "listar_columnas_facturas",
    `Devuelve el nombre y tipo de cada columna de ${ALLOWED_TABLES[0]}. ` +
      "Usa esta herramienta primero, antes de escribir una consulta, si no conoces el esquema de la tabla.",
    {},
    async () => {
      try {
        const pool = await getPool();
        const result = await pool
          .request()
          .input("schema", MAIN_TABLE_SCHEMA)
          .input("table", MAIN_TABLE_NAME)
          .query(
            `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = @table
             ORDER BY ORDINAL_POSITION`
          );
        return {
          content: [{ type: "text", text: JSON.stringify(result.recordset, null, 2) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { isError: true, content: [{ type: "text", text: `Error: ${message}` }] };
      }
    }
  );

  server.tool(
    "consultar_facturas",
    `Ejecuta una consulta SQL de solo lectura (SELECT) contra ${ALLOWED_TABLES[0]} para responder ` +
      "preguntas de negocio (ventas del dia, totales por cliente, facturas de un periodo, etc). " +
      `Solo se permite SELECT sobre ${ALLOWED_TABLES[0]} -- cualquier otra cosa se rechaza. ` +
      "Si no conoces las columnas de la tabla, usa primero la herramienta listar_columnas_facturas.",
    {
      sql: z
        .string()
        .describe(
          `Consulta SQL SELECT contra ${ALLOWED_TABLES[0]}. Ejemplo: SELECT SUM(valor) AS total FROM ${ALLOWED_TABLES[0]} WHERE fecha = '2026-08-19'`
        ),
    },
    async ({ sql: query }) => {
      try {
        assertReadOnlySelect(query);
        assertOnlyAllowedTables(query, ALLOWED_TABLES);

        const pool = await getPool();
        const result = await pool.request().query(query);

        const rows = result.recordset ?? [];
        const truncated = rows.length > MAX_ROWS;

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  rowCount: rows.length,
                  truncated,
                  nota: truncated ? `Se muestran solo las primeras ${MAX_ROWS} filas.` : undefined,
                  rows: rows.slice(0, MAX_ROWS),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { isError: true, content: [{ type: "text", text: `Error: ${message}` }] };
      }
    }
  );

  return server;
}

async function runStdioServer(): Promise<void> {
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

/**
 * Modo remoto (p.ej. Render): una instancia del proceso puede atender a varios
 * clientes MCP a la vez, asi que cada request POST /mcp crea su propio
 * McpServer + transport (modo "stateless" del SDK) en vez de reusar uno global.
 */
async function runHttpServer(): Promise<void> {
  const authToken = process.env.MCP_AUTH_TOKEN;
  if (!authToken) {
    throw new Error(
      "Falta la variable de entorno MCP_AUTH_TOKEN. Es obligatoria para exponer este servidor por HTTP -- " +
        "sin ella, cualquiera con la URL podria consultar la base de datos."
    );
  }

  const app = createMcpExpressApp({ host: "0.0.0.0" });

  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({ status: "ok" });
  });

  function checkAuth(req: Request, res: Response, next: NextFunction): void {
    const header = req.header("authorization") ?? "";
    const [scheme, token] = header.split(" ");
    if (scheme !== "Bearer" || token !== authToken) {
      res.status(401).json({
        jsonrpc: "2.0",
        error: { code: -32001, message: "No autorizado. Falta o es invalido el header Authorization: Bearer <token>." },
        id: null,
      });
      return;
    }
    next();
  }

  app.post("/mcp", checkAuth, async (req: Request, res: Response) => {
    const server = buildServer();
    try {
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      res.on("close", () => {
        void transport.close();
        void server.close();
      });
    } catch (err) {
      console.error("Error manejando la solicitud MCP:", err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Error interno del servidor." },
          id: null,
        });
      }
    }
  });

  app.get("/mcp", checkAuth, (_req: Request, res: Response) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Metodo no permitido." },
      id: null,
    });
  });

  app.delete("/mcp", checkAuth, (_req: Request, res: Response) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Metodo no permitido." },
      id: null,
    });
  });

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  app.listen(port, () => {
    console.log(`facturas-mcp escuchando en el puerto ${port} (HTTP)`);
  });
}

if (process.env.MCP_TRANSPORT === "http") {
  await runHttpServer();
} else {
  await runStdioServer();
}
