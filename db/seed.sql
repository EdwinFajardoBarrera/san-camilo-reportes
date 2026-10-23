-- Reportes iniciales tomados del mapa original de Google My Maps (oct 2026).
-- Se insertan ya aprobados. Es seguro ejecutarlo más de una vez.
INSERT INTO reports (category, status, lat, lng, reviewed_at)
SELECT v.category, 'aprobado', v.lat, v.lng, now()
FROM (VALUES
  ('bache',          20.9728205, -89.5524880),
  ('bache',          20.9735340, -89.5523663),
  ('bache',          20.9803330, -89.5523458),
  ('bache',          20.9704409, -89.5529664),
  ('bache',          20.9723407, -89.5525548),
  ('bache',          20.9690771, -89.5540136),
  ('inundacion',     20.9726221, -89.5525132),
  ('inundacion',     20.9700539, -89.5535500),
  ('inundacion',     20.9699788, -89.5540462),
  ('sin_pavimentar', 20.9695233, -89.5530708),
  ('sin_pavimentar', 20.9686618, -89.5532639),
  ('sin_pavimentar', 20.9668385, -89.5526309)
) AS v(category, lat, lng)
WHERE NOT EXISTS (
  SELECT 1 FROM reports r WHERE r.lat = v.lat AND r.lng = v.lng AND r.category = v.category
);
