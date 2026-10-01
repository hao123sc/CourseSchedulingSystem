-- 003_seed_subjects.sql · 内置通用学科与课表配色
-- 全部 stage_id 置空（通用），可在"学科"页新增/删除/改色，或按学段细分。
-- 配色取自 docs/05 视觉方向（Slate + Indigo）对应的学科调色板。
INSERT INTO subject(name,short_name,color,category,importance,need_special_room,stage_id,daily_max,week_spread,sort_order) VALUES
  ('语文','语','#EF4444','main',5,0,NULL,2,'spread',1),
  ('数学','数','#6366F1','main',5,0,NULL,2,'spread',2),
  ('英语','英','#10B981','main',5,0,NULL,2,'spread',3),
  ('物理','物','#3B82F6','main',4,0,NULL,1,'spread',4),
  ('化学','化','#F59E0B','main',4,0,NULL,1,'spread',5),
  ('生物','生','#84CC16','main',3,0,NULL,1,'spread',6),
  ('政治','政','#A855F7','minor',3,0,NULL,1,'spread',7),
  ('历史','史','#D97706','minor',3,0,NULL,1,'spread',8),
  ('地理','地','#14B8A6','minor',3,0,NULL,1,'spread',9),
  ('道德与法治','道法','#8B5CF6','minor',3,0,NULL,1,'spread',10),
  ('科学','科','#22C55E','main',3,0,NULL,1,'spread',11),
  ('信息技术','信','#64748B','minor',2,1,NULL,1,'spread',12),
  ('通用技术','技','#475569','minor',2,1,NULL,1,'spread',13),
  ('体育','体','#F97316','activity',2,1,NULL,1,'spread',14),
  ('音乐','音','#EC4899','activity',1,1,NULL,1,'spread',15),
  ('美术','美','#D946EF','activity',1,1,NULL,1,'spread',16),
  ('劳动','劳','#A16207','activity',1,0,NULL,1,'spread',17),
  ('综合实践','综','#06B6D4','activity',1,0,NULL,1,'spread',18),
  ('班会','班','#6B7280','activity',1,0,NULL,1,'spread',19);
