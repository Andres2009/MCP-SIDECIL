-- Correr UNA VEZ en la base de datos, con un usuario que tenga permisos de administracion.
-- Crea un login de SOLO LECTURA, sin acceso a nada mas que DWH.facturas.
-- Cambia 'PON_AQUI_UNA_CONTRASENA_FUERTE' antes de ejecutar.

CREATE LOGIN mcp_readonly WITH PASSWORD = 'PON_AQUI_UNA_CONTRASENA_FUERTE';
GO

CREATE USER mcp_readonly FOR LOGIN mcp_readonly;
GO

GRANT SELECT ON DWH.facturas TO mcp_readonly;
GO

-- Para agregar otra tabla mas adelante, solo repite este GRANT sobre la tabla nueva:
-- GRANT SELECT ON DWH.otratabla TO mcp_readonly;
