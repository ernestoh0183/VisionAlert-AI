-- [EN] FACTORY RESET SCRIPT / [ES] SCRIPT DE REINICIO DE FÁBRICA
-- [EN] WARNING: This script will DESTROY all existing VisionAlert AI tables and data.
-- [ES] ADVERTENCIA: Este script DESTRUIRÁ todas las tablas y datos existentes de VisionAlert AI.

-- [EN] Drop existing tables and their dependencies
-- [ES] Eliminar tablas existentes y sus dependencias
DROP TABLE IF EXISTS public.alerts CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- [EN] To recreate your database, run the 'schema.sql' script after this one.
-- [ES] Para recrear tu base de datos, ejecuta el script 'schema.sql' después de este.
