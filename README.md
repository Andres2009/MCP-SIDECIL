# facturas-mcp

Servidor MCP de solo lectura para preguntarle a Claude Desktop sobre `DWH.facturas`.

## Como funciona

- Claude Desktop lanza este servidor localmente (proceso propio, se comunica por stdio).
- El servidor se conecta a SQL Server usando un login **de solo lectura** (`mcp_readonly`)
  que unicamente tiene `GRANT SELECT` sobre `DWH.facturas`. Ese permiso vive en la base
  de datos, no en este codigo -- es la barrera real de seguridad.
- Expone dos herramientas:
  - `listar_columnas_facturas`: para que Claude descubra las columnas antes de escribir SQL.
  - `consultar_facturas`: ejecuta un `SELECT` de solo lectura contra `DWH.facturas`.

## Paso 1 -- Crear el login restringido en SQL Server

Corre `setup-db-login.sql` UNA VEZ, con un usuario que tenga permisos de administracion
sobre la base de datos. Cambia la contrasena de ejemplo antes de ejecutarlo.

## Paso 2 -- Configurar las credenciales de este servidor

Crea un archivo `.env` en esta carpeta (no se sube a git) con:

```
MSSQL_SERVER=sintesiserp.com
MSSQL_DATABASE=Diverxamotos_4_2
MSSQL_USER=mcp_readonly
MSSQL_PASSWORD=la-contrasena-que-pusiste-en-el-paso-1
```

## Paso 3 -- Registrar el servidor en Claude Desktop

Abre `claude_desktop_config.json` (en Windows: `%APPDATA%\Claude\claude_desktop_config.json`)
y agrega esto dentro de `"mcpServers"`:

```json
{
  "mcpServers": {
    "facturas": {
      "command": "node",
      "args": ["C:\\Users\\Developer-07\\Documents\\DESARROLLO\\facturas-mcp\\dist\\index.js"],
      "env": {
        "MSSQL_SERVER": "sintesiserp.com",
        "MSSQL_DATABASE": "Diverxamotos_4_2",
        "MSSQL_USER": "mcp_readonly",
        "MSSQL_PASSWORD": "la-contrasena-que-pusiste-en-el-paso-1"
      }
    }
  }
}
```

Cierra Claude Desktop por completo y vuelve a abrirlo para que cargue el servidor nuevo.

## Paso 4 -- Probarlo

En Claude Desktop, pregunta algo como: *"¿Cuánto vendí hoy según DWH.facturas?"*

## Agregar otra tabla despues

1. En SQL Server: `GRANT SELECT ON DWH.otratabla TO mcp_readonly;`
2. En `src/index.ts`: agrega `"DWH.OTRATABLA"` al arreglo `ALLOWED_TABLES`, y opcionalmente
   una tool `listar_columnas_otratabla` igual a la que ya existe.
3. `npm run build` y reinicia Claude Desktop.

## Modo remoto (Render) -- para que varias personas lo usen desde Claude.ai

Por defecto el servidor corre en modo **stdio** (local, un proceso por usuario, lanzado
por Claude Desktop). Para que varias personas lo usen desde Claude.ai sin instalar nada,
se puede desplegar como servicio HTTP en Render. El mismo `dist/index.js` sirve para
los dos modos -- el switch es la variable de entorno `MCP_TRANSPORT`.

**Importante:** en modo HTTP la unica proteccion de la base de datos sigue siendo el
login de solo lectura, pero el *servidor MCP en si* queda expuesto en una URL publica.
Por eso el modo HTTP exige un token (`MCP_AUTH_TOKEN`) -- sin el, el proceso ni siquiera
arranca. Cualquiera con la URL **y** el token puede ejecutar `SELECT` contra
`DWH.facturas`, asi que trata ese token como una contrasena: no lo publiques, no lo
subas a git, y rotalo si se filtra.

### Paso 1 -- Generar un token fuerte

Por ejemplo, con PowerShell:

```powershell
-join ((48..57)+(65..90)+(97..122)|Get-Random -Count 40|%{[char]$_})
```

Guarda ese valor -- es tu `MCP_AUTH_TOKEN`.

### Paso 2 -- Crear el Web Service en Render

1. Sube este proyecto a un repositorio de GitHub (necesitas `node_modules` y `dist`
   fuera del repo -- ya estan en `.gitignore` -- Render corre `npm install` y `npm run build` el solo).
2. En Render: **New -> Web Service**, conecta el repo.
3. **Build Command:** `npm install && npm run build`
4. **Start Command:** `npm start`
5. **Environment variables** (pestaña Environment):
   ```
   MCP_TRANSPORT=http
   MCP_AUTH_TOKEN=<el token del paso 1>
   MSSQL_SERVER=sintesiserp.com
   MSSQL_DATABASE=Diverxamotos_4_2
   MSSQL_USER=mcp_readonly
   MSSQL_PASSWORD=<la contrasena del login de solo lectura>
   ```
   (Render define `PORT` automaticamente -- no hace falta agregarla.)
6. Deploy. Cuando termine, Render te da una URL tipo `https://facturas-mcp.onrender.com`.

### Paso 3 -- Probar que el servidor responde

```bash
curl https://facturas-mcp.onrender.com/health
# {"status":"ok"}

curl -X POST https://facturas-mcp.onrender.com/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer <tu MCP_AUTH_TOKEN>" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
```

Si responde con `serverInfo` y `capabilities`, el servidor esta vivo y aceptando el token.
Sin el header `Authorization` correcto debe responder `401`.

### Paso 4 -- Conectarlo desde Claude.ai / Claude Desktop

En Claude.ai (o Claude Desktop reciente): **Settings -> Connectors -> Add custom connector**,
y registra la URL `https://facturas-mcp.onrender.com/mcp` con el header de autenticacion
`Authorization: Bearer <tu MCP_AUTH_TOKEN>` (la UI exacta puede variar segun la version
de Claude -- busca la opcion de servidor MCP remoto / custom connector).

Nota: el plan free de Render "duerme" el servicio tras inactividad -- el primer request
tras el sueño puede tardar unos segundos en responder.
