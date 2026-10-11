BEGIN;

-- ============================================================================
-- PTAS Migration 0029: Add Official Office Address to Jurisdictions Table
-- Enhances public.jurisdictions with office_address for Form PFT-2 Challan
-- statutory administrative footer.
-- ============================================================================

ALTER TABLE public.jurisdictions
  ADD COLUMN IF NOT EXISTS office_address text;

-- Populate official office address for Vehari District & Vehari Tehsil
UPDATE public.jurisdictions
  SET office_address = 'Excise & Taxation Office, Danewal Road, Near General Bus Stand, Vehari'
  WHERE code IN ('DIST_VEH', 'TEH_VEH')
     OR (tier = 'DISTRICT' AND name = 'Vehari')
     OR (tier = 'TEHSIL' AND name = 'Vehari');

-- Burewala Sub-Office
UPDATE public.jurisdictions
  SET office_address = 'Excise & Taxation Sub-Office, Old Tehsil Road, Burewala'
  WHERE code ILIKE '%BUR%' OR name ILIKE '%Burewala%';

-- Mailsi Sub-Office
UPDATE public.jurisdictions
  SET office_address = 'Excise & Taxation Sub-Office, Colony Road, Mailsi'
  WHERE code ILIKE '%MAIL%' OR name ILIKE '%Mailsi%';

-- Cascade Vehari office address to all Vehari Circles that do not have their own address
UPDATE public.jurisdictions
  SET office_address = 'Excise & Taxation Office, Danewal Road, Near General Bus Stand, Vehari'
  WHERE tier = 'CIRCLE'
    AND (code ILIKE 'CIR_VEH%' OR name ILIKE 'Circle %')
    AND office_address IS NULL;

COMMIT;
