-- 002_seed_stages.sql · 内置三学段与默认作息
-- 学段：小学 / 初中 / 高中（可在"学段与作息编辑器"中增删改）
-- 默认作息（仅教学节次，用户可编辑）：
--   小学 = 上午4 + 下午3 = 7 节/天，5 天制
--   初中 = 上午5 + 下午3 = 8 节/天，5 天制
--   高中 = 早读 + 上午5 + 下午4 + 晚自习3 = 13 节/天，5 天制，含晚自习
INSERT INTO stage(code,name,sort_order,days_per_week,has_evening,enabled) VALUES
  ('primary','小学',1,5,0,1),
  ('junior','初中',2,5,0,1),
  ('senior','高中',3,5,1,1);

-- 小学作息
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='primary'),1,1,'第1节','morning','08:00','08:40',1,1);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='primary'),1,2,'第2节','morning','08:50','09:30',1,2);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='primary'),1,3,'第3节','morning','09:50','10:30',1,3);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='primary'),1,4,'第4节','morning','10:40','11:20',1,4);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='primary'),1,5,'第5节','afternoon','14:00','14:40',1,5);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='primary'),1,6,'第6节','afternoon','14:50','15:30',1,6);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='primary'),1,7,'第7节','afternoon','15:40','16:20',1,7);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='primary'),2,1,'第1节','morning','08:00','08:40',1,1);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='primary'),2,2,'第2节','morning','08:50','09:30',1,2);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='primary'),2,3,'第3节','morning','09:50','10:30',1,3);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='primary'),2,4,'第4节','morning','10:40','11:20',1,4);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='primary'),2,5,'第5节','afternoon','14:00','14:40',1,5);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='primary'),2,6,'第6节','afternoon','14:50','15:30',1,6);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='primary'),2,7,'第7节','afternoon','15:40','16:20',1,7);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='primary'),3,1,'第1节','morning','08:00','08:40',1,1);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='primary'),3,2,'第2节','morning','08:50','09:30',1,2);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='primary'),3,3,'第3节','morning','09:50','10:30',1,3);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='primary'),3,4,'第4节','morning','10:40','11:20',1,4);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='primary'),3,5,'第5节','afternoon','14:00','14:40',1,5);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='primary'),3,6,'第6节','afternoon','14:50','15:30',1,6);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='primary'),3,7,'第7节','afternoon','15:40','16:20',1,7);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='primary'),4,1,'第1节','morning','08:00','08:40',1,1);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='primary'),4,2,'第2节','morning','08:50','09:30',1,2);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='primary'),4,3,'第3节','morning','09:50','10:30',1,3);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='primary'),4,4,'第4节','morning','10:40','11:20',1,4);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='primary'),4,5,'第5节','afternoon','14:00','14:40',1,5);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='primary'),4,6,'第6节','afternoon','14:50','15:30',1,6);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='primary'),4,7,'第7节','afternoon','15:40','16:20',1,7);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='primary'),5,1,'第1节','morning','08:00','08:40',1,1);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='primary'),5,2,'第2节','morning','08:50','09:30',1,2);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='primary'),5,3,'第3节','morning','09:50','10:30',1,3);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='primary'),5,4,'第4节','morning','10:40','11:20',1,4);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='primary'),5,5,'第5节','afternoon','14:00','14:40',1,5);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='primary'),5,6,'第6节','afternoon','14:50','15:30',1,6);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='primary'),5,7,'第7节','afternoon','15:40','16:20',1,7);

-- 初中作息
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='junior'),1,1,'第1节','morning','08:00','08:45',1,1);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='junior'),1,2,'第2节','morning','08:55','09:40',1,2);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='junior'),1,3,'第3节','morning','10:00','10:45',1,3);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='junior'),1,4,'第4节','morning','10:55','11:40',1,4);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='junior'),1,5,'第5节','morning','11:50','12:35',1,5);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='junior'),1,6,'第6节','afternoon','14:00','14:45',1,6);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='junior'),1,7,'第7节','afternoon','14:55','15:40',1,7);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='junior'),1,8,'第8节','afternoon','15:50','16:35',1,8);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='junior'),2,1,'第1节','morning','08:00','08:45',1,1);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='junior'),2,2,'第2节','morning','08:55','09:40',1,2);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='junior'),2,3,'第3节','morning','10:00','10:45',1,3);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='junior'),2,4,'第4节','morning','10:55','11:40',1,4);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='junior'),2,5,'第5节','morning','11:50','12:35',1,5);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='junior'),2,6,'第6节','afternoon','14:00','14:45',1,6);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='junior'),2,7,'第7节','afternoon','14:55','15:40',1,7);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='junior'),2,8,'第8节','afternoon','15:50','16:35',1,8);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='junior'),3,1,'第1节','morning','08:00','08:45',1,1);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='junior'),3,2,'第2节','morning','08:55','09:40',1,2);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='junior'),3,3,'第3节','morning','10:00','10:45',1,3);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='junior'),3,4,'第4节','morning','10:55','11:40',1,4);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='junior'),3,5,'第5节','morning','11:50','12:35',1,5);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='junior'),3,6,'第6节','afternoon','14:00','14:45',1,6);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='junior'),3,7,'第7节','afternoon','14:55','15:40',1,7);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='junior'),3,8,'第8节','afternoon','15:50','16:35',1,8);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='junior'),4,1,'第1节','morning','08:00','08:45',1,1);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='junior'),4,2,'第2节','morning','08:55','09:40',1,2);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='junior'),4,3,'第3节','morning','10:00','10:45',1,3);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='junior'),4,4,'第4节','morning','10:55','11:40',1,4);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='junior'),4,5,'第5节','morning','11:50','12:35',1,5);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='junior'),4,6,'第6节','afternoon','14:00','14:45',1,6);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='junior'),4,7,'第7节','afternoon','14:55','15:40',1,7);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='junior'),4,8,'第8节','afternoon','15:50','16:35',1,8);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='junior'),5,1,'第1节','morning','08:00','08:45',1,1);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='junior'),5,2,'第2节','morning','08:55','09:40',1,2);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='junior'),5,3,'第3节','morning','10:00','10:45',1,3);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='junior'),5,4,'第4节','morning','10:55','11:40',1,4);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='junior'),5,5,'第5节','morning','11:50','12:35',1,5);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='junior'),5,6,'第6节','afternoon','14:00','14:45',1,6);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='junior'),5,7,'第7节','afternoon','14:55','15:40',1,7);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='junior'),5,8,'第8节','afternoon','15:50','16:35',1,8);

