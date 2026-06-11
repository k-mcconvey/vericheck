-- VeriCheck seed — items table
-- Generated from data/veriscan_manifest.json
-- Run AFTER 01_schema.sql and 02_rls.sql.
-- Safe to re-run: uses ON CONFLICT DO NOTHING.

insert into public.items
  (id, image_filename, phase, type, family, case_context, stakes_tag,
   ground_truth, veriscan_score, detector_regime,
   p2_metadata, p2_explanation, p2_limitations)
values
  (1,  '1.png',  '1',       'image',    'consumer photo',  'Photograph submitted as evidence in a personal injury claim',               'civil',          'authentic',   0.000018,  'confident_correct', null, null, null),
  (2,  '2.png',  '1',       'image',    'dashcam',         'Dashcam still submitted in a motor-vehicle accident dispute',               'civil',          'authentic',   0.000336,  'confident_correct', null, null, null),
  (3,  '3.png',  '2',       'image',    'surveillance',    'CCTV/surveillance still submitted in a criminal matter',                    'criminal',       'authentic',   0.000193,  'confident_correct', 'Image file; claimed source: surveillance', '', ''),
  (4,  '4.png',  '1',       'image',    'dashcam',         'Dashcam still submitted in a motor-vehicle accident dispute',               'civil',          'authentic',   0.497338,  'uncertain',         null, null, null),
  (5,  '5.png',  '1',       'image',    'surveillance',    'CCTV/surveillance still submitted in a criminal matter',                    'criminal',       'authentic',   0.515510,  'uncertain',         null, null, null),
  (6,  '6.png',  '1',       'image',    'consumer photo',  'Photograph submitted as evidence in a personal injury claim',               'civil',          'authentic',   0.453333,  'uncertain',         null, null, null),
  (7,  '7.png',  '1',       'image',    'dashcam',         'Dashcam still submitted in a motor-vehicle accident dispute',               'civil',          'authentic',   0.999295,  'confident_error',   null, null, null),
  (8,  '8.png',  '1',       'image',    'surveillance',    'CCTV/surveillance still submitted in a criminal matter',                    'criminal',       'authentic',   0.997867,  'confident_error',   null, null, null),
  (9,  '9.png',  '1',       'image',    'consumer photo',  'Photograph submitted as evidence in a personal injury claim',               'civil',          'authentic',   0.999735,  'confident_error',   null, null, null),
  (10, '10.png', '1',       'image',    'dashcam',         'Dashcam still submitted in a motor-vehicle accident dispute',               'civil',          'manipulated', 0.000241,  'confident_error',   null, null, null),
  (11, '11.png', '1',       'image',    'surveillance',    'CCTV/surveillance still submitted in a criminal matter',                    'criminal',       'manipulated', 0.000253,  'confident_error',   null, null, null),
  (12, '12.png', 'exclude',  'image',    'consumer photo',  'Photograph submitted as evidence in a personal injury claim',               'civil',          'manipulated', 0.001051,  'confident_error',   null, null, null),
  (13, '13.png', '2',       'image',    'surveillance',    'CCTV/surveillance still submitted in a criminal matter',                    'criminal',       'manipulated', 0.502278,  'uncertain',         'Image file; claimed source: surveillance', '', ''),
  (14, '14.png', '2',       'image',    'consumer photo',  'Photograph submitted as evidence in a personal injury claim',               'civil',          'manipulated', 0.504713,  'uncertain',         'Image file; claimed source: consumer photo', '', ''),
  (15, '15.png', 'exclude',  'image',    'dashcam',         'Dashcam still submitted in a motor-vehicle accident dispute',               'civil',          'manipulated', 0.545782,  'uncertain',         null, null, null),
  (16, '16.png', '2',       'image',    'surveillance',    'CCTV/surveillance still submitted in a criminal matter',                    'criminal',       'manipulated', 0.999907,  'confident_correct', 'Image file; claimed source: surveillance', '', ''),
  (17, '17.png', '2',       'image',    'consumer photo',  'Photograph submitted as evidence in a personal injury claim',               'civil',          'manipulated', 0.999834,  'confident_correct', 'Image file; claimed source: consumer photo', '', ''),
  (18, '18.png', 'exclude',  'image',    'dashcam',         'Dashcam still submitted in a motor-vehicle accident dispute',               'civil',          'manipulated', 0.999640,  'confident_correct', null, null, null),
  (19, '19.png', 'exclude',  'image',    'dashcam',         'Dashcam still submitted in a motor-vehicle accident dispute',               'civil',          'manipulated', 0.000472,  'confident_error',   null, null, null),
  (20, '20.png', 'exclude',  'image',    'consumer photo',  'Photograph submitted as evidence in a personal injury claim',               'civil',          'manipulated', 0.495888,  'uncertain',         null, null, null),
  (21, '21.png', 'exclude',  'image',    'surveillance',    'CCTV/surveillance still submitted in a criminal matter',                    'criminal',       'manipulated', 0.999925,  'confident_correct', null, null, null),
  (22, '22.png', 'exclude',  'image',    'surveillance',    'CCTV/surveillance still submitted in a criminal matter',                    'criminal',       'manipulated', 0.034199,  'confident_error',   null, null, null),
  (23, '23.png', 'exclude',  'image',    'dashcam',         'Dashcam still submitted in a motor-vehicle accident dispute',               'civil',          'manipulated', 0.999774,  'confident_correct', null, null, null),
  (24, '24.png', 'exclude',  'image',    'consumer photo',  'Photograph submitted as evidence in a personal injury claim',               'civil',          'manipulated', 0.504716,  'uncertain',         null, null, null),
  (25, '25.png', 'exclude',  'image',    'dashcam',         'Dashcam still submitted in a motor-vehicle accident dispute',               'civil',          'manipulated', 0.441894,  'uncertain',         null, null, null),
  (26, '26.png', '1',       'document', 'document',        'Scanned document submitted in a contract dispute',                          'civil',          'authentic',   0.000498,  'confident_correct', null, null, null),
  (27, '27.png', '1',       'document', 'email',           'Email submitted as evidence in an employment matter',                       'administrative', 'authentic',   0.000611,  'confident_correct', null, null, null),
  (28, '28.png', '2',       'document', 'receipt',         'Receipt submitted in an insurance/fraud claim',                             'administrative', 'authentic',   0.001807,  'confident_correct', 'Document file; claimed source: receipt', '', ''),
  (29, '29.png', '1',       'document', 'receipt',         'Receipt submitted in an insurance/fraud claim',                             'administrative', 'authentic',   0.499700,  'uncertain',         null, null, null),
  (30, '30.png', '1',       'document', 'email',           'Email submitted as evidence in an employment matter',                       'administrative', 'authentic',   0.501318,  'uncertain',         null, null, null),
  (31, '31.png', '1',       'document', 'document',        'Scanned document submitted in a contract dispute',                          'civil',          'authentic',   0.497889,  'uncertain',         null, null, null),
  (32, '32.png', '1',       'document', 'receipt',         'Receipt submitted in an insurance/fraud claim',                             'administrative', 'authentic',   0.998618,  'confident_error',   null, null, null),
  (33, '33.png', '1',       'document', 'document',        'Scanned document submitted in a contract dispute',                          'civil',          'authentic',   0.995430,  'confident_error',   null, null, null),
  (34, '34.png', '1',       'document', 'email',           'Email submitted as evidence in an employment matter',                       'administrative', 'authentic',   0.960965,  'confident_error',   null, null, null),
  (35, '35.png', '1',       'document', 'email',           'Email submitted as evidence in an employment matter',                       'administrative', 'manipulated', 0.000604,  'confident_error',   null, null, null),
  (36, '36.png', '1',       'document', 'receipt',         'Receipt submitted in an insurance/fraud claim',                             'administrative', 'manipulated', 0.000852,  'confident_error',   null, null, null),
  (37, '37.png', 'exclude',  'document', 'document',        'Scanned document submitted in a contract dispute',                          'civil',          'manipulated', 0.001470,  'confident_error',   null, null, null),
  (38, '38.png', '2',       'document', 'receipt',         'Receipt submitted in an insurance/fraud claim',                             'administrative', 'manipulated', 0.501519,  'uncertain',         'Document file; claimed source: receipt', '', ''),
  (39, '39.png', '2',       'document', 'email',           'Email submitted as evidence in an employment matter',                       'administrative', 'manipulated', 0.501604,  'uncertain',         'Document file; claimed source: email', '', ''),
  (40, '40.png', 'exclude',  'document', 'document',        'Scanned document submitted in a contract dispute',                          'civil',          'manipulated', 0.504218,  'uncertain',         null, null, null),
  (41, '41.png', '2',       'document', 'document',        'Scanned document submitted in a contract dispute',                          'civil',          'manipulated', 0.999721,  'confident_correct', 'Document file; claimed source: document', '', ''),
  (42, '42.png', '2',       'document', 'email',           'Email submitted as evidence in an employment matter',                       'administrative', 'manipulated', 0.999651,  'confident_correct', 'Document file; claimed source: email', '', ''),
  (43, '43.png', 'exclude',  'document', 'receipt',         'Receipt submitted in an insurance/fraud claim',                             'administrative', 'manipulated', 0.999148,  'confident_correct', null, null, null),
  (44, '44.png', 'exclude',  'document', 'email',           'Email submitted as evidence in an employment matter',                       'administrative', 'manipulated', 0.000496,  'confident_error',   null, null, null),
  (45, '45.png', 'exclude',  'document', 'receipt',         'Receipt submitted in an insurance/fraud claim',                             'administrative', 'manipulated', 0.001776,  'confident_error',   null, null, null),
  (46, '46.png', 'exclude',  'document', 'receipt',         'Receipt submitted in an insurance/fraud claim',                             'administrative', 'manipulated', 0.492441,  'uncertain',         null, null, null),
  (47, '47.png', 'exclude',  'document', 'document',        'Scanned document submitted in a contract dispute',                          'civil',          'manipulated', 0.425487,  'uncertain',         null, null, null)
on conflict (id) do nothing;

-- Seed a default session_state row for each instance.
-- Add more instance_ids here if you spin up additional deployments.
insert into public.session_state (instance_id, current_phase, leaderboard_revealed)
values
  ('test',        'waiting', false),
  ('student',     'waiting', false),
  ('stakeholder', 'waiting', false)
on conflict (instance_id) do nothing;
