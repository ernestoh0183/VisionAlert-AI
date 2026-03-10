-- [EN] VISIONALERT AI PRIMARY SCHEMA / [ES] ESQUEMA PRINCIPAL DE VISIONALERT AI
-- [EN] Note: For a clean reset, run 'schema_reset.sql' first.
-- [ES] Nota: Para un reinicio limpio, ejecuta 'schema_reset.sql' primero.

-- [EN] Create profiles table for user settings and statistics
-- [ES] Crear tabla de perfiles para configuraciones y estadísticas del usuario
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  telegram_token TEXT,
  telegram_chat_id TEXT,
  interest_zone JSONB,
  detect_cars BOOLEAN DEFAULT true,
  detect_persons BOOLEAN DEFAULT true,
  enable_animations BOOLEAN DEFAULT true,
  total_usage_minutes INT DEFAULT 0,
  total_alerts INT DEFAULT 0,
  trip_usage_minutes INT DEFAULT 0,
  trip_alerts INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id)
);

-- [EN] Enable Row Level Security (RLS) for profiles to ensure privacy
-- [ES] Habilitar Seguridad a Nivel de Fila (RLS) para privacidad de perfiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can delete own profile" ON public.profiles FOR DELETE USING (auth.uid() = id);

-- [EN] Create alerts table to log detected events
-- [ES] Crear tabla de alertas para registrar eventos detectados
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE public.alerts (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  type text,
  quantity integer,
  photo_url text,
  PRIMARY KEY (id)
);

-- [EN] Enable RLS for alerts to prevent unauthorized access
-- [ES] Habilitar RLS para alertas para prevenir acceso no autorizado
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own alerts" ON public.alerts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own alerts" ON public.alerts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own alerts" ON public.alerts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own alerts" ON public.alerts FOR DELETE USING (auth.uid() = user_id);

-- [EN] Enable Supabase Realtime for the alerts table (Required for Dashboard updates)
-- [ES] Habilitar Supabase Realtime para la tabla de alertas (Requerido para actualizaciones del Dashboard)
ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts;

-- [EN] Setup pg_cron for automatic deletion of alerts older than 7 days
-- [ES] Configurar pg_cron para la eliminación automática de alertas con más de 7 días
-- Enable extension if needed / Habilitar extensión si es necesario
CREATE EXTENSION IF NOT EXISTS "pg_cron";

SELECT cron.schedule(
  'delete-old-alerts',
  '0 0 * * *',
  $$DELETE FROM public.alerts WHERE created_at < NOW() - INTERVAL '7 days';$$
);

-- [EN] Create 'alerts-photos' storage bucket and set permissions
-- [ES] Crear bucket de almacenamiento 'alerts-photos' y establecer permisos
INSERT INTO storage.buckets (id, name, public) 
VALUES ('alerts-photos', 'alerts-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public Read Access for Photos"
ON storage.objects FOR SELECT
USING ( bucket_id = 'alerts-photos' );

CREATE POLICY "Authenticated Users can Insert Photos"
ON storage.objects FOR INSERT
WITH CHECK ( bucket_id = 'alerts-photos' AND auth.role() = 'authenticated' );

CREATE POLICY "Authenticated Users can Delete Photos"
ON storage.objects FOR DELETE
USING ( bucket_id = 'alerts-photos' AND auth.role() = 'authenticated' );
