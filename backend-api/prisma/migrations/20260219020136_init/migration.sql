-- CreateTable
CREATE TABLE "hikcentral_configs" (
    "id" SERIAL NOT NULL,
    "api_url" TEXT NOT NULL,
    "app_key" TEXT NOT NULL,
    "app_secret" TEXT NOT NULL,
    "sync_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hikcentral_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "persons" (
    "id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "org_index_code" TEXT NOT NULL,
    "hik_person_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "persons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visitors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "certificate_type" TEXT,
    "certificate_no" TEXT,
    "phone" TEXT,
    "plate_no" TEXT,
    "visit_start_time" TIMESTAMP(3) NOT NULL,
    "visit_end_time" TIMESTAMP(3) NOT NULL,
    "hik_visitor_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_events" (
    "id" TEXT NOT NULL,
    "person_name" TEXT NOT NULL,
    "event_time" TIMESTAMP(3) NOT NULL,
    "device_name" TEXT NOT NULL,
    "door_name" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "pic_uri" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'ADMIN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "persons_hik_person_id_key" ON "persons"("hik_person_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
