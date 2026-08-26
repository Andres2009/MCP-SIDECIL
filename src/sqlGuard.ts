/**
 * Validacion de defensa-en-profundidad.
 *
 * La barrera REAL de seguridad es el login de SQL Server (mcp_readonly), que
 * solo tiene GRANT SELECT sobre las tablas permitidas -- eso lo hace el motor
 * de base de datos, no este codigo, y no se puede evadir escribiendo una
 * consulta distinta.
 *
 * Esta validacion es una segunda capa: rechaza intentos obvios de escritura
 * o de consultas multiples antes de que lleguen siquiera a la base de datos,
 * para dar un mensaje de error claro en vez de depender solo del permiso.
 */

const WRITE_KEYWORDS =
  /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|MERGE|CREATE|GRANT|REVOKE|EXEC|EXECUTE|sp_|xp_)\b/i;

export function assertReadOnlySelect(rawSql: string): void {
  const sqlText = rawSql.trim();

  if (sqlText.length === 0) {
    throw new Error("La consulta esta vacia.");
  }

  if (!/^SELECT\b/i.test(sqlText)) {
    throw new Error("Esta herramienta solo acepta consultas que empiecen con SELECT.");
  }

  if (WRITE_KEYWORDS.test(sqlText)) {
    throw new Error("La consulta contiene una palabra clave no permitida (solo se permite SELECT de lectura).");
  }

  // No permitir mas de un statement (bloquea "; DROP TABLE ..." al final).
  const withoutTrailingSemicolon = sqlText.replace(/;\s*$/, "");
  if (withoutTrailingSemicolon.includes(";")) {
    throw new Error("Solo se permite una sola sentencia SELECT por consulta.");
  }
}

export function assertOnlyAllowedTables(rawSql: string, allowedTables: string[]): void {
  const normalized = rawSql.toUpperCase();
  const referenced = [...normalized.matchAll(/\b(?:FROM|JOIN)\s+([A-Z0-9_.\[\]]+)/g)].map((m) => m[1].replace(/[\[\]]/g, ""));

  const allowedUpper = allowedTables.map((t) => t.toUpperCase());

  for (const table of referenced) {
    if (!allowedUpper.includes(table)) {
      throw new Error(
        `La tabla "${table}" no esta permitida en este servidor. Tablas permitidas: ${allowedTables.join(", ")}.`
      );
    }
  }
}