-- 高中作息
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),1,1,'早读','morning','07:30','07:55',1,1);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),1,2,'第1节','morning','08:00','08:45',1,2);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),1,3,'第2节','morning','08:55','09:40',1,3);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),1,4,'第3节','morning','10:00','10:45',1,4);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),1,5,'第4节','morning','10:55','11:40',1,5);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),1,6,'第5节','morning','11:50','12:35',1,6);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),1,7,'第6节','afternoon','14:00','14:45',1,7);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),1,8,'第7节','afternoon','14:55','15:40',1,8);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),1,9,'第8节','afternoon','15:50','16:35',1,9);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),1,10,'第9节','afternoon','16:45','17:30',1,10);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),1,11,'晚自习1','evening','19:00','19:45',1,11);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),1,12,'晚自习2','evening','19:55','20:40',1,12);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),1,13,'晚自习3','evening','20:50','21:35',1,13);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),2,1,'早读','morning','07:30','07:55',1,1);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),2,2,'第1节','morning','08:00','08:45',1,2);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),2,3,'第2节','morning','08:55','09:40',1,3);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),2,4,'第3节','morning','10:00','10:45',1,4);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),2,5,'第4节','morning','10:55','11:40',1,5);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),2,6,'第5节','morning','11:50','12:35',1,6);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),2,7,'第6节','afternoon','14:00','14:45',1,7);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),2,8,'第7节','afternoon','14:55','15:40',1,8);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),2,9,'第8节','afternoon','15:50','16:35',1,9);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),2,10,'第9节','afternoon','16:45','17:30',1,10);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),2,11,'晚自习1','evening','19:00','19:45',1,11);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),2,12,'晚自习2','evening','19:55','20:40',1,12);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),2,13,'晚自习3','evening','20:50','21:35',1,13);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),3,1,'早读','morning','07:30','07:55',1,1);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),3,2,'第1节','morning','08:00','08:45',1,2);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),3,3,'第2节','morning','08:55','09:40',1,3);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),3,4,'第3节','morning','10:00','10:45',1,4);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),3,5,'第4节','morning','10:55','11:40',1,5);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),3,6,'第5节','morning','11:50','12:35',1,6);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),3,7,'第6节','afternoon','14:00','14:45',1,7);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),3,8,'第7节','afternoon','14:55','15:40',1,8);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),3,9,'第8节','afternoon','15:50','16:35',1,9);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),3,10,'第9节','afternoon','16:45','17:30',1,10);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),3,11,'晚自习1','evening','19:00','19:45',1,11);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),3,12,'晚自习2','evening','19:55','20:40',1,12);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),3,13,'晚自习3','evening','20:50','21:35',1,13);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),4,1,'早读','morning','07:30','07:55',1,1);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),4,2,'第1节','morning','08:00','08:45',1,2);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),4,3,'第2节','morning','08:55','09:40',1,3);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),4,4,'第3节','morning','10:00','10:45',1,4);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),4,5,'第4节','morning','10:55','11:40',1,5);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),4,6,'第5节','morning','11:50','12:35',1,6);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),4,7,'第6节','afternoon','14:00','14:45',1,7);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),4,8,'第7节','afternoon','14:55','15:40',1,8);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),4,9,'第8节','afternoon','15:50','16:35',1,9);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),4,10,'第9节','afternoon','16:45','17:30',1,10);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),4,11,'晚自习1','evening','19:00','19:45',1,11);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),4,12,'晚自习2','evening','19:55','20:40',1,12);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),4,13,'晚自习3','evening','20:50','21:35',1,13);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),5,1,'早读','morning','07:30','07:55',1,1);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),5,2,'第1节','morning','08:00','08:45',1,2);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),5,3,'第2节','morning','08:55','09:40',1,3);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),5,4,'第3节','morning','10:00','10:45',1,4);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),5,5,'第4节','morning','10:55','11:40',1,5);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),5,6,'第5节','morning','11:50','12:35',1,6);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),5,7,'第6节','afternoon','14:00','14:45',1,7);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),5,8,'第7节','afternoon','14:55','15:40',1,8);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),5,9,'第8节','afternoon','15:50','16:35',1,9);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),5,10,'第9节','afternoon','16:45','17:30',1,10);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),5,11,'晚自习1','evening','19:00','19:45',1,11);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),5,12,'晚自习2','evening','19:55','20:40',1,12);
INSERT INTO time_slot(stage_id,day_of_week,period_index,period_name,segment,start_time,end_time,is_teaching,sort_order) VALUES((SELECT id FROM stage WHERE code='senior'),5,13,'晚自习3','evening','20:50','21:35',1,13);
