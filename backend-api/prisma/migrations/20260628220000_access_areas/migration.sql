-- CreateTable: Áreas de acesso do condomínio (configurável pelo admin)
CREATE TABLE "access_areas" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT DEFAULT '🏠',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "access_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Junção morador ↔ área de acesso
CREATE TABLE "resident_access_areas" (
    "id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "area_id" TEXT NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "granted_by" TEXT,
    CONSTRAINT "resident_access_areas_pkey" PRIMARY KEY ("id")
);

-- Foreign Keys
ALTER TABLE "resident_access_areas"
    ADD CONSTRAINT "resident_access_areas_person_id_fkey"
    FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "resident_access_areas"
    ADD CONSTRAINT "resident_access_areas_area_id_fkey"
    FOREIGN KEY ("area_id") REFERENCES "access_areas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Unique constraint: um morador só pode ter uma entrada por área
ALTER TABLE "resident_access_areas"
    ADD CONSTRAINT "resident_access_areas_person_id_area_id_key"
    UNIQUE ("person_id", "area_id");

-- Seed: áreas padrão de condomínio
INSERT INTO "access_areas" ("id", "name", "description", "icon", "is_active", "order", "updated_at") VALUES
  ('area-residencia',   'Residência',            'Acesso à unidade residencial',              '🏠', true,  1, CURRENT_TIMESTAMP),
  ('area-piscina',      'Piscina',               'Área da piscina e deck molhado',            '🏊', true,  2, CURRENT_TIMESTAMP),
  ('area-academia',     'Academia',              'Sala de ginástica e musculação',            '🏋️', true,  3, CURRENT_TIMESTAMP),
  ('area-quadra',       'Quadra de Esportes',    'Quadra poliesportiva coberta',              '⛹️', true,  4, CURRENT_TIMESTAMP),
  ('area-salao',        'Salão de Festas',       'Salão para eventos e comemorações',         '🎉', true,  5, CURRENT_TIMESTAMP),
  ('area-churrasqueira','Churrasqueira',          'Área de churrasco e lazer ao ar livre',     '🔥', true,  6, CURRENT_TIMESTAMP),
  ('area-caminhada',    'Pista de Caminhada',    'Pista ao ar livre para caminhada e corrida','🚶', true,  7, CURRENT_TIMESTAMP),
  ('area-sauna',        'Sauna',                 'Sauna seca e a vapor',                      '🧖', true,  8, CURRENT_TIMESTAMP),
  ('area-garagem',      'Garagem',               'Acesso à garagem e vagas de estacionamento','🚗', true,  9, CURRENT_TIMESTAMP),
  ('area-playground',   'Área Infantil',         'Playground e espaço para crianças',         '🛝', true, 10, CURRENT_TIMESTAMP);
