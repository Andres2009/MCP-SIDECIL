-- Correr UNA VEZ, con un usuario que tenga permisos de administracion.
-- Crea un login de SOLO LECTURA, sin acceso a nada mas que dbo.VW_VISTAPRUEBAS.
-- Cambia 'PON_AQUI_UNA_CONTRASENA_FUERTE' antes de ejecutar.
-- Es seguro volver a correr este script completo: si el login o el usuario
-- ya existen, los pasos se saltan en vez de fallar.

-- IMPORTANTE: cambia esto por la base de datos real (la misma que usa
-- MSSQL_DATABASE en el .env / la config de Render).
USE Diverxamotos_4_2;
GO

IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'mcp_readonly')
BEGIN
    CREATE LOGIN mcp_readonly WITH PASSWORD = 'PON_AQUI_UNA_CONTRASENA_FUERTE';
END
GO

-- Si el login ya existia de un intento anterior y no estas seguro de la
-- contrasena, descomenta esto para fijarla a un valor conocido:
-- ALTER LOGIN mcp_readonly WITH PASSWORD = 'PON_AQUI_UNA_CONTRASENA_FUERTE';
-- GO

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'mcp_readonly')
BEGIN
    CREATE USER mcp_readonly FOR LOGIN mcp_readonly;
END
GO

GRANT SELECT ON dbo.VW_VISTAPRUEBAS TO mcp_readonly;
GO

-- Para agregar otra tabla o vista mas adelante, solo repite este GRANT:
-- GRANT SELECT ON dbo.otratabla TO mcp_readonly;
