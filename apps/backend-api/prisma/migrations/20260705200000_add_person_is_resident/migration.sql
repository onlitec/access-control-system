-- Proprietário pode não residir no condomínio; morador pode não ser proprietário.
-- is_resident distingue quem efetivamente mora na unidade (default true preserva
-- o comportamento atual: todos os cadastros existentes contam como moradores).
ALTER TABLE "persons" ADD COLUMN IF NOT EXISTS "is_resident" BOOLEAN DEFAULT true;
